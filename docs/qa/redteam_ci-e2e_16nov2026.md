# QA Red Team — ci-e2e (roteiro da demonstração no CI) + MinIO compilado no k8s
**Branch:** feature/ci-e2e (PR #176, rascunho) · **Dev:** Weslley (trilha de CI/infra) · **Base:** develop@38936fe · **Data:** 16/11/2026
**Arquivos auditados:** 5 (`.github/workflows/ci-e2e.yml`, `frontend/e2e/README.md`, `infra/k8s/minio.yaml`, `start.sh`, `docs/infra/KUBERNETES.md`)
**Achados no escopo:** 9 (🔴 0 · 🟡 3 · 🟢 6) · **Repassados:** 0

Diffs auditados: `b41995c..feature/ci-e2e` (workflow + README) e `f79cb43..b41995c` (k8s/start.sh/doc).
Os 🟡 do red team `docs/qa/redteam_minio-build-do-fonte_16nov2026.md` (bases flutuantes, tag git
mutável, RELEASE repetida em três lugares) não são repetidos aqui.

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴. O job não vaza segredo útil, não roda com permissão de escrita, não usa
`pull_request_target` e não toca no `ci-frontend.yml`. As ressalvas são sobre o objetivo do job
(o aviso precisa chegar a alguém), sobre o consumo do cache do Actions e sobre o `cmd_up` com minikube.

## Achados no escopo

### 🟡-1 [não bloqueante / visibilidade] `continue-on-error` no job não é o que libera o merge, e pode apagar o aviso
**Onde:** `.github/workflows/ci-e2e.yml:35` (e o comentário em `:4-6`; `frontend/e2e/README.md:62-63`)
**Cenário:** um merge quebra o passo 7 no `push` para `develop`. Com `continue-on-error: true` no
job, a **execução do workflow** termina `success`. A lista do Actions mostra o run verde. O e-mail
"Run failed" sai pela conclusão do run, então não sai. O objetivo é avisar o time no dia da quebra,
e esse aviso some. Só o check run do job pode guardar o X vermelho.
Isso não foi observado: as duas execuções do run 43965215004 passaram.
Merge: `GET /branches/develop/protection` responde 404 e `rulesets` volta `[]`. Ou não há checks
obrigatórios, ou o token não tem acesso de admin para ver. Nos dois casos, quem impede o bloqueio é
o job ficar fora dos checks obrigatórios, não o `continue-on-error`. O comentário em `:4-6` põe os
dois no mesmo nível.
**SUSPEITA a confirmar:** o que o PR mostra quando o job falha com `continue-on-error`: X vermelho
ou check verde. Para confirmar, force uma falha antes de tirar do rascunho. Exemplo: um commit
temporário com `run: exit 1` antes do "Roteiro". Depois olhe três coisas: o PR, a lista do Actions
e a notificação.
**Regra violada:** critério do plano de fechamento §3, "o time recebe um aviso quando o roteiro quebra".
**Correção sugerida:** tirar o `continue-on-error`. O job continua não bloqueante enquanto não for
obrigatório, e a falha volta a ficar vermelha no run, no PR e no e-mail. Se ficar, documente onde o
aviso aparece de fato, e não dê o `continue-on-error` como o mecanismo que libera o merge.

### 🟡-2 [custo / cache] `cache-to mode=max` em todo PR grava cerca de 1 GB por PR no cache do Actions
**Onde:** `.github/workflows/ci-e2e.yml:103` (`cache-to: type=gha,scope=minio,mode=max`)
**Cenário:** `gh cache list` mostra hoje `refs/pull/176/merge` com 968 MB, quase todo do buildkit.
O cache do repositório tem 2,65 GB no total. O teto é 10 GB por repositório, com despejo dos itens
menos usados. Hoje o `develop` não tem cache do MinIO. Até o merge, cada PR novo para `develop`
compila do zero e grava mais ~1 GB no escopo do próprio PR. Com uns 7 a 8 PRs abertos na semana do
prazo, o despejo leva os caches de pnpm/npm dos outros workflows. Ele também leva o do MinIO, e a
compilação de ~6 min (1ª tentativa do run: 21:57–22:03) volta. Os blobs que já existem no `develop`
não deveriam ser reenviados depois do merge, mas isso não foi verificado.
Sobre envenenamento de cache: o escopo do PR (`refs/pull/N/merge`) não é lido pelo `develop`, então
um PR de fork não envenena o cache da base. Esse risco está fechado. A gravação a partir do PR só
gasta cota.
**Regra violada:** KISS/custo. Gravar cache em todo PR não traz ganho, porque o PR seguinte não lê
esse escopo.
**Correção sugerida:** gravar só no push para `develop`:
`cache-to: ${{ github.event_name == 'push' && 'type=gha,scope=minio,mode=max' || '' }}`. O PR lê o
cache do `develop` pelo `cache-from`.

### 🟡-3 [k8s / robustez] `cmd_up` compila no daemon do shell, não no do cluster, e não confere
**Onde:** `start.sh:57-62`, `infra/k8s/minio.yaml:37-38,87-88`
**Cenário:** um dev no minikube roda `./start.sh up` sem `eval $(minikube docker-env)`. O
`docker build` (vários minutos, `-q`, sem progresso) grava a imagem no daemon do host. O
`kubectl apply` cria `minio-0` com `imagePullPolicy: Never` e o pod cai em `ErrImageNeverPull`.
O `kubectl wait --timeout=120s` (`start.sh:66`) termina com o `timed out waiting for the condition`
genérico, sem apontar a causa. No kind ou no k3d/containerd o build no daemon nunca chega ao nó
(precisa de `kind load` / `k3d image import`). A dica só está num comentário do script (`:57`) e no
KUBERNETES.md. Quem roda o comando não vê nenhuma das duas.
O backend tem a mesma dependência, mas com `IfNotPresent` (`infra/k8s/backend.yaml:27`), e é
compilado à mão por quem leu o doc. O MinIO passou a ser compilado pelo script, que esconde o passo.
**Regra violada:** fail-safe com mensagem que diz o que fazer (padrão de erro do projeto).
**Correção sugerida:** antes do build, avisar e parar quando o contexto for minikube e
`MINIKUBE_ACTIVE_DOCKERD` estiver vazio. Exemplo:
`[[ $(kubectl config current-context) == minikube && -z ${MINIKUBE_ACTIVE_DOCKERD:-} ]] && err "Rode eval \$(minikube docker-env) antes."`.
Imprima também a fase "compilando, pode levar ~10 min" sem o `-q`, ou com `--progress=plain`.

### 🟢-1 [comentário enganoso] "o compose acha a imagem já carregada no daemon"
**Onde:** `.github/workflows/ci-e2e.yml:85-87`
**Cenário:** o log do run (passo "Subir o compose", 22:05:04) mostra
`Image gesway/minio:RELEASE.2025-10-15T17-29-55Z Building`, com todas as camadas `CACHED` e
`exporting to oci image format`. O `compose-up --build` **recompila** o MinIO. Ele não reaproveita
a imagem do `load: true`. O cache bate porque o `setup-buildx-action` (`use: true` por padrão)
deixa o builder `docker-container` como padrão, e o compose usa esse mesmo builder, já aquecido
pelo `cache-from`. Se alguém trocar o builder, ou passar `use: false`, o compose compila o MinIO
inteiro sem cache. O comentário leva a procurar o defeito no lugar errado.
**Correção sugerida:** reescrever o comentário assim: "o passo aquece o builder do buildx com o
cache do Actions; o `--build` do compose reusa esse builder". Outra opção: subir o compose sem
`--build` para o minio.

### 🟢-2 [pinagem] actions de terceiros por tag mutável
**Onde:** `.github/workflows/ci-e2e.yml:93,96` (`docker/setup-buildx-action@v3`, `docker/build-push-action@v6`)
**Cenário:** se a tag `v6` for sequestrada, como no caso tj-actions/changed-files em 2025, o código
novo roda com o `ACTIONS_RUNTIME_TOKEN`. No push para `develop` esse token grava no escopo de cache
da base. O estrago fica limitado: `contents: read` e nenhum segredo no job. O repo inteiro pina por
tag (`actions/*@v4`, `pnpm/action-setup@v4`), então a branch segue o padrão. Não é desvio.
**Correção sugerida:** pinar pelo SHA, com a tag em comentário, ao menos as duas da `docker/*`, que
são as únicas que não são `actions/*`.

### 🟢-3 [custo] Roda em PR só de docs
**Onde:** `.github/workflows/ci-e2e.yml:12-17`
**Cenário:** um PR que só grava `docs/qa/*.md` ou relatório de sessão sobe o compose inteiro e
roda o Playwright. São ~3 min com cache e ~6 min sem. O repo é público, então não há cobrança de
minutos, mas o PR fica na fila do runner e ganha mais um check para esperar. A justificativa
"quebra por mudança em qualquer serviço" (`:9`) não cobre Markdown.
**Correção sugerida:** `paths-ignore: ['docs/**', '**/*.md']` no `pull_request`, mantendo o
`workflow_dispatch`.

### 🟢-4 [robustez] Folga zero no limite de login e artefato perdido em timeout
**Onde:** `docker/nginx/default.conf:1,45` · `frontend/e2e/playwright.config.ts:13` · `.github/workflows/ci-e2e.yml:130,140`
**Cenário (a):** `rate=5r/m burst=3 nodelay` aceita 4 logins de uma vez. Uma rodada faz exatamente
4 (globalSetup + 3 usuários). Hoje os logins se espalham por ~50 s e o balde repõe 1 a cada 12 s,
então passa. Um 5º login acrescentado ao roteiro, ou um `retries: 1`, pode bater 429 no CI.
**Cenário (b):** se o roteiro travar até o `timeout-minutes: 45`, o job é cancelado. Aí `failure()`
é falso, e nem o relatório do Playwright nem os logs do compose são publicados, justo na falha mais
difícil de diagnosticar.
**Correção sugerida:** (a) registrar no `helpers.ts` que 4 é o teto. (b) `if: failure() || cancelled()`
nos dois passos de diagnóstico.

### 🟢-5 [comentário/doc] README diz "todo PR", mas o job também roda no push para `develop`
**Onde:** `frontend/e2e/README.md:62-63`
**Cenário:** quem lê o README não sabe que o run do `develop` existe, e por 🟡-1 esse run fica verde
mesmo quando o job falha.
**Correção sugerida:** acrescentar "e em todo push para `develop`".

### 🟢-6 [grep da tag] pega só a 1ª ocorrência e engole qualquer caractere colado
**Onde:** `start.sh:59`, `.github/workflows/ci-e2e.yml:90`
**Cenário (a):** um comentário com `` `gesway/minio:RELEASE.x` `` acima da linha `image:` passa a
ser o 1º match. O `[^[:space:]]*` captura também a crase, e o `docker build -t` falha com
`invalid reference format`. A falha é ruidosa, sem dano.
**Cenário (b):** o manifest tem duas linhas `image:` (`minio.yaml:37` e `:87`). Se só uma for
trocada, o script compila só a 1ª, e o sidecar `setup` fica em `ErrImageNeverPull`.
**Cenário (c):** no CI, grep vazio vira `tags:` vazio. O build não falha, e o compose compila
sozinho, então ninguém percebe.
(A divergência entre o Dockerfile e as tags já é o 🟡-3 do red team anterior.)
**Correção sugerida:** ancorar em `image:` (`grep -m1 -oP '^\s*image:\s*\Kgesway/minio:RELEASE\S+'`),
conferir que as duas linhas do manifest são iguais, e no CI parar com erro quando a tag vier vazia.

## Repassados a outro dev
Nenhum. CI, `start.sh` e `infra/k8s` são da trilha do Weslley (DIVISAO_TRABALHO §3, linhas 40-41).

## O que foi verificado e está correto
- `permissions: contents: read` no topo. O gatilho é `pull_request`, não `pull_request_target`.
  O PR de fork roda sem segredo e com token só de leitura.
- Nenhum segredo do repositório é usado. As senhas do `.env` vêm de `openssl rand -hex 16` por
  execução. O `docker compose config -q` falha cedo se faltar alguma variável `:?`.
  `PIX_PROVIDER=fake`, e `ASAAS_*` ficam vazias.
- O log do run 43965215004 mostra só o texto do script `sed`, não os valores gerados.
  `minio-setup.sh` e `rabbitmq-setup.sh` não ecoam senha. `docker compose logs` em falha mostra a
  saída dos contêineres, não o env.
- Chaves JWT geradas no runner, privada em 0600. O `chown 1000:1000` só troca o dono para o
  `USER node`. A chave não entra no artefato (`playwright-report/`, `test-results/`).
- Artefato só em `failure()`, com retenção de 3 dias. O repo é **público**: qualquer usuário logado
  baixa o trace. Ele contém JWT assinados por uma chave que morre com o runner, e a senha
  `senha123`, que já está versionada no seed. Não é um vazamento novo.
- `concurrency` por `github.ref` com cancelamento, como nos outros workflows.
- O aquecimento do Vite está no `globalSetup` (`frontend/e2e/global-setup.ts:65`), feito com o JWT
  da API, sem gastar login pela tela. `E2E_API_URL` fica em localhost e o globalSetup recusa outro host.
- `docker compose down -v --remove-orphans` em `always()`.
- `ci-frontend.yml` fora do diff. O diff da branch contra `b41995c` tem só 2 arquivos.
- `imagePullPolicy: Never` nos dois contêineres do `minio.yaml`: nenhum pull de `docker.io/gesway/*`.
- O build do `cmd_up` é anterior ao `kubectl apply` e para com `err` se a tag não existir ou o build falhar.

## Não foi possível verificar
- **Como o PR mostra a falha com `continue-on-error`** (🟡-1): só houve execuções verdes. É preciso
  forçar uma falha.
- **Proteção de branch / checks obrigatórios:** a API devolve 404 (sem proteção, ou sem acesso de
  admin no token). O Gabriel confirma nas Settings que o job não está como obrigatório.
- **Reenvio de blobs do cache depois do merge** (🟡-2): o `develop` ainda não tem cache do MinIO.
- **`cmd_up` contra cluster real** (minikube/kind/Docker Desktop): não foi executado. A análise de
  🟡-3 é pela leitura do código.

## Desfecho (16/11/2026)

Corrigidos no PR #176. O Weslley pediu os 🟡-1 e 🟡-2 e os 🟢 de baixo custo.

- **🟡-1, corrigido.** O `continue-on-error` saiu. Para conferir, um commit temporário com `exit 1` foi enviado e depois revertido. Com ele, o run 43970739873 deu `failure` e o check ficou vermelho no PR, mas o PR seguiu `MERGEABLE` (estado `UNSTABLE`). O job avisa sem bloquear, porque não está entre os checks obrigatórios.
- **🟡-2, corrigido.** O `cache-to` só grava quando `github.ref == refs/heads/develop`. No run 43970960860, o PR leu o cache, sem exportar nada.
- **🟢 corrigidos:**
  - comentário sobre como o cache do MinIO é reaproveitado;
  - `paths-ignore` para `docs/**` e `**/*.md`;
  - o passo falha se a tag do MinIO sair vazia;
  - README com os gatilhos certos.
- **Pendências:**
  - 🟡-3: o `start.sh` no minikube sem `minikube docker-env`;
  - 🟢: actions `docker/*` pinadas por SHA;
  - 🟢: nenhuma folga no limite de login;
  - 🟢: timeout de 45 min sem logs;
  - 🟢: grep da tag no `minio.yaml`.
- **Verificação final:** run 43970960860, com 7 passed (54,5 s), MinIO todo `CACHED`, job em 2 min 35 s e PR em `CLEAN`.
