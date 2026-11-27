# QA Red Team — Terraform da AWS (PR #242)
**Branch:** feature/terraform-aws · **Dev:** Weslley · **Base:** develop@c8a829b · **Data:** 26/11/2026
**Arquivos auditados:** 31 (todo o diff: `terraform/**` + relatório de sessão), mais as referências `infra/k8s/networkpolicy.yaml`, `infra/k8s/nginx.yaml`, `.github/workflows/`, ADR-004/005 e Documento 05 v1.1
**Achados no escopo:** 14 (🔴 0 · 🟡 6 · 🟢 8) · **Repassados:** 0

Verificação local: `terraform fmt -check -recursive` verde; `terraform validate` verde na raiz e em `bootstrap/` (Terraform 1.16.0). Nenhum `plan`/`apply` contra a AWS.

## Veredito
**APROVADO COM RESSALVAS**

Nenhum achado 🔴. Nada expõe rede, segredo ou bucket de forma direta, e nada sobrevive ao `destroy` fora do `bootstrap/`. As ressalvas 🟡 1 a 4 devem ser resolvidas antes do primeiro `apply` real: o alerta de custo não detecta o que promete detectar, o hop 2 do IMDS entrega a credencial do nó a qualquer pod sem que nada precise dela hoje, o primeiro boot pode falhar sem aviso, e sem `key_name` o passo 3 do README não tem saída.

## Achados no escopo

### 🟡 1 [custo] O AWS Budgets dispara em toda sessão e não detecta recurso esquecido
**Onde:** `terraform/bootstrap/main.tf:161-190` e `terraform/bootstrap/variables.tf:29-32`
**Cenário:** na conta do plano de créditos não existe cota gratuita por serviço. Todo uso entra no "custo antes dos créditos" (`include_credit = false`). Uma sessão normal de 4 h custa cerca de US$ 0,35 (ADR-004): t3.small, db.t3.micro, EIP e EBS. Isso passa do aviso de 10 % de US$ 1 (US$ 0,10) na **primeira** sessão do mês. O FORECASTED de 100 % também fica ligado o mês inteiro, porque o uso previsto é de cerca de US$ 4,70/mês. A equipe recebe e-mail a cada sessão e aprende a ignorar. Quando alguém esquecer o nó e o RDS ligados (cerca de US$ 2/dia), o alerta que chega é igual aos de sempre. O comentário da linha 161-162 ("qualquer centavo aqui é recurso fora do plano gratuito") está errado para esse plano.
**Regra violada:** ADR-004, Riscos mitigados: "Recurso esquecido ligado: ... alerta do AWS Budgets no mesmo dia"; "alerta muito antes do fim do saldo".
**Correção sugerida:** dois orçamentos. (a) Um `time_unit = "DAILY"` de cerca de US$ 1 em ACTUAL, que pega o nó esquecido (24 h ≈ US$ 2) e não toca numa sessão normal. (b) Um mensal acima do previsto (por exemplo US$ 10) para o saldo. Corrigir o comentário. Os dois primeiros orçamentos são gratuitos.

### 🟡 2 [segurança/LGPD] Hop limit 2 entrega a credencial do nó a qualquer pod, e nada precisa dela hoje
**Onde:** `terraform/modules/compute/main.tf:29-35`, `terraform/modules/iam/main.tf:22-40`; consequência em `infra/k8s/networkpolicy.yaml`, que só tem políticas de Ingress e nenhuma de Egress
**Cenário:** com `http_put_response_hop_limit = 2`, qualquer pod do k3s alcança `169.254.169.254` e pega a credencial da role do nó: o nginx (público na 443), o Grafana (com histórico de CVE de SSRF), o Prometheus e o RabbitMQ. Nenhuma NetworkPolicy de egress bloqueia isso. Uma SSRF ou RCE no nginx dá `s3:GetObject/PutObject/DeleteObject` em todo o bucket de PDFs, onde ficam os contratos com CPF e RG. Dá também leitura de todos os repositórios ECR da conta. Hoje o hop 2 não serve a ninguém: o próprio README (linhas 95-97) diz que `minio.js` ainda usa credencial estática e não fala com o S3. Os dados da nuvem são de seed, o que reduz o impacto. Mesmo assim, a exposição é desnecessária.
**Regra violada:** mínimo privilégio; LGPD art. 46 (medidas de segurança); Documento 05 §3.5 (credencial só com `s3:GetObject` para a URL assinada).
**Correção sugerida:** manter `http_put_response_hop_limit = 1` até o `minio.js` ser ajustado. Quando subir para 2, acrescentar ao overlay `aws` uma NetworkPolicy de egress que bloqueie `169.254.169.254/32` para todo pod, exceto o `core-service`. Registrar no README que essa dupla é pré-requisito.

