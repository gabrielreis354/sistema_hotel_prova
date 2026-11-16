# QA Red Team — MinIO do fonte + e2e no CI (rodada final) e seed do dia no k8s
**Branches:** `feature/ci-e2e` (PR #176, a partir de `8cb8a48`) e `fix/start-seed-hoje` (PR #177) · **Dev:** Weslley (IA orquestrada) · **Base:** develop@38936fe · **Data:** 16/11/2026
**Arquivos auditados:** 9. São 7 no escopo: `docker/minio/Dockerfile`, `scripts/verificar_imagem_minio.sh`, `start.sh` (nas duas branches), `.github/workflows/ci-e2e.yml`, `docker-compose.yml` e o relatório de sessão. Outros 2 entraram como contexto: `services/core-service/seed/seed_hoje.sql` e `services/core-service/command.js`.
**Achados no escopo:** 7 (🔴 0 · 🟡 1 · 🟢 6) · **Repassados:** 2

Não repete achados nem pendências dos red teams `redteam_minio-build-do-fonte_16nov2026.md` e `redteam_ci-e2e_16nov2026.md`. Isso inclui o limite de login do e2e, o k8s sem teste em cluster real e a pendência 6 do relatório (`up` sem `--build` com a tag igual).

## Veredito

- **PR #176 (`feature/ci-e2e`): APROVADO COM RESSALVAS.** Não há 🔴. O 🟡-1 deixa a trava do minikube cega para perfis com outro nome.
- **PR #177 (`fix/start-seed-hoje`): APROVADO.** Há só um 🟢, no texto do `usage`. O psql dá ao `seed_hoje.sql` o mesmo comportamento do `command.js` e ainda mostra os avisos.
- **Conflito #176 × #177:** nenhum. O `git merge-tree --write-tree feature/ci-e2e fix/start-seed-hoje` sai limpo (rc=0), e cada PR também mescla limpo na `develop`. As mudanças estão em funções diferentes: `cmd_up`/`cmd_compose_up` num PR, `cmd_seed` no outro. Não há dependência semântica entre elas.

## Achados no escopo — PR #176

### 🟡-1 [k8s / falso negativo] A trava do minikube reconhece só o perfil padrão
**Onde:** `start.sh:60` (feature/ci-e2e)
**Cenário (a), falso negativo:** na máquina do ensaio, alguém sobe o cluster com `minikube start -p gesway`. O minikube dá ao contexto o nome do perfil, então `kubectl config current-context` devolve `gesway`, e não `minikube`. A trava não dispara. O `docker build` vai para o daemon do host, o pod cai em `ErrImageNeverPull`, e o `kubectl wait` termina no timeout genérico de 120 s. É o mesmo cenário do 🟡-3 do red team de 16/11, que esta trava deveria fechar.
**Cenário (b), falso negativo:** o terminal tem `MINIKUBE_ACTIVE_DOCKERD=outro` de um `eval $(minikube -p outro docker-env)` antigo, e o contexto atual é `minikube`. A trava passa, e a imagem vai para o daemon do perfil errado.
**Cenário (c), beco sem saída:** com o minikube em `--container-runtime=containerd` ou `--driver=none`, o `minikube docker-env` recusa rodar. A mensagem manda executar um comando que falha, e o usuário não tem outro caminho indicado.
**Regra violada:** fail-safe, com mensagem que diz o que fazer (padrão de erro do projeto). O relatório da sessão (linha 22) e o desfecho do red team anterior dizem "para com erro claro no minikube", sem a ressalva.
**Correção sugerida:** reconhecer o minikube pelo provedor do contexto, e não pelo nome. O minikube grava a extensão `context_info` com `provider: minikube.sigs.k8s.io`:
`kubectl config view --minify -o jsonpath='{.contexts[0].context.extensions[*].extension.provider}'`.
Depois, exigir `MINIKUBE_ACTIVE_DOCKERD` igual ao nome do contexto. Na mensagem, citar a saída para containerd: `minikube -p <perfil> image build -t <tag> docker/minio`.

### 🟢-1 [comentário enganoso] Quando o passo estoura o prazo, o relatório do Playwright não é publicado
**Onde:** `.github/workflows/ci-e2e.yml:135-140`
**Cenário:** o `globalSetup` trava, por exemplo no aquecimento do Vite. O Playwright não tem `globalTimeout` (`frontend/e2e/playwright.config.ts`), então só o `timeout-minutes: 15` encerra o passo. O processo é morto, o reporter HTML nunca chega ao `onEnd`, e `playwright-report/` não existe. O upload passa em silêncio por causa do `if-no-files-found: ignore`. Saem só os logs do compose, mas o comentário promete "publicam o relatório e os logs".
Tem um detalhe: falha dentro dos testes já tem limite de cerca de 11,5 min (7 × 90 s, mais o `webServer` de 60 s). O prazo de 15 min só pega o travamento fora dos testes, que é justo o caso em que o relatório não sai.
Resíduo do 🟢-4(b) anterior: os passos sem prazo próprio continuam caindo no cancelamento de 45 min sem logs, porque o `if: failure() || cancelled()` sugerido não entrou. São eles o `compose-up --build` com o MinIO sem cache, o `pnpm install` e o `playwright install --with-deps`.
**Correção sugerida:** colocar `globalTimeout: 12 * 60_000` no `playwright.config.ts`, para o Playwright encerrar sozinho e gravar o relatório antes do prazo do passo. No comentário, escrever "os logs; o relatório só se o Playwright terminar".

### 🟢-2 [manutenção] A tag codifica só o `MINIO_RELEASE`; troca de mc, Go ou alpine não chega ao pod do k8s
**Onde:** `docker/minio/Dockerfile:9-13,19-23,45` · `start.sh:64-67` (feature/ci-e2e)
**Cenário:** alguém atualiza o digest do `golang:1.27-alpine` por causa de uma CVE, ou sobe o `MC_RELEASE`. A tag continua `gesway/minio:RELEASE.2025-10-15T17-29-55Z`, e o verificador aprova. O `./start.sh up` reconstrói e reaponta a tag no daemon. O `kubectl apply`, porém, não vê mudança no spec do StatefulSet, então o `minio-0` segue rodando o binário antigo até alguém recriar o pod. No compose é o caso da pendência 6, só que permanente: vale para toda troca futura que não mexa no `MINIO_RELEASE`. O comentário da linha 9 chama `MINIO_RELEASE` **e** `MC_RELEASE` de "FONTE ÚNICA da versão", mas só o primeiro entra na tag.
**Correção sugerida:** o menor ajuste é documentar no cabeçalho do Dockerfile: "mudou algo além do MINIO_RELEASE: `kubectl rollout restart statefulset/minio -n hotel-system` e `docker compose up -d --build minio`". O mais robusto é um sufixo de revisão na tag (`…-r2`), conferido pelo mesmo script.

### 🟢-3 [comentário enganoso] "Tudo fixo", mas os pacotes do apk flutuam e o digest congela o patch do Go
**Onde:** `docker/minio/Dockerfile:8,15-17,24,47`
**Cenário:** (a) `apk add --no-cache git` e `apk add --no-cache curl ca-certificates` instalam o que o repositório da 3.24 tiver no dia, então dois builds do mesmo commit podem sair com `curl` diferente. (b) O motivo dado para o Go 1.27 é receber correções de segurança. Só que o digest fixa a imagem em `GOLANG_VERSION=1.27.4`, que conferi no índice. O repositório não tem `.github/dependabot.yml`, então nenhum patch chega sem alguém editar o digest à mão.
**Correção sugerida:** trocar "Tudo fixo" por "imagens e fontes fixos; pacotes do apk acompanham a 3.24". Para o digest, registrar a pendência de atualização periódica, ou um Dependabot `docker` em `/docker/minio`.

### 🟢-4 [robustez] O verificador tem limites que não estão escritos
**Onde:** `scripts/verificar_imagem_minio.sh:12,19` · `start.sh:305`
**Cenário:** conferi em cópia isolada. (a) Um Dockerfile salvo com CRLF por editor do Windows dá "ARG MINIO_RELEASE não achado", quando o problema é o fim de linha. O `.gitattributes` força LF no checkout, então só acontece com edição local. A falha é segura, mas a mensagem engana. (b) Um `docker compose up -d` direto, sem `./start.sh compose-up`, não passa pelo verificador. Não dá para impedir isso. O README (linha 308) e o `frontend/e2e/README.md` já mandam usar o `compose-up --build`.
Os outros casos que testei falham de forma segura com mensagem correta: tag entre aspas, `${VAR:-…}`, terceira linha `image:` e prefixo `docker.io/`. O `grep` sem match sob `pipefail` cai no `|| true`, e o `grep -c` que devolve 1 fica dentro de `$(...)`, num `[`, então não derruba o script.
**Correção sugerida:** na mensagem do `ARG`, acrescentar "(linha com CRLF ou aspas?)".

### 🟢-5 [nota] Go 1.27 compilando um módulo `go 1.24.0`
**Onde:** `docker/minio/Dockerfile:15-19`
**Fatos conferidos:** o `go.mod` do minio no commit `9e49d5e` declara `go 1.24.0` e `toolchain go1.24.8`. O índice fixado traz `GOLANG_VERSION=1.27.4` e `GOTOOLCHAIN=local`.
**Risco:** os padrões de `GODEBUG` seguem a linha `go` do módulo principal, então as mudanças de comportamento controladas por `GODEBUG` ficam com a semântica da 1.24, como x509/TLS e o GOMAXPROCS sensível a cgroup. O que não passa por `GODEBUG` muda: coletor de lixo, escalonador e compilador. Essa combinação nunca foi validada pelo upstream. A evidência é só o roteiro e2e, um smoke que mal toca o MinIO. Para um MVP com carga de demonstração, o risco é baixo. Não há defeito concreto.
**Correção sugerida:** nenhuma no código. Antes do ensaio, um `mc cp` e um `mc cat` contra o MinIO do compose dão evidência direta além do healthcheck.

### 🟢-6 [relatório] Uma frase imprecisa no relatório da sessão
**Onde:** `docs/historico_sessao/weslley/minio_do_fonte_e_e2e_no_ci_16nov2026.md:22`
**Cenário:** diz que o `./start.sh up` "para com erro claro no minikube sem `docker-env`". Isso vale só para o perfil padrão (🟡-1). Quem conduz o ensaio com outro perfil confia na trava e não a tem.
O resto bate com o repositório. Os 17 hashes da tabela existem com as mensagens citadas, e 16 estão na `feature/ci-e2e` (o `968a927` está no #177, como diz o relatório). A base é `38936fe`. O run 43970739873 deu `failure` no attempt 1 (attempts 2 e 3 são re-runs, o 3º cancelado às 23:00). Os jobs levaram 2 min 35 s com cache e 5 min 37 s sem cache. A afirmação "funções diferentes no start.sh" também confere.
**Correção sugerida:** acrescentar "(perfil padrão; ver 🟡-1 do red team final)".

## Achados no escopo — PR #177

### 🟢-7 [texto] O `usage` não cita o cenário do dia
**Onde:** `start.sh:30` (fix/start-seed-hoje)
**Cenário:** `./start.sh help` ainda diz "Aplica o seed de demonstração (hotéis + comanda)". Quem decide se pode rodar o seed num cluster já usado não fica sabendo que ele agora move reservas e contas abertas para hoje.
**Correção sugerida:** "(hotéis + comanda + cenário de hoje)".

### psql (#177) × `sequelize.query` (`command.js`): conferido, sem achado
- **Transação:** o arquivo traz seu próprio `BEGIN; DO $$…$$; COMMIT;`. No psql, com `-v ON_ERROR_STOP=1`, um erro dentro do `DO` para o psql com rc=3. O `COMMIT` não roda, a conexão fecha e o Postgres desfaz a transação. O `kubectl exec` devolve o rc, e o `set -e` do `start.sh` para. No `command.js`, o protocolo simples e a exceção dão o mesmo efeito. Nos dois caminhos, se o `seed_hoje` falha, os dois primeiros arquivos já estão commitados, porque cada arquivo é uma transação. É o mesmo comportamento, não uma regressão.
- **`seed.agora`:** `current_setting('seed.agora', true)` devolve NULL sem a variável, e o `COALESCE(NULLIF(...))` cai em `now()`. O dia é calculado com `AT TIME ZONE 'America/Sao_Paulo'`, que a imagem oficial do Postgres resolve.
- **Interpolação do psql:** não há `:nome` fora de aspas. `::date` e `::timestamptz` são casts, e o psql não substitui nada dentro de `$$…$$` nem de `'10:00'`.
- **NOTICE/WARNING:** o psql mostra os dois no stderr, inclusive o WARNING de "cenário não ficou completo". No k8s o aviso aparece. O caminho do `command.js` descarta: veja o repasse abaixo.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | O `command.js seed` (compose, CI, banca de contingência) descarta o NOTICE e o WARNING do `seed_hoje.sql`. O aviso "cenário não ficou completo" nunca aparece | `services/core-service/command.js:99-103` · `seed/seed_hoje.sql:38-40,208-226` | Sirlande | `docs/qa/repasses/para_sirlande_16112026.md` |
| 🟢 | O WARNING manda recriar o banco com "docker compose down -v…", e no k8s (agora coberto pelo #177) o caminho é outro | `services/core-service/seed/seed_hoje.sql:224` | Sirlande | `docs/qa/repasses/para_sirlande_16112026.md` |

## O que foi verificado e está correto
- **Digests:** os dois são **índices OCI** multiarquitetura. Pelo registry, `golang:1.27-alpine` e `alpine:3.24` devolvem `application/vnd.oci.image.index.v1+json` com exatamente os digests do Dockerfile. O índice do golang tem amd64, arm64/v8, arm/v6 e v7, 386 e ppc64le. Não é manifest de uma arquitetura só.
- **SHAs das actions:** pelo `git ls-remote`, `docker/setup-buildx-action` `v3.12.0` = `8d2750c…` e `docker/build-push-action` `v6.19.2` = `10e90e3…`.
- **Commits do upstream:** `RELEASE.2025-10-15T17-29-55Z` do minio = `9e49d5e…`, tag leve. `RELEASE.2025-08-13T08-35-41Z` do mc = `7394ce0…`, tag anotada desreferenciada. O `git rev-parse HEAD` depois do `clone --branch` devolve o commit, e não o objeto da tag, então a conferência de `MC_COMMIT` está certa.
- **Verificador:** o regex do `sed` exige a linha inteira `ARG MINIO_RELEASE=RELEASE.<[0-9TZ:-]>` e falha de forma segura em qualquer variação. A contagem de linhas pega linha a mais ou a menos. Comentários são ignorados pelo `^[[:space:]]*image:`. O CRLF no YAML é removido pelo `[[:space:]]+$`. O `.gitattributes` força LF em `*.sh`, `*.yml`, `*.yaml` e `Dockerfile`. O `cd "$(dirname "$0")/.."` torna o script independente do diretório de quem chama. O `kustomization.yaml` não tem `images:`, que contornaria a conferência do k8s. Não existe outra ocorrência de `gesway/minio` fora dos 4 lugares.
- **Chamadas:** `cmd_up` (k8s) e `cmd_compose_up` (compose) rodam o verificador antes de construir ou subir. No CI, a atribuição `image=$(…)` em linha própria, sob `bash -e`, para o passo, e o comentário das linhas 93-94 está correto.
- **Prazos:** o passo tem `timeout-minutes: 15` e o job tem 45. O job gasta cerca de 2,5 min com cache e 5,5 min sem cache, então sobra margem para os passos de diagnóstico.
- **`docker build` sem `-q`:** o progresso aparece, e a falha cai no `|| err`.

## Não foi possível verificar
- **Trava contra minikube real** (perfil com outro nome, containerd, driver none): o comportamento do contexto e do `docker-env` foi deduzido da documentação do minikube, sem execução. Não há `kubectl` nem minikube no ambiente.
- **Docker Desktop com o provisionador kind:** SUSPEITA. Nesse modo, a imagem compilada no daemon do Docker Desktop pode não chegar aos nós, e o contexto continua `docker-desktop`, então nenhuma trava dispara. Para confirmar, rodar `./start.sh up` num Docker Desktop com cluster kind.
- **Conclusão de passo que estoura o `timeout-minutes`:** que `failure()` dá verdadeiro (e não `cancelled`) vem da documentação do Actions. Não foi provocado num run.
- **"7 passed em 5 runs"** (relatório, linha 24): a branch tem 8 runs verdes. Não dá para saber quais 5 o texto considera.
- **A chave do Asaas "trocada e válida até julho de 2027"** (relatório, linha 14): não há como conferir pelo repositório.
