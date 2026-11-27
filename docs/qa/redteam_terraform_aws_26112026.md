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

---

## Re-auditoria de 26/11 (commit 0c42379)

**Escopo:** `git diff 73f634e..0c42379 -- terraform docs`. `terraform fmt -check -recursive` verde; `terraform validate` verde na raiz e em `bootstrap/`. Nenhum `plan`/`apply` contra a AWS.

> Observação de processo: este relatório foi incluído no commit 0c42379 pelo dono da branch. O contrato da auditoria era não commitá-lo. A seção abaixo está só na árvore de trabalho.

### Status dos 14 achados

| # | Achado | Status | Onde |
|---|--------|--------|------|
| 1 | Budgets dispara em toda sessão | **Resolvido em parte**: diário de US$ 1 e mensal de US$ 10, ambos ACTUAL. Ficou lacuna de RDS órfão (novo N1) | `terraform/bootstrap/main.tf:192-238`, `terraform/bootstrap/variables.tf:29-39` |
| 2 | Hop 2 do IMDS expõe a credencial do nó | **Resolvido**: hop 1. A condição para voltar a 2 (NetworkPolicy de egress) está no comentário e no README | `terraform/modules/compute/main.tf:29-37`, `terraform/README.md:135-139` |
| 3 | Primeiro boot sem rede ou credencial aborta | **Resolvido em parte**: laço `tentar` em rede, STS, token e instalador. O teto "~5 min" não vale sem timeout de conexão (novo N3) | `terraform/modules/compute/user-data.sh.tftpl:9-52` |
| 4 | Sem `key_name` não há kubeconfig | **Resolvido**: variável obrigatória com validação, example e README atualizados. Ver N4 | `terraform/variables.tf:38-46`, `terraform/modules/compute/variables.tf:25-28`, `terraform/README.md:37-38` |
| 5 | AMI do SSM recria o nó em re-apply | **Resolvido** | `terraform/modules/compute/main.tf:56-60` |
| 6 | k3s fora de suporte | **Resolvido em parte**: `k3s_channel` com padrão `stable` e instrução de fixar a minor. Sem fixação, cada sessão pode subir uma minor diferente, e o canal não tem validação (novo N5) | `terraform/variables.tf:48-56`, `terraform/README.md:83-86` |
| 7 | Egress 80 sem consumidor | **Resolvido**: regra removida. Ver N2 sobre o HTTP-01 | `terraform/modules/networking/main.tf:105-113` |
| 8 | Comentário da IAM prometia só `GetObject` | **Resolvido**: comentário corrigido e pendência no README | `terraform/modules/iam/main.tf:1-6`, `terraform/README.md:140-142` |
| 9 | `.gitignore` incompleto | **Resolvido**: `*.tfvars`, `*.auto.tfvars`, `override*` e `.terraformrc`, com `!*.tfvars.example` preservado | `terraform/.gitignore:6-15` |
| 10 | Senha no state; bucket sem TLS | **Resolvido**: bucket policy com Deny em `aws:SecureTransport=false`; não conflita com o PAB porque Deny não é policy pública | `terraform/bootstrap/main.tf:59-73` |
| 11 | State do bootstrap local | **Resolvido em parte (documental)**: o README manda migrar após o 1º apply. Não há como fazer antes de o bucket existir, o que é aceitável | `terraform/README.md:61-75` |
| 12 | OIDC provider único por conta | **Resolvido (documental)**: `terraform import` no README | `terraform/README.md:52-58` |
| 13 | ECR `tagStatus any` com provenance | **Resolvido em parte**: regras `untagged` (1 dia) e `tagged` com `["*"]` (2). A dúvida sobre filhos sem tag de um índice continua (novo N6) | `terraform/bootstrap/main.tf:101-132` |
| 14 | Divergências com o Documento 05 | **Resolvido**: 5 divergências listadas para a v1.2 | `docs/historico_sessao/weslley/terraform_aws_26nov2026.md` (seção Decisões) |

### Verificação das correções pedidas

