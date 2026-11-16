# QA Red Team — MinIO compilado do código-fonte (compose)
**Branch:** fix/minio-build-do-fonte · **Dev:** Lucaskenway (commit f45d432; área `docker-compose.yml` = Weslley, DIVISAO §7) · **Base:** develop@94eee74 · **Data:** 16/11/2026
**Arquivos auditados:** 2 no diff (`docker/minio/Dockerfile`, `docker-compose.yml`) + 3 de contexto (`infra/k8s/minio-setup.sh`, `infra/k8s/minio.yaml`, `docker/nginx/default.conf`)
**Achados no escopo:** 6 (🔴 1 · 🟡 3 · 🟢 2) · **Repassados:** 2

## Veredito
**REPROVADO** para o merge, por um único 🔴 com correção de uma linha (`pull_policy: never` no serviço `minio`, ver 🔴-1). Com essa linha, a branch passa a APROVADO COM RESSALVAS (os 🟡 não bloqueiam).

## Achados no escopo

### 🔴-1 [segurança / cadeia de suprimento] `docker compose up` tenta baixar `gesway/minio` do Docker Hub antes de compilar
**Onde:** `docker-compose.yml:48-49` (`build` + `image: gesway/minio:RELEASE.2025-10-15T17-29-55Z`, sem `pull_policy`)
**Cenário:** com `build` e `image` juntos e sem `pull_policy`, o Compose usa `missing`: primeiro **puxa a imagem do registro** e só compila se o pull falhar. Testei no Compose v5.5.0 desta máquina, num compose de prova com nome inexistente (`qa-nonexistent-zz9/probe:1`):
- `docker compose up --dry-run` → `Image ... Pulling` e depois `Building`;
- `docker compose pull` → `Image ... Pulling` no serviço com build (o `minio-setup` com `pull_policy: never` dá `Skipped`);
- com `pull_policy: never` no serviço com build → `up` vai direto a `Building`, e `pull` dá `Skipped`.

`gesway/minio` resolve para `docker.io/gesway/minio`. Hoje o pull falha, porque o namespace não existe ou não é público, e o build salva. Mas o namespace `gesway` no Docker Hub custa zero para registrar. Quem publicar `gesway/minio:RELEASE.2025-10-15T17-29-55Z` passa a ser baixado **sem aviso** em toda máquina limpa que rodar o comando documentado (`docker-compose.yml:7`, `docker compose up -d`) ou `docker compose pull`. O `--build` do README (`README.md:308`) não protege: o pull acontece antes, e a imagem baixada fica no cache para o próximo `up` sem `--build`. Essa imagem recebe `MINIO_ROOT_PASSWORD` e `MINIO_PRESIGN_PASSWORD`, e guarda os PDFs de contrato com CPF/RG. O `minio-setup` reaproveita a mesma tag local e roda o código do intruso com as duas senhas.
**Não verifiquei** quem é dono de `gesway` no Docker Hub, porque não consultei serviço externo com o nome do produto. Se o time já for dono do namespace, o risco cai para 🟡. O comportamento de pull-antes-de-build está confirmado.
**Regra violada:** LGPD art. 46 (segurança do dado pessoal); menor superfície na cadeia de suprimento.
**Correção sugerida:** acrescentar `pull_policy: never` ao serviço `minio`. Isso força o build quando a imagem falta, e o `pull` ignora o serviço. Outra opção é `pull_policy: build`, que recompila sempre, com cache. Opcionalmente, use um nome que não colide com o Docker Hub (`gesway-local/minio` não resolve isso; o que resolve é o `pull_policy`).

### 🟡-1 [reprodutibilidade] Bases flutuantes e toolchain ignorada
**Onde:** `docker/minio/Dockerfile:11,13,35`
**Cenário:** `golang:1.24-alpine` e `alpine:3` não têm digest. A imagem `golang` traz `GOTOOLCHAIN=local` (`docker image inspect`), então a diretiva `toolchain go1.24.8` do `go.mod` **é ignorada**: o binário de hoje saiu com `go1.24.13` (`minio --version` → `Runtime: go1.24.13`). Daqui a um mês, outro dev pode compilar com outro patch do Go e outro Alpine (hoje 3.24.4). O ensaio da banca então roda um binário diferente do validado hoje. A linha 1.24 já está fora da janela de suporte do Go (duas versões; o 1.26 saiu em fev/2026), então patch de CVE da stdlib não vem mais.
**Regra violada:** reprodutibilidade de build. O comentário da linha 8 promete "nunca um `latest` que muda sozinho", e `alpine:3` é exatamente isso.
**Correção sugerida:** fixar `golang:1.24.13-alpine3.xx@sha256:…` e `alpine:3.24@sha256:…`.

### 🟡-2 [integridade] Tag git mutável e sem assinatura; não há conferência do commit
**Onde:** `docker/minio/Dockerfile:24,30`
**Cenário:** `git ls-remote` hoje dá `refs/tags/RELEASE.2025-10-15T17-29-55Z → 9e49d5e7a648…`, que é o commit do binário validado. A tag do `minio` é **leve**: não tem `^{}`, então não é anotada nem assinada. Quem tem escrita no repo `minio/minio` pode mover a tag com `git push --force`. Com conta comprometida ou mudança de governança no upstream, o build seguinte compila outro código com o mesmo nome. Nada no Dockerfile percebe a troca. As dependências Go estão protegidas pelo `go.sum` mais o sumdb, mas o código do próprio MinIO não está.
**Regra violada:** imutabilidade declarada no comentário ("Tags RELEASE fixas") que o código não garante.
**Correção sugerida:** acrescentar `ARG MINIO_COMMIT=9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a` e `ARG MC_COMMIT=7394ce0dd2a80935aded936b09fa12cbb3cb8096`. Depois do clone, rodar `test "$(git rev-parse HEAD)" = "$MINIO_COMMIT"`.

