# Terraform — Gesway na AWS (5º semestre)

Infraestrutura da ADR-004 (revisão de 24/10/2026) e do Documento 05: **um nó k3s em EC2
`t3.small`**, RDS PostgreSQL 17 em subnet privada, S3 para os PDFs e ECR para as imagens,
na região `sa-east-1`, dentro do **plano gratuito de créditos**. Sem NAT Gateway, sem ALB,
sem Multi-AZ, sem Route 53.

> O Documento 05 v1.1 ainda descreve dois nós `t3.micro` (decisão de 10/10). Este código
> segue a ADR-004 de 24/10, que é a vigente: nó único `t3.small`, sem rede entre nós.

## Estrutura

```
terraform/
├── bootstrap/            # UMA vez, permanente: bucket do state, ECR (3 repos, 2 imagens cada),
│                         # role OIDC do GitHub Actions para push no ECR, AWS Budgets diário e mensal
├── providers.tf          # AWS ~> 5, backend S3 com lock nativo (use_lockfile)
├── main.tf · variables.tf · outputs.tf
├── modules/
│   ├── networking/       # VPC 10.0.0.0/16, subnet pública, 2 privadas de dados, IGW, sg-node, sg-db
│   ├── compute/          # EC2 t3.small, Elastic IP, IMDSv2, user-data que instala o k3s
│   ├── database/         # RDS db.t3.micro Single-AZ, force_ssl, sem backup nem snapshot final
│   ├── storage/          # bucket privado dos PDFs, force_destroy
│   └── iam/              # instance profile: pull do ECR, leitura e escrita no bucket de PDFs
└── environments/dev/     # backend.hcl e terraform.tfvars.example
```

O RabbitMQ, o Prometheus, o Grafana e o nginx **não** têm módulo: rodam dentro do k3s e
vêm dos manifests de `infra/k8s/`. O Terraform cuida do que é AWS; o Kubernetes, do que
roda no cluster.

## Pré-requisitos

- Terraform 1.10 ou superior (o lock no S3 depende disso).
- Conta AWS no plano gratuito de créditos e um **usuário IAM** com `aws configure` feito.
  Nunca o `root` da conta.
- Um par de chaves criado no console EC2 em `sa-east-1`, informado em `key_name`.
  É obrigatório: o kubeconfig sai do nó por SSH.

## Uma vez só: bootstrap

```bash
cd terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars    # e-mail do alerta de custo
terraform init
terraform apply
```

Se o nome `gesway-tfstate` já existir na AWS, troque `state_bucket_name` aqui e o
`bucket` em `environments/dev/backend.hcl`.

Se a conta já tiver o provider OIDC do GitHub, o apply falha com `EntityAlreadyExists`.
Importe e rode de novo:

```bash
terraform import aws_iam_openid_connect_provider.github \
  arn:aws:iam::<conta>:oidc-provider/token.actions.githubusercontent.com
```

**Depois do 1º apply, leve o state do bootstrap para o bucket**, para não depender da
máquina de quem rodou. Acrescente em `bootstrap/main.tf`, dentro do bloco `terraform`:

```hcl
backend "s3" {
  bucket       = "gesway-tfstate"
  key          = "bootstrap/terraform.tfstate"
  region       = "sa-east-1"
  encrypt      = true
  use_lockfile = true
}
```

e rode `terraform init -migrate-state`. Até lá, o `bootstrap/terraform.tfstate` local é o
único registro desses recursos.

O alerta diário (US$ 1) só dispara com recurso esquecido ligado: uma sessão de 4 h fica
perto de US$ 0,35. O mensal (US$ 10) avisa uso bem acima do previsto.

Saídas para o GitHub: `ci_role_arn` vai no secret `AWS_ROLE_ARN`, usado pelo
`aws-actions/configure-aws-credentials` com `permissions: id-token: write`.

## Antes do 1º apply

Conferir em https://update.k3s.io/v1-release/channels qual minor do k3s está em suporte,
fixar em `k3s_channel` (ex. `"v1.34"`) e validar os manifests de `infra/k8s/` nela. O
padrão `"stable"` funciona, mas muda de minor sem aviso entre sessões.

## Ciclo de cada sessão