- **`tentar` com `set -euo pipefail`:** correto. A função chamada dentro de `if "$@"` roda com errexit suspenso. A falha volta como status e o laço tenta de novo. `obter_token` atribui à variável global `TOKEN`, inicializada em `""` (linha 27, sem problema com `set -u`). O status da atribuição é o da substituição de comando, então uma falha do `aws ecr` é detectada. Depois de 60 tentativas, `return 1` no nível de cima encerra o script pelo `set -e` com `DESISTI` no log. O token não vai para o log: só `$*` = `obter_token` é impresso.
- **`<` em `eviction-hard`:** literal dentro das aspas duplas (linha 49). O instalador grava os argumentos com aspas na `ExecStart` do systemd, onde `<` não tem significado. Nada mudou em relação à versão anterior.
- **`k3s --version | head -1` com `pipefail` (linha 54):** uma eventual falha dentro de `$(...)` em argumento de `echo` não altera o status do `echo`. Sem risco.
- **Validação de `key_name`:** a variável é obrigatória. A validação barra string vazia ou em branco. Ver N4 para o caso de `null` explícito e de par inexistente.
- **Lifecycle do ECR:** sintaxe válida (`tagPatternList` aceita curinga; `tagStatus=tagged` exige lista de padrão ou prefixo, e ela existe). Ver N6.
- **Bucket policy de TLS:** correta, com os ARNs de bucket e objetos.
- **Budgets:** `DAILY` em budget de COST é suportado e só aceita notificação ACTUAL, como foi feito. Ver N1.
- **Remoção do egress 80:** NTP (169.254.169.123), IMDS e DNS do Amazon são link-local e não passam pelo SG. Os repositórios do AL2023, o `get.k3s.io`, o `update.k3s.io` (canal), o `rpm.rancher.io`, o ECR, o S3 e a ACME usam 443. Ver N2 para o único caso que quebra.
- **`ignore_changes = [ami]`:** correto. Não conflita com `user_data_replace_on_change`, e uma substituição por outro motivo usa a AMI atual.

### Achados novos

#### 🟡 N1 [custo] O diário de US$ 1 não pega RDS órfão nem EIP órfão
**Onde:** `terraform/bootstrap/main.tf:192-218`, `terraform/bootstrap/variables.tf:29-33`
**Cenário:** um `destroy` falha no meio, por exemplo num timeout do RDS, e o nó é removido. O `db.t3.micro` com 20 GB fica ligado, a cerca de US$ 0,62/dia de instância mais storage, perto de US$ 0,70/dia. Isso fica abaixo do diário de US$ 1. O mensal de US$ 10 só dispara depois de cerca de 2 semanas, com 10 % do crédito garantido já gasto. Um EIP órfão (cerca de US$ 0,12/dia) nunca dispara nenhum dos dois. O comentário "o nó sozinho passa de US$ 1" também fica no limite: t3.small, EIP e EBS somam perto de US$ 1,03/dia, e só num dia UTC inteiro. A latência de dados do Budgets (8 a 24 h) adia o aviso para o dia seguinte. Preços estimados por tabela pública e não conferidos na conta (SUSPEITA quanto ao valor exato).
**Correção sugerida:** baixar o diário para cerca de US$ 0,60 (uma sessão de 4 h fica em US$ 0,35; duas sessões no mesmo dia gerariam um aviso tolerável). Ou acrescentar uma notificação de 60 % no diário. No README, manter a conferência de RDS e EIP no console depois do `destroy`, que já está no passo 7.

#### 🟡 N2 [correção] Sem egress 80, o self-check HTTP-01 do cert-manager não alcança o próprio EIP (SUSPEITA)
**Onde:** `terraform/modules/networking/main.tf:105-113` (só 443/53/5432 de saída)
**Cenário:** o README:passo 5 manda emitir o Let's Encrypt, sem dizer a ferramenta, e não há nada de cert-manager ou certbot em `infra/`. Se a equipe usar o cert-manager com HTTP-01, ele faz um self-check de dentro do cluster em `http://<ip>.sslip.io/.well-known/acme-challenge/...`. O sslip.io resolve para o EIP. O ServiceLB do k3s só reescreve o IP interno do nó, então o pacote sai pela ENI até o IGW e é barrado pelo egress do `sg-node`. O desafio fica preso em "propagation check failed", e não há HTTPS nem demonstração do webhook. O certbot `--standalone`/`--webroot` no nó não faz self-check e não é afetado.
**Correção sugerida:** decidir a ferramenta no overlay `aws`. Se for o cert-manager, recriar o egress 80 só para `${EIP}/32` no módulo raiz, que conhece os dois IDs, e não para `0.0.0.0/0`. Registrar a escolha no README.

