# QA Red Team — conformidade do critério 20 (T-06.4 / RabbitMQ)

**Branch:** `docs/conformidade-t064-rabbitmq` (`fd2c43e`) · **Dev:** Weslley · **Base:** `develop@9ae6c87` · **Data:** 21/09/2026
**Arquivos auditados:** 1 no diff + 14 lidos por contexto (branch irmã `feature/docker-compose-rabbitmq`, SPEC-06, README, `command.js`, Dockerfile, manifests k8s, DFD/INSUMOS)
**Achados no escopo:** 6 (🔴 2 · 🟡 3 · 🟢 1) · **Repassados:** 0 (ambas as branches são do mesmo dono — ver §Repassados)

## Veredito

**REPROVADO**

O diff é de uma única linha de tabela, um placar e dois parágrafos — mas o que ele afirma é o
artefato que vai à banca, e a afirmação central é **falsa em dois níveis independentes**:

1. **Os arquivos que sustentam o "✅ Atende" não existem em `develop` nem nesta branch.** Eles
   estão em `feature/docker-compose-rabbitmq`, que não foi mergeada em lugar nenhum. Mergear só
   a doc coloca em `develop` uma análise que o próprio `develop` refuta em um comando
   (`find . -iname "docker-compose*.yml"` → vazio; `infra/k8s/minio.yaml:33` → ainda
   `minio/minio:latest`).
2. **Mesmo com a branch irmã mergeada, o critério 20 não fecha.** Dos seis critérios de aceite da
   T-06.4, **três não são cumpridos** (CA-06.4.c *seed*, CA-06.4.d *frontend*, CA-06.4.f
   *README*) — e a própria SPEC-06 (`docs/specs/SPEC-06-qualidade-divida-tecnica.md:73-87`)
   continua marcando a T-06.4 como 🔲 com as seis caixas desmarcadas, nas duas branches.

O que a branch acerta: a alegação sobre o **RabbitMQ** ("provisionado, sem outbox/publish/consume")
foi verificada e **está correta** — ver §"O que foi verificado e está correto".

Nenhum problema de segurança, vazamento ou dinheiro foi encontrado nesta branch. Não há alerta
fora do escopo a destacar.

---

## Achados no escopo

### 🔴 [conformidade/veracidade] A doc afirma como atendido um critério cujo código não existe na base que ela declara analisar

**Onde:** `docs/ANALISE_CONFORMIDADE_ACEITE_PROJETO_EXPERIMENTAL_23ago2026.md:33` (linha da tabela),
`:35` (placar 8/4/8), `:56` (bloco "Revalidação em 16/09"), `:237` (seção 11)

**Cenário concreto:** mergear esta branch em `develop` hoje, sem a irmã. Um avaliador — ou o
próprio time na semana que vem — abre `develop`, lê na linha 237 *"`docker-compose.yml` sobe o
sistema inteiro localmente"* e roda:

```
$ git checkout develop && find . -iname "docker-compose*.yml"     # → nada
$ grep image: infra/k8s/minio.yaml                                # → minio/minio:latest
```

Os dois fatos citados como prova (o compose e o fix do MinIO para `quay.io`) **não estão em
`develop`**. O cabeçalho do documento (linha 5) declara *"Base do código analisada: `develop` @
`1ee43ca`"* e o método (linha 6) declara *"leitura direta do código — nenhuma conclusão por
suposição"*. O bloco de 16/09 quebra as duas declarações: descreve código de uma branch não
mergeada como se fosse o estado de `develop`.

**Regra violada:** método declarado no próprio documento (linha 6); CLAUDE.md §7 — *"Código sem
propósito prático"* / "implementar sem research"; coerência entre documentação oficial e a base
que ela cita.

**Correção sugerida (menor ajuste):** ordem de merge — `feature/docker-compose-rabbitmq` **primeiro**,
em `develop`; esta branch **depois**, rebaseada. Nenhuma alteração de texto é necessária para
este achado específico (é ordenação), mas ela não resolve o achado seguinte.

---

### 🔴 [conformidade/veracidade] "✅ Atende — concluído T-06.4" é falso mesmo com a branch irmã mergeada: 3 dos 6 CAs não são cumpridos