### 🟡 3 [correção] O primeiro boot pode abortar sem rede e sem credencial, e o cloud-init não tenta de novo
**Onde:** `terraform/modules/networking/main.tf:29` (`map_public_ip_on_launch = false`), `terraform/modules/compute/main.tf:57-60` (EIP associado só depois de a instância estar `running`), `terraform/modules/compute/user-data.sh.tftpl:3,9,19`
**Cenário:** a instância nasce sem IP público. O EIP só é associado depois que o Terraform vê o estado `running`. Até lá, `aws ecr get-login-password` e `curl https://get.k3s.io` não têm rota de saída: subnet pública sem IP e sem NAT. O instance profile também acabou de ser criado no mesmo `apply`, e a credencial pode demorar a aparecer no IMDS. Com `set -euo pipefail`, uma falha qualquer encerra o script. O k3s não é instalado, o cloud-init não repete, e a equipe só descobre no passo 3, quando `k3s.yaml` não existe. Os timeouts do CLI e do TCP costumam cobrir a janela, mas isso não está garantido (SUSPEITA de tempo, não reproduzida).
**Regra violada:** correção / KISS operacional (o README promete que o user-data instala o k3s no primeiro boot).
**Correção sugerida:** antes do `aws ecr`, um laço curto de espera, por exemplo `until curl -sf -m 5 https://get.k3s.io -o /dev/null && aws sts get-caller-identity >/dev/null; do sleep 5; done`, com teto de cerca de 5 min. No fim, `echo` de sucesso ou falha explícita no log.

### 🟡 4 [correção/README] Sem `key_name` não há como obter o kubeconfig
**Onde:** `terraform/variables.tf:38-42` (default `null`), `terraform/outputs.tf:16-19`, `terraform/README.md:37,67`
**Cenário:** o dev segue o `.tfvars.example`, que deixa `key_name` comentado, e roda o `apply`. O nó sobe sem chave. O passo 3 (`eval "$(terraform output -raw kubeconfig_cmd)"`) faz SSH e falha. A role do nó não tem `AmazonSSMManagedInstanceCore`, então também não há Session Manager. O único caminho é destruir e recriar, o que custa outra emissão do Let's Encrypt e outra URL de webhook. O README apresenta o SSH como opcional ("Para SSH: ..."), mas o fluxo depende dele.
**Regra violada:** fidelidade README × código.
**Correção sugerida:** tornar `key_name` obrigatório (sem default) e descomentá-lo no example. A alternativa é anexar `AmazonSSMManagedInstanceCore` (o Session Manager não cobra) e trocar o `kubeconfig_cmd` por `aws ssm start-session`/`send-command`.

### 🟡 5 [correção] AMI lida do SSM sem `ignore_changes`: um re-apply no meio da sessão pode recriar o nó
**Onde:** `terraform/modules/compute/main.tf:5-7,17`
**Cenário:** o IP de um integrante muda no meio da sessão. Ele edita `team_cidrs` e roda `apply`. Se a AWS publicou um AL2023 novo desde o início da sessão, o `ami` muda e o plano recria a instância. O cluster k3s, o RabbitMQ, os PVs e o certificado somem, e é preciso emitir o Let's Encrypt de novo (com limite semanal). O EIP continua o mesmo, mas o cluster volta vazio. Num `apply` com `-auto-approve` isso passa despercebido.
**Regra violada:** correção / efeito colateral não pedido.
**Correção sugerida:** `lifecycle { ignore_changes = [ami] }` no `aws_instance.node`. Em sessão nova, depois do `destroy`, a AMI atual entra de qualquer jeito.