#### 🟢 N3 [correção] O teto de "~5 min" não vale sem timeout de conexão
**Onde:** `terraform/modules/compute/user-data.sh.tftpl:3-5,21,22,39`; `terraform/README.md:100-102`
**Cenário:** antes do EIP, o `curl` sem `--connect-timeout`/`-m` espera o SYN do kernel (cerca de 2 min) em cada tentativa, e o `aws` tem os próprios timeouts e retries. No pior caso, 60 tentativas levam bem mais que 5 min. Na prática a rede volta na primeira ou segunda tentativa, mas o log e o README prometem um teto que o código não impõe. A instalação também pode travar sem `DESISTI`: o `k3s.service` usa `TimeoutStartSec=0`, e o `systemctl start` do instalador espera indefinidamente se o k3s não ficar pronto.
**Correção sugerida:** `curl --connect-timeout 5 -m 30`, `AWS_MAX_ATTEMPTS=1`/`--cli-connect-timeout 5` e, se quiser, `timeout 300 sh /root/k3s-install.sh`.

#### 🟢 N4 [correção] `key_name` não confere se o par existe, e o example traz um nome real
**Onde:** `terraform/variables.tf:38-46`, `terraform/environments/dev/terraform.tfvars.example:6`
**Cenário:** o dev copia o example sem criar o par `gesway-equipe`. O plano passa e o `apply` falha só no `aws_instance` (`InvalidKeyPair.NotFound`), depois que VPC, EIP e o RDS (6 a 10 min) já começaram. Fica um apply parcial, que precisa de `destroy`. Com `key_name = null` explícito, o `trimspace(null)` gera erro de função em vez da mensagem amigável, mas ainda bloqueia.
**Correção sugerida:** `data "aws_key_pair"` com `key_name = var.key_name` no módulo `compute`, para falhar no `plan`. Na validação, `var.key_name != null && length(trimspace(var.key_name)) > 0`.

#### 🟢 N5 [correção] `k3s_channel` sem validação e com padrão móvel
**Onde:** `terraform/variables.tf:48-56`
**Cenário:** com `"stable"`, duas sessões em semanas diferentes podem subir minors diferentes sem mudança no código. Um erro de digitação (`"1.34"` sem `v`, ou com espaço) só aparece no boot: o instalador falha 60 vezes e grava `DESISTI`.
**Correção sugerida:** `validation { condition = can(regex("^(stable|latest|v1\\.[0-9]+)$", var.k3s_channel)) }`. Fixar a minor no example quando a conta for criada.

#### 🟢 N6 [custo/correção] Regra `untagged` de 1 dia e manifests filhos de índice (SUSPEITA)
**Onde:** `terraform/bootstrap/main.tf:104-118`
**Cenário:** com buildx e provenance ligada (padrão do `docker/build-push-action`), a tag aponta para um *image index*. A imagem da plataforma e a attestation são manifests sem tag. Se o ECR não proteger os filhos referenciados por um índice com tag, a regra 1 os expira em 1 dia, e o `pull` da imagem mais recente falha na sessão seguinte. O comentário das linhas 104-105 descreve o risco ao contrário. Não confirmado: o comportamento atual do ECR com índices não foi verificado na documentação, e o workflow ainda não existe.
**Correção sugerida:** no workflow futuro, `provenance: false` e uma plataforma só (manifest simples, sem filhos). Conferir após o 1º push e um dia de espera que `docker pull` da tag ainda funciona.

### Veredito da re-auditoria
**APROVADO COM RESSALVAS.** Nenhum 🔴, antigo ou novo. Dos 14 achados, 9 estão resolvidos e 5 resolvidos em parte, por limitação documental aceitável ou pelos novos N1, N3, N5 e N6. Os novos 🟡 (N1, cobertura do alerta diário; N2, egress 80 e HTTP-01) não bloqueiam o merge num PR que não faz `apply`. N1 deve ser ajustado antes do 1º `apply` real, e N2 decidido junto com o overlay `aws`.