```bash
cd terraform
cp environments/dev/terraform.tfvars.example environments/dev/terraform.tfvars   # 1ª vez: seu IP /32
terraform init -backend-config=environments/dev/backend.hcl                      # 1ª vez
```

1. **Subir:** `terraform apply -var-file=environments/dev/terraform.tfvars`
   (rede, nó, RDS e bucket; cerca de 6 a 10 min, a maior parte é o RDS).
   Se o IP de alguém mudar no meio da sessão, rodar o apply de novo só muda o `sg-node`:
   a AMI está em `ignore_changes`, então o nó não é recriado.
2. **Esperar o k3s:** o user-data instala o k3s no primeiro boot, tentando de novo por até
   ~5 min se a rede ou a credencial do nó ainda não estiverem prontas. Log no nó em
   `/var/log/gesway-k3s.log`; a última linha é `k3s pronto em ...` ou `DESISTI: ...`.
3. **kubeconfig:** `eval "$(terraform output -raw kubeconfig_cmd)"` e
   `export KUBECONFIG=~/.kube/gesway-aws.yaml`.
4. **Bancos por serviço:** criar `gesway_core` e `gesway_analytics` (e `gesway_b2b`,
   quando o serviço existir), cada um com usuário próprio, a partir de um pod no cluster.
   O Terraform roda fora da VPC e não alcança o RDS. Host e senha mestre:
   `terraform output db_host` e `terraform output -raw db_master_password`.
5. **Aplicar os manifests** de `infra/k8s/` com as imagens do ECR e os secrets gerados na
   hora, emitir o certificado do Let's Encrypt e rodar `migrate` e `seed` contra o RDS.
6. **Webhook do Asaas:** apontar para `terraform output -raw webhook_pix_url`. A URL muda a
   cada sessão, junto com o IP.
7. **Derrubar, na mesma hora:** `terraform destroy -var-file=environments/dev/terraform.tfvars`.
   Conferir no console que não sobrou EC2, RDS nem Elastic IP.

## Regras que o código já impõe

| Regra (ADR-004) | Onde |
|---|---|
| Nunca acima de `t3.small` | validação de `instance_type` |
| Nunca cobrar CPU excedente | `cpu_credits = "standard"` |
| SSH e API do k3s só do IP da equipe | validação de `team_cidrs` (só `/32`) e `sg-node` |
| Banco fora da internet | subnets de dados sem rota, `publicly_accessible = false`, `sg-db` só do `sg-node` |
| Banco com SSL | `rds.force_ssl = 1` |
| Dados efêmeros | `backup_retention_period = 0`, `skip_final_snapshot = true`, `force_destroy` no bucket |
| Sem chave no cluster nem no CI | instance profile no nó; OIDC no GitHub Actions |
| Pod não lê a credencial do nó | IMDSv2 com `http_put_response_hop_limit = 1` |
| State só por TLS | bucket policy com `aws:SecureTransport` em Deny |
| Alerta de custo | AWS Budgets diário (US$ 1) e mensal (US$ 10), custo antes dos créditos |

## Ainda não ligado

- **Código do S3:** o cliente `services/core-service/database/connections/minio.js` tem a
  região fixa em `us-east-1` e exige credencial estática. Precisa aceitar região
  configurável e a cadeia padrão do SDK antes de trocar o MinIO pelo S3 (Documento 05 §3.5).
  **Junto com essa troca:** subir o hop limit do IMDS para 2 **e** criar uma NetworkPolicy
  de egress que bloqueie `169.254.169.254/32` para todo pod que não seja o `core-service`.
  Sem a policy, uma SSRF no nginx ou no Grafana leria os PDFs com CPF e RG.
- **Credencial só de leitura para a URL assinada:** a role do nó tem Put e Delete no
  bucket. O Documento 05 §3.5 pede que a URL de download seja assinada por credencial
  com só `s3:GetObject`.
- **Overlay `aws` do kustomize** em `infra/k8s/`: imagens do ECR, `POSTGRES_HOST` do RDS,
  uma réplica por serviço e sem os pods de Postgres e MinIO.
- **Workflow de push no ECR** no GitHub Actions, usando o `ci_role_arn`.