**Onde:** `docs/ANALISE_CONFORMIDADE_ACEITE_PROJETO_EXPERIMENTAL_23ago2026.md:33` e `:237` ·
CAs em `docs/specs/SPEC-06-qualidade-divida-tecnica.md:82-87`

**Verificação item a item** (contra o conteúdo de `feature/docker-compose-rabbitmq`):

| CA | Status | Evidência |
|---|---|---|
| **a** — compose sobe backend, Postgres, Redis e MinIO | ✅ Cumprido | `docker-compose.yml:14-110` — seis serviços, nomes espelhando `infra/k8s/` |
| **b** — `docker compose up` a partir de repositório limpo | ⚠️ Parcial | `docker-compose.yml:79` usa `JWT_SECRET:?...`. Em clone limpo (sem `.env`) o `up` **aborta**. Está documentado no cabeçalho (`cp .env.example .env`), mas o CA fala em funcionar do repo limpo |
| **c** — `migrate` **e** `seed` executáveis no compose | ❌ **Não cumprido** | `command.js` (develop, 45 linhas) só implementa `migrate`; o `else` imprime "Uso:" e sai com 1. **`node command.js seed` não existe** — e está documentado como se existisse em `docker-compose.yml:8`. O caminho alternativo também está fechado: o único seed é `npm run seed:db` (`package.json:15`), que chama `psql -f seed/seed_hotels.sql`, e o `Dockerfile:22` faz `RUN rm -rf db/ seed/ tests/` — a pasta não está na imagem, e `node:24-alpine` não tem cliente `psql`. O arquivo também não é montado no container do Postgres (só o volume `postgres_data`). **Não há nenhum caminho para semear o banco no compose.** |
| **d** — frontend incluído ou com instrução clara | ❌ **Não cumprido** | Nenhum serviço de frontend no compose; `docker/nginx/default.conf:44` manda `location /` inteiro para `backend_pool`; não existe Dockerfile em `frontend/`; nenhuma instrução em lugar algum |
| **e** — testado de verdade, não só escrito | ⚠️ Não verificável / parcialmente refutado | Sem artefato de evidência (ver 🟡 nº 3). E o CA-06.4.c acima mostra que o fluxo documentado no cabeçalho do compose **não foi executado até o fim** — quem roda a linha 8 recebe exit 1 |
| **f** — README documentando o procedimento de contingência | ❌ **Não cumprido** | `grep -niE "docker compose|docker-compose|conting" README.md` → **zero ocorrências**. Nenhuma das duas branches toca o `README.md`. A única documentação do procedimento são comentários dentro do próprio `docker-compose.yml:1-12` |

**Cenário concreto (o que o CA-06.4.f e o "c" custam no dia da defesa):** a internet cai, a banca
autoriza a contingência, alguém abre o `README.md` — que fala só de Kubernetes/minikube — e não
encontra uma linha sobre compose. Encontrando o arquivo, sobe tudo, roda `migrate`, e o sistema
sobe **com o banco vazio**: sem seed não há hotel, usuário, quarto nem reserva para demonstrar, e
o comando que a própria doc manda rodar (`node command.js seed`) responde com a mensagem de uso.
Isso é exatamente a falha que a T-06.4 existia para evitar.

**Regra violada:** critérios de aceite da T-06.4 (SPEC-06 §CA-06.4.c/d/f); Termo de Aceite §8
("manter os arquivos de containerização **atualizados e funcionais**").

**Correção sugerida:** rebaixar a linha 33 e a 237 para **⚠️ Parcial**, listando os três CAs que
faltam, e ajustar o placar (o certo hoje é 7 atendidos / 5 parciais / 8 não atendidos). Ou fechar
os três CAs antes de mergear a doc. Em qualquer dos casos, marcar a T-06.4 e suas caixas na
SPEC-06 — hoje a doc diz "concluído" e a spec diz 🔲, no mesmo repositório.

---

### 🟡 [veracidade] "healthcheck de todos os serviços" — dois dos seis não têm healthcheck

**Onde:** doc `:56` e `:237` · `docker-compose.yml:41-52` (minio) e `:101-110` (nginx)