### 🟡 6 [segurança] k3s fixado numa versão fora de suporte
**Onde:** `terraform/variables.tf:44-47` (`v1.31.4+k3s1`)
**Cenário:** o Kubernetes 1.31 saiu do suporte upstream por volta de out/2025. Em nov/2026 o nó público (443 e 6443) roda um control plane sem correção de segurança há cerca de um ano, e até a patch `.4` é antiga dentro da própria 1.31. (Datas exatas de EOL não conferidas na fonte nesta auditoria.)
**Regra violada:** boas práticas de segurança de infraestrutura exposta.
**Correção sugerida:** fixar uma minor suportada no momento do primeiro `apply` (canal `stable` do k3s) e validar os manifests de `infra/k8s/` nela.

### 🟢 7 [segurança] Egress 80 aberto para 0.0.0.0/0 sem consumidor
**Onde:** `terraform/modules/networking/main.tf:105-121`
**Cenário:** o comentário justifica a regra pelo dnf, mas o user-data não chama o dnf, e os repositórios do AL2023 são servidos por HTTPS. A porta 80 fica livre para exfiltração em texto claro a partir de qualquer pod. SUSPEITA: o instalador do k3s pode chamar o dnf para o `k3s-selinux`, mas também por HTTPS.
**Correção sugerida:** remover a regra, ou justificá-la com o consumidor real.

### 🟢 8 [doc/IAM] O comentário promete "só s3:GetObject" e a role tem Put/Delete
**Onde:** `terraform/modules/iam/main.tf:3` × `:30`; Documento 05 §3.5
**Cenário:** o Documento 05 pede que a URL assinada use uma credencial que só tem `s3:GetObject`. O código assina com a role do nó, que também tem Put e Delete. A URL pré-assinada só autoriza a operação assinada, então o risco prático é baixo. O texto, porém, afirma uma restrição que não existe.
**Correção sugerida:** ajustar o comentário, ou registrar no Documento 05 v1.2 que a mesma role assina.

### 🟢 9 [Git] `.gitignore` não cobre outros nomes de tfvars nem override
**Onde:** `terraform/.gitignore:6`
**Cenário:** um dev cria `environments/dev/weslley.tfvars` ou `*.auto.tfvars` com o IP pessoal (dado pessoal), e o arquivo entra no `git add .`. `override.tf` e `.terraformrc` também não estão cobertos.
**Correção sugerida:** acrescentar `*.tfvars`, `*.auto.tfvars`, `override.tf`, `*_override.tf` e `.terraformrc`, mantendo `!*.tfvars.example`.

### 🟢 10 [segurança] Senha mestre do RDS em claro no state, e bucket do state sem exigir TLS
**Onde:** `terraform/modules/database/main.tf:8-11,41`; `terraform/bootstrap/main.tf:31-57`
**Cenário:** quem tem `s3:GetObject` no `gesway-tfstate` lê a senha mestre. Isso é aceitável num ambiente efêmero com SSE e PAB. Falta apenas uma bucket policy com `aws:SecureTransport = false → Deny`.
**Correção sugerida:** acrescentar a policy de TLS. Opcionalmente, citar no README que o state contém segredo.

### 🟢 11 [operação] State do bootstrap local, numa máquina só
**Onde:** `terraform/bootstrap/main.tf:4`, `terraform/README.md:48-50`
**Cenário:** com três devs, só quem rodou o bootstrap tem o state. Se ele perder o arquivo, ninguém consegue mudar o orçamento, os branches do OIDC ou os repositórios ECR sem `import`.
**Correção sugerida:** depois do primeiro `apply`, migrar o state do bootstrap para o próprio bucket (`key = "bootstrap/terraform.tfstate"`) com `terraform init -migrate-state`.

### 🟢 12 [correção] OIDC provider do GitHub é único por conta
**Onde:** `terraform/bootstrap/main.tf:104-108`
**Cenário:** se a conta já tiver o provider `token.actions.githubusercontent.com`, criado à mão ou por tutorial, o bootstrap falha com `EntityAlreadyExists`.
**Correção sugerida:** registrar no README a opção de `terraform import`.

### 🟢 13 [custo] ECR com `tagStatus = "any"` e build com attestation (SUSPEITA)
**Onde:** `terraform/bootstrap/main.tf:84-100`
**Cenário:** o `docker/build-push-action` gera manifest de provenance por padrão. Cada push vira mais de um "image" no ECR, e o limite de 2 pode expirar um artefato que ainda é referenciado. Não confirmado: o workflow ainda não existe.
**Correção sugerida:** no workflow futuro, usar `provenance: false`, ou contar só imagens `tagged`.

