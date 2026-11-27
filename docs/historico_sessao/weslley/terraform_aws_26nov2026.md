# Terraform da AWS — 26/11/2026

**Dev:** Weslley (sessão orquestrada com Claude Code)
**Branch:** `feature/terraform-aws`

## O que foi feito

- Conferido que o repositório não tinha nenhum `.tf`, nem em outra branch.
- Criado `terraform/` seguindo a ADR-004 (revisão de 24/10: nó único `t3.small`) e o
  Documento 05 (rede, Security Groups, state no S3):
  - `bootstrap/`: bucket do state com versionamento, 3 repositórios ECR com *lifecycle* de
    2 imagens, role OIDC do GitHub Actions para push no ECR, AWS Budgets de US$ 1.
  - `modules/networking`, `compute`, `database`, `storage`, `iam` e o módulo raiz.
  - `README.md` com o ciclo de cada sessão (apply, k3s, bancos por serviço, manifests,
    webhook, destroy).
- `terraform fmt -check` e `terraform validate` verdes nos dois diretórios (Terraform
  1.16.0, provider aws 5.100.0, random 3.9.1). **Nenhum recurso foi criado na AWS.**

## qa-redteam

Relatório em `docs/qa/redteam_terraform_aws_26112026.md`: aprovado com ressalvas, nenhum
🔴. Todos os 14 achados foram tratados na mesma branch:

- 🟡 Budgets: o alerta de 10 % de US$ 1 disparava em toda sessão. Agora são dois: diário
  de US$ 1 (só dispara com recurso esquecido) e mensal de US$ 10.
- 🟡 IMDS com hop 1: nenhum pod alcança a credencial do nó. Subir para 2 só junto com
  NetworkPolicy de egress, quando o `minio.js` falar com o S3 (registrado no README).
- 🟡 user-data tenta de novo rede, credencial do nó, token do ECR e instalador do k3s,
  por até ~5 min, e escreve `DESISTI` no log se não conseguir.
- 🟡 `key_name` obrigatório, com validação: sem SSH não havia como pegar o kubeconfig.
- 🟡 `ignore_changes = [ami]`: um apply no meio da sessão não recria o nó.
- 🟡 k3s por canal (`k3s_channel`, padrão `stable`) no lugar da `v1.31.4+k3s1` fora de
  suporte; o README manda fixar a minor em suporte antes do 1º apply.
- 🟢 egress 80 removido; comentário da IAM corrigido; `.gitignore` cobre todo `*.tfvars`
  e os `override.tf`; bucket do state só aceita TLS; README explica migrar o state do
  bootstrap para o bucket e importar o provider OIDC se já existir; lifecycle do ECR
  conta só imagens com tag e remove as sem tag após 1 dia.

## Decisões

- Segui a ADR-004 de 24/10, não o Documento 05 v1.1. Divergências a levar para a v1.2
  do Documento 05:
  1. um nó `t3.small`, não dois `t3.micro`;
  2. EBS de 20 GB, não 2 × 15 GB, e sem *swapfile*;
  3. egress do `sg-node` com 53 (DNS da VPC) e 5432 (RDS) além do 443;
  4. CI por OIDC (ADR-004), não por usuário IAM com chave (§3.7);
  5. AWS Budgets diário de US$ 1 e mensal de US$ 10, não um único de US$ 1 (§3.6).
- Backend S3 com configuração parcial (`environments/dev/backend.hcl`), para o nome do
  bucket poder mudar se `gesway-tfstate` já existir na AWS.

## Pendências (5º semestre)

- `minio.js` com região fixa `us-east-1` e credencial estática: ajustar para o S3.
- Overlay `aws` do kustomize em `infra/k8s/`.
- Workflow de push no ECR usando o `ci_role_arn`.
- Script ou Job para criar os databases e usuários por serviço no RDS.
- Primeiro `terraform apply` real: só com a conta do plano de créditos criada perto do
  início do 5º semestre (ADR-004).