**Cenário:** o texto usa "healthcheck de todos os serviços" como prova de validação. No compose,
`minio` e `nginx` **não declaram `healthcheck`** — tanto que o `backend` depende do MinIO por
`condition: service_started` (`docker-compose.yml:95-96`), não `service_healthy`. Efeito prático:
um MinIO que sobe e morre no boot passa despercebido, e o backend inicia mesmo assim; a doc
sugere uma cobertura de verificação que o arquivo não tem.

**Regra violada:** veracidade da evidência citada (mesmo método declarado na linha 6 do doc).

**Correção sugerida:** ou trocar por "healthcheck de postgres, redis, rabbitmq e backend", ou
adicionar healthcheck ao MinIO (`mc ready local` / `curl -f localhost:9000/minio/health/live`) e
promover a dependência para `service_healthy`.

---

### 🟡 [veracidade] "proxy `/healthz` via nginx respondendo" não prova nada sobre o backend

**Onde:** doc `:56` e `:237` · `docker/nginx/default.conf:24-28`

**Cenário:** `/healthz` no nginx é `return 200 "ok\n"` **estático** — nunca chega ao
`backend_pool`. Com o backend caído, `curl localhost/healthz` responde `200 ok` do mesmo jeito.
Citar essa resposta como evidência de validação ponta a ponta é evidência vazia. Some-se que o
backend expõe `/health` (`routes/router.js:33`), não `/healthz` — a rota do backend **não foi
exercitada através do proxy** por esse teste.

**Regra violada:** veracidade da evidência citada.

**Correção sugerida:** validar `curl localhost/health` (a rota real do backend, que atravessa o
proxy) e citar essa, não a `/healthz`.

---

### 🟡 [processo/evidência] CA-06.4.e ("testado de verdade") não tem nenhum artefato no repositório

**Onde:** doc `:56` ("validado nesta sessão de ponta a ponta")

**Cenário:** procurei o registro da validação de 16/09 em `docs/historico_sessao/weslley/` e em
`docs/evidencias/`. O único relatório de 16/09 é `viacep_e_decisao_k8s_16set2026.md`, e a única
menção a compose nele é a linha 121 — que trata a T-06.4 como **plano futuro**, não como feito.
Não há log de `docker compose up`, saída de `docker compose ps`, nem print de `migrate`. A
alegação não é reproduzível por terceiros, e o CA-06.4.e é literalmente "testado de verdade, não
só escrito".

**Regra violada:** CA-06.4.e; CLAUDE.md §6 (contrato de output — relatório de sessão por trabalho
executado).

**Correção sugerida:** anexar a saída real (`docker compose ps` + `migrate`) ao relatório de
sessão e citá-lo no bloco de revalidação.

---

### 🟢 [manutenção] O cabeçalho do documento não acompanhou a revalidação

**Onde:** doc `:5` — *"Base do código analisada: `develop` @ `1ee43ca` (local, não enviado ao remoto)"*

**Cenário:** o documento já tem dois blocos de revalidação (26/08 e 16/09) e um placar novo, mas o
cabeçalho continua fixando a base de 23/08. Quem lê o placar da linha 35 não sabe contra qual
árvore ele vale. **Correção:** acrescentar a base de cada revalidação no próprio bloco.

---

## Achados na branch irmã `feature/docker-compose-rabbitmq` (fora do escopo — não reprovam esta branch)

Mesma trilha, **mesmo dono** (Weslley). Ficam registrados aqui, e não em `docs/qa/repasses/`,
porque não há outro dev a quem repassar.