### 🟡-3 [manutenção] RELEASE repetida em três lugares sem amarração
**Onde:** `docker/minio/Dockerfile:14`, `docker-compose.yml:49`, `docker-compose.yml:70`
**Cenário:** alguém troca `MINIO_RELEASE` no Dockerfile e esquece o compose. O build gera uma imagem com o binário novo e a tag antiga, `gesway/minio:RELEASE.2025-10-15…`. Pior: se a tag antiga já está no cache, o `docker compose up -d` sem `--build` não recompila e sobe o binário velho. Nos dois casos o nome da imagem mente sobre a versão. A tag também não carrega a versão do `mc`, que é diferente (`RELEASE.2025-08-13…`). O comentário de `docker-compose.yml:47` ("Tag RELEASE fixa no Dockerfile") sugere uma fonte única que não existe.
**Correção sugerida:** passar a RELEASE por `build.args` no compose e usar a mesma variável na `image:` (ex.: `${MINIO_RELEASE:-RELEASE.…}`), ou registrar no comentário que as três linhas mudam juntas.

### 🟢-1 [superfície] `curl` desnecessário; servidor roda como root
**Onde:** `docker/minio/Dockerfile:37,41`
**Cenário:** a base `alpine:3` já traz `wget` (busybox, confirmado em `/usr/bin/wget`). O `curl` e a libcurl entram só para o healthcheck, que poderia usar `wget -q --spider` ou `mc ready local`. A imagem também não declara `USER`: o `minio` roda como `uid=0` (confirmado com `id`). O tráfego dos downloads de PDF chega a esse processo via nginx. Isso não é regressão, porque a imagem oficial do quay também roda como root. Mas um RCE no MinIO, que não recebe mais correção (🟢-2), dá root no contêiner.
**Correção sugerida:** trocar o healthcheck para `wget` e remover `curl`. Para o root, criar usuário sem privilégio e `chown /data`. Atenção: os volumes `minio_data` já existentes são de root e precisam de migração. Fica para depois da banca.

### 🟢-2 [nota] Upstream sem novas releases; licença AGPLv3
**Onde:** `docker/minio/Dockerfile:14`
**Cenário:** `git ls-remote` não mostra tag `RELEASE.*` depois de `2025-10-15T17-29-55Z`, ou seja, esta é a última release comunitária. CVE novo no MinIO não terá correção por tag. Registrar no roadmap como pendência: avaliar alternativa S3 ou um fork mantido. Sobre a AGPLv3: os binários são compilados **sem modificação** e a imagem não é publicada. Assim, nem a obrigação de oferecer fonte por distribuição nem a do §13 (uso em rede de versão modificada) se aplicam. Se um dia a imagem for publicada num registro, basta apontar o upstream e a tag.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | k8s ainda usa `quay.io/minio/minio:latest` (401 em nó limpo; `latest` mutável; comentário diz que o quay resolve) | `infra/k8s/minio.yaml:33-36,84` | Weslley | `docs/qa/repasses/para_weslley_16112026.md` |
| 🟢 | Comentário diz "initContainer do k8s", mas é um contêiner lateral (`setup`) do pod | `docker-compose.yml:66` (fora do diff) | Weslley | `docs/qa/repasses/para_weslley_16112026.md` |

## O que foi verificado e está correto
- O build gera binários com RELEASE e commit corretos: `minio` `9e49d5e7…` e `mc` `7394ce0d…`, iguais ao `git ls-remote` de hoje.
- O healthcheck usa `curl`, e o `curl` está na imagem final (`Dockerfile:37`).
- O `minio-setup` tem `/bin/sh` (alpine) e `mc` em `/usr/bin`, o que basta para `infra/k8s/minio-setup.sh`. `MC_CONFIG_DIR=/tmp/.mc` funciona como root.
- `pull_policy: never` no `minio-setup`: `docker compose pull` dá `Skipped` (sem 401), e o `up` constrói pelo `minio` antes de criar o setup (`depends_on: service_healthy`).
- O `ldflags` só grava versão, commit e copyright (`gen-ldflags.go` do upstream). Não entra segredo nem caminho local (`-trimpath`). `CGO_ENABLED=0` gera binário estático, compatível com musl.
- As dependências Go são verificadas pelo `go.sum` mais o sumdb (padrão `GOPROXY`/`GOSUMDB`, não sobrescritos).
- O contexto de build `./docker/minio` contém só o Dockerfile, então nada do repo vaza para a imagem.
- O nginx (`docker/nginx/default.conf:3-4`) continua apontando para `minio:9000`, porque o nome de serviço não mudou. O serviço não publica porta no host.

## Não foi possível verificar
- Dono do namespace `gesway` no Docker Hub (🔴-1): não consultei serviço externo com o nome do produto.
- Pico de memória e tempo do build do MinIO numa máquina de 8 GB. A contingência T-06.4 agora depende de GitHub e de `proxy.golang.org` no primeiro `up`, com compilação de vários minutos. Recomendo `docker save` da imagem pronta como plano B para o dia da banca.
- O comportamento de `docker compose up` sem `--build` com a imagem já em cache e o Dockerfile alterado foi deduzido da semântica do Compose, não reproduzido (🟡-3).
