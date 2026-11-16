# MinIO compilado do fonte e roteiro e2e no CI — 16/11/2026

Dev: Weslley (IA orquestrada). Branches: `fix/minio-build-do-fonte` e `feature/ci-e2e` (empilhada
sobre a primeira; PR #176) e `fix/start-seed-hoje` (PR #177), todas a partir do `develop@38936fe`.

## Objetivo

Fechar três itens do fechamento do MVP (`docs/delegacoes/fechamento_mvp_weslley_15nov2026.md`):

1. 🔴 a imagem do MinIO, que dava 401 num computador limpo;
2. o roteiro e2e no CI, avisando sem bloquear (até 22/11);
3. o `seed_hoje.sql` no `./start.sh seed` do k8s.

Confirmado com o Weslley: a chave do Asaas já foi trocada e vale até julho de 2027.

## O que foi feito

| Entrega | Onde | Como foi verificado |
|---|---|---|
| `docker/minio/Dockerfile` compila o `minio` (RELEASE.2025-10-15T17-29-55Z) e o `mc` (RELEASE.2025-08-13T08-35-41Z) do GitHub. Bases fixadas por digest (`golang:1.27-alpine`, `alpine:3.24`) e commit de cada tag conferido depois do clone | PR #176 | Máquina limpa no compose: tag do quay removida do cache, `down -v` e `up -d --build`. Resultado: `minio` healthy, `minio-setup` `Exited (0)`, e `minio --version`/`mc --version` com a RELEASE e o commit certos. No CI, compilou sem cache com o Go 1.27 |
| Compose: `build` mais `pull_policy: never` no `minio`, e só a imagem no `minio-setup` | PR #176 | `docker compose pull` dá `Skipped`. Sem o `never`, o compose tentaria baixar `docker.io/gesway/minio` (🔴-1 do red team) |
| k8s: `minio.yaml` com `gesway/minio` e `imagePullPolicy: Never`. O `./start.sh up` constrói a imagem e para com erro claro no minikube (qualquer perfil) sem o `docker-env` daquele perfil; `MINIO_IMAGEM_NO_CLUSTER=1` para containerd, kind e k3d | PR #176 | Só validação estática e a trava testada isolada, com um `kubectl` falso. **Sem cluster real**, porque não havia `kubectl` no WSL |
| `scripts/verificar_imagem_minio.sh`: fonte única da versão (o `ARG` do Dockerfile), conferida contra as 4 linhas `image:` | PR #176 | Testado com o ARG trocado, o sidecar com outra imagem e um comentário de tag velha |
| `.github/workflows/ci-e2e.yml`: compose no runner, migrate, seed, carga inicial e `pnpm e2e` | PR #176 | 7 passed em todos os runs verdes da branch (8 até o red team final). Falha proposital: check vermelho e PR `MERGEABLE`/`UNSTABLE`, ou seja, avisa sem bloquear. Cache do MinIO: job de cerca de 2 min 40 s |
| `./start.sh seed` aplica também o `seed_hoje.sql` | PR #177 | Mesmo `psql` no Postgres do compose: os 3 arquivos com `rc=0`; hoje com 6 `CHECKED_IN`, 2 `CHECKED_OUT` e 3 `CONFIRMED`; 2ª rodada também `rc=0` |

Red team: `docs/qa/redteam_minio-build-do-fonte_16nov2026.md` (REPROVADO por 1 🔴 de uma linha, corrigido)
e `docs/qa/redteam_ci-e2e_16nov2026.md` (APROVADO COM RESSALVAS). Os dois têm o desfecho no fim.

## Incidente: `.env` local sobrescrito (corrigido na mesma sessão)

Ao testar o passo do CI que gera o `.env`, a IA extraiu o script do YAML e trocou o caminho do `.env`
por um arquivo no scratchpad. A troca falhou por diferença de indentação, e o `sed -i` rodou no `.env`
real da raiz. Seis senhas passaram a valores aleatórios:

- `POSTGRES_PASSWORD`
- `MINIO_ROOT_PASSWORD`
- `MINIO_PRESIGN_PASSWORD`
- `RABBITMQ_CORE_PASSWORD`
- `RABBITMQ_ANALYTICS_PASSWORD`
- `PIX_WEBHOOK_SECRET`

Com autorização do Weslley, os valores originais foram restaurados a partir do env dos containers do
compose, criados antes do erro, com `docker inspect` e sem exibir valores. Conferido depois: o
Postgres e o MinIO (root e leitor) autenticam com o `.env` restaurado. As senhas do RabbitMQ e o
`PIX_WEBHOOK_SECRET` vieram da mesma fonte, mas não foram testados, porque o broker estava parado.

**Lição:** teste de script que escreve em arquivo roda com o diretório de trabalho numa pasta isolada
e sem alteração no script. Foi assim que o reteste foi feito, com o checksum do `.env` real conferido
antes e depois.

## Ambiente (armadilhas do WSL desta máquina)

- O `credsStore: desktop.exe` do `~/.docker/config.json` não respondia pelo WSL (`error listing
  credentials`). O build rodou com um `DOCKER_CONFIG` vazio no scratchpad, mais o link para o
  `cli-plugins`.
- O clone do repositório do minio caía com "HTTP/2 stream reset". Por isso o Dockerfile usa
  `http.version HTTP/1.1`.
- A porta 15672 estava ocupada pelo RabbitMQ de outro projeto (`6325226-tf-10-rabbitmq-1`), e o
  resto do compose local não subiu. Não afeta o MinIO.
- O 1º build local do MinIO levou cerca de 20 min (VM do Docker com 1,86 GiB). No Actions, cerca de 4 min.

## Commits

| Hash | Mensagem |
|---|---|
| `39ae839` | `fix(infra): MinIO e mc compilados do código-fonte no compose` |
| `82545af` | `fix(infra): minio do compose nunca baixa a imagem, só compila` |
| `f79cb43` | `docs(qa): red team da imagem do MinIO compilada do fonte` |
| `b41995c` | `fix(k8s): MinIO do cluster usa a imagem compilada do fonte` |
| `efdad4b` | `ci(e2e): roteiro da demonstração em job não bloqueante` |
| `2e60a23` | `docs(e2e): artefatos e funcionamento do job do CI` |
| `39d1fb1` | `docs(qa): red team do job do roteiro e2e no CI` |
| `d292962` | `ci(e2e): falha do roteiro aparece em vermelho e o cache do MinIO só grava na develop` |
| `5a90e44` / `5a02e9e` | falha proposital temporária e o revert dela |
| `8cb8a48` | `docs(qa): desfecho do red team do e2e no CI` |
| `635c6e2` | `fix(infra): imagem do MinIO com bases por digest e commit conferido` |
| `c9ffd7b` | `fix(infra): tag do MinIO conferida contra o ARG do Dockerfile` |
| `0a26178` | `fix(start): ./start.sh up para com erro claro no minikube sem docker-env` |
| `103bb86` | `docs(qa): desfecho do red team da imagem do MinIO` |
| `d6d65ec` | `ci(e2e): actions docker/* por SHA e prazo próprio no passo do roteiro` |
| `3b82aec` | `fix(start): trava do minikube reconhece qualquer perfil e tem saída para containerd` |
| `013c579` | `docs(infra): comentários do MinIO e do prazo do roteiro descrevem o que acontece` |
| `968a927` | `fix(start): ./start.sh seed também aplica o seed_hoje.sql no k8s` (PR #177) |

## Pendências

| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | Merge dos PRs #176 e #177 na `develop` | 🟡 | Os dois estão prontos para revisão. Mexem no `start.sh` em funções diferentes |
| 2 | Testar `./start.sh up` e `ALLOW_SEED=1 ./start.sh seed` num cluster k8s real | 🟡 | Na máquina do ensaio de 24/11. No minikube, rode `eval $(minikube -p <perfil> docker-env)` antes; com containerd, kind ou k3d, carregue a imagem à mão e use `MINIO_IMAGEM_NO_CLUSTER=1` (`docs/infra/KUBERNETES.md`). O 1º build do MinIO leva minutos |
| 3 | **Não** marcar o job "Roteiro da demonstração (Playwright)" como check obrigatório | 🟡 | O que mantém o job sem bloquear o merge é ele não ser obrigatório |
| 4 | Passo 8 do roteiro no Grafana e uma execução verde do Actions aberta para a banca | 🟡 | Até 24/11, com o Weslley. O run verde do e2e já serve de evidência do CI |
| 5 | Folga no limite de login do e2e | 🟢 | O roteiro faz 4 logins, exatamente o burst do nginx (5r/m, burst 3). O caminho é o e2e reaproveitar sessões (código do Gabriel), não afrouxar o nginx |
| 6 | `docker compose build minio` na máquina de quem já tinha a imagem | 🟢 | O Dockerfile mudou e a tag é a mesma: um `up` sem `--build` usa a imagem velha |
| 7 | Plano B para a banca: `docker save` da imagem `gesway/minio` pronta | 🟢 | O 1º `up` depende do GitHub e do `proxy.golang.org` |
| 8 | A branch `fix/minio-build-do-fonte` no GitHub ficou para trás | 🟢 | Tudo está na `feature/ci-e2e` (PR #176). Pode ser apagada depois do merge |