| Sev. | Achado | Onde |
|------|--------|------|
| 🔴 | `node command.js seed` não existe; `seed/` é removida da imagem pelo Dockerfile e não há `psql` no container — não há caminho para semear o banco no compose, embora o cabeçalho documente o comando | `docker-compose.yml:8` · `command.js:41-45` · `Dockerfile:22` |
| 🟡 | Frontend ausente do compose e sem instrução de como subir (CA-06.4.d) | `docker-compose.yml` · `docker/nginx/default.conf:44` |
| 🟡 | README sem uma linha sobre o procedimento de contingência (CA-06.4.f) | `README.md` |
| 🟡 | `JWT_SECRET:?` derruba o `up` em clone limpo; mitigado só por comentário (CA-06.4.b) | `docker-compose.yml:79` |
| 🟡 | Nova credencial em texto claro em arquivo versionado: `RABBITMQ_DEFAULT_PASS: rabbitmq_secreto_academico_2026`. Segue o padrão pré-existente do arquivo (JWT_SECRET e MinIO já estavam assim), então **não é regressão** — mas é mais uma linha a migrar quando o projeto for para nuvem pública (critério 6) | `infra/k8s/secret.yaml:15` |
| 🟢 | `CORS_ORIGINS=*` como padrão do compose e do `.env.example` — aceitável em contingência local, perigoso se o arquivo virar base de outro ambiente | `docker-compose.yml:81` · `.env.example:20` |

---

## Repassados a outro dev

**Nenhum.** `docs/DIVISAO_TRABALHO_TIME_09set2026.md` §3.3 e §7 atribuem a Weslley `infra/k8s/`,
o contexto do Dockerfile, a **T-06.4**, o **RabbitMQ no cluster (CA-01.4.e)** e a documentação
acadêmica — que é exatamente todo o material tocado pelas duas branches. Nenhum achado pertence a
Gabriel ou Sirlande; nenhum arquivo em `docs/qa/repasses/` foi criado.

---

## O que foi verificado e está correto

- **A alegação sobre o RabbitMQ é verdadeira.** "Provisionado, sem outbox, publish ou consume":
  `grep -rniE "amqp|rabbit"` em `services/` e `frontend/` retorna **só falsos positivos em
  `node_modules/`** (`@noble/ciphers/aes.js`, `pdfkit`); nenhuma dependência AMQP no
  `package.json`; o `backend` do compose nem recebe variável de conexão com o broker. Não há
  publisher nem consumer escondido — a alegação não está desatualizada.
- **A consequência tirada disso também está correta:** critério 3 (microsserviços) segue ❌ e o DFD
  não precisa mudar — `docs/sugestoes-documentos-oficiais/03-dfd/INSUMOS.md:107,169,170` de fato
  marca fila, outbox e consumo como **🟡 T-01.4 (planejado)**, condicionados a código que ainda
  não existe.
- **O fix do MinIO está nos dois lugares** citados, na branch irmã: `docker-compose.yml:44` e
  `infra/k8s/minio.yaml:33` (`quay.io/minio/minio:latest`), com comentário explicando a causa.
  Em `develop`, os dois ainda apontam para `minio/minio:latest`.
- **Os nomes de serviço espelham mesmo `infra/k8s/`** (postgres, redis, minio, rabbitmq, backend,
  nginx) — a afirmação da doc confere.
- **`rabbitmq.yaml` é consistente:** StatefulSet + PVC + Service ClusterIP, probes por
  `rabbitmq-diagnostics`, credenciais por `secretKeyRef`, `kustomization.yaml` atualizado e
  NetworkPolicy de ingress restringindo 5672/15672 ao pod `backend`. A UI 15672 **não** é exposta
  por Ingress — só publicada como porta no compose local, como o comentário afirma.
- **Regras de ouro do CLAUDE.md:** nenhuma das duas branches altera código JS — zero `require()`,
  zero query nova, zero mudança em isolamento de tenant. Nada a reportar.
- **CA-06.4.a está cumprido** de fato, e o `depends_on: service_healthy` de Postgres e Redis está
  correto.

## Não foi possível verificar

- **Execução real do `docker compose up`.** Não subi containers nesta auditoria (sem daemon Docker
  disponível no ambiente e fora do mandato de "só reportar"). Tudo acima é leitura estática dos
  arquivos — o que basta para os CAs c, d e f, que falham por ausência, mas **não** garante que o
  `up` completo funcione mesmo com `.env` presente. Recomendo que a validação seja refeita **com
  log anexado**, já que é justamente o que o CA-06.4.e exige.
- **Se o `POSTGRES_HOST_AUTH_METHOD: scram-sha-256` do compose convive com a imagem
  `postgres:17-alpine` sem atrito** — plausível, mas não testado.