### 🟢 14 [fidelidade] Divergências com o Documento 05 v1.1 além dos dois nós
**Onde:** `terraform/variables.tf:33-36` (EBS 20 GB × 15 GB do Doc 05 §3.1/§3.5), `terraform/modules/networking/main.tf:105-145` (egress 80/53/5432 além do 443 do Doc 05 §4.2), `bootstrap/main.tf:102-158` (OIDC × usuário IAM do Doc 05 §3.7)
**Cenário:** todas seguem a ADR-004 ou são necessárias, mas o Documento 05 v1.2 precisa refleti-las. O PR registra só a divergência dos dois nós.
**Correção sugerida:** listar as quatro na pendência do Documento 05 v1.2.

## Repassados a outro dev
Nenhum. A ausência de NetworkPolicy de egress em `infra/k8s/` é da mesma trilha (Weslley, DIVISAO §3) e entrou como consequência do achado 2.

## O que foi verificado e está correto
- SG: 22 e 6443 só por `team_cidrs`, com validação de `/32` e lista não vazia; 80/443 públicos como no Documento 05 §4.2. O Terraform remove o egress padrão, então só as regras explícitas valem.
- RDS: `publicly_accessible = false`, subnets de dados na tabela principal (só rota local), `sg-db` com ingress só de `sg-node`, `rds.force_ssl = 1`, família `postgres17`, AZ igual à do nó (`public_az` = `az_a` = `dados[0]`), `backup_retention_period = 0`, `skip_final_snapshot`, `delete_automated_backups`, sem Performance Insights e sem Enhanced Monitoring.
- Nada sobrevive ao `destroy`: EIP gerenciado, EBS com `delete_on_termination`, bucket com `force_destroy`, sem log group, flow log ou snapshot.
- Sem NAT, ALB, Multi-AZ nem Route 53. `cpu_credits = "standard"`. Validação de `instance_type` (t3.small/t3.micro).
- User-data sem segredo: o token do ECR é buscado em runtime, o escape `$${TOKEN}` está correto, `registries.yaml` fica com 600 e não há `set -x`. O `\`+newline dentro das aspas de `INSTALL_K3S_EXEC` é válido.
- Ordem EIP → instância (`--tls-san`) → associação: sem ciclo.
- k3s sem Traefik: o Service `LoadBalancer` do nginx (`infra/k8s/nginx.yaml:214`) é atendido pelo ServiceLB, que continua ligado e publica 80/443 no nó.
- DNS no resolver `.2`, IMDS e NTP (169.254.169.123) são link-local e não passam pelo SG. Egress 443 cobre ECR, S3 de camadas, docker.io, get.k3s.io/GitHub, Asaas, ViaCEP e Let's Encrypt.
- OIDC: `aud` exato; `sub` sem curinga, só `ref:refs/heads/{develop,main}`. PR de fork (`sub = ...:pull_request`) não assume a role, e nenhum workflow do repositório usa `pull_request_target`. A policy de push está restrita aos ARNs dos repositórios. `github_repo` bate com o remote `origin`.
- Buckets: PAB completo nos dois, SSE AES256, `BucketOwnerEnforced` no de PDFs, versionamento e expiração de versões no do state. Nome do bucket de PDFs com sufixo aleatório.
- Git: nenhum `tfstate` ou `tfvars` real rastreado. `terraform.tfvars`, `*.tfstate*` e o lock info são ignorados (`git check-ignore`). Lockfiles versionados, como recomendado.
- Saída `db_master_password` marcada `sensitive`.

## Não foi possível verificar
- Comportamento real do `apply`: tempo do boot × associação do EIP (achado 3), propagação do instance profile, e o instalador do k3s no AL2023 (pacote `k3s-selinux`).
- Disponibilidade de `db.t3.micro` com a minor padrão do PG 17 em sa-east-1, e as cotas ou custos do ECR/S3 no plano de créditos (sem acesso à conta).
- Datas exatas de fim de suporte do k3s 1.31 (achado 6), sem consulta à fonte oficial.
- Workflow de push no ECR (ainda não existe), para confirmar o uso do `sub` e o caso de provenance.
