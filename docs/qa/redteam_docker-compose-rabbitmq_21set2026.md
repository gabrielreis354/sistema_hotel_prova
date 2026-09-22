# QA Red Team — contingência local via Docker Compose (T-06.4)

**Branch:** `feature/docker-compose-rabbitmq` (`76f192a`) · **Dev:** Weslley · **Base:** `develop@9ae6c87` · **Data:** 21/09/2026
**Arquivos auditados:** 15 no diff (`git diff develop...HEAD --stat`) + 12 lidos por contexto (`applyDbConstraints.js`, models de `status`, `_web.js`, `vite.config.ts`, `.github/workflows/ci.yml`, `services/core-service/.env.example`, SPEC-06, relatório de sessão)
**Execução real:** clone limpo do repositório na branch → `docker compose up -d --build` → `migrate` → `seed` (3x) → `curl` → login → `docker compose down -v`
**Achados no escopo:** 10 (🔴 0 · 🟡 4 · 🟢 6) · **Repassados:** 0

Nenhum achado 🔴 de segurança, vazamento de dado ou perda financeira — nem dentro, nem fora do
escopo. Não há alerta fora do escopo a destacar.

## Veredito

**APROVADO COM RESSALVAS**

Rodei a pilha de ponta a ponta a partir de um **clone limpo** (não do working tree do dev, para
testar também o CA-06.4.b que a sessão admite não ter testado). O que a branch entrega funciona:
os **6** serviços chegam a `healthy` de verdade, `migrate` e `seed` rodam até o fim dentro do
container, `/health` atravessa o nginx até o backend e o login com usuário do seed devolve JWT
com `tenantId`. Os três CAs que a auditoria anterior reprovou (c, d, f) estão de fato fechados,
e os dois achados 🟡 de healthcheck foram corrigidos (um deles parcialmente — ver 🟢-6).

A ressalva central: **a evidência de idempotência do seed, registrada na SPEC-06 e no relatório
de sessão, é falsa.** Rodar `node command.js seed` duas vezes não quebra (sai `0`, imprime
"✅ Seed executado com sucesso"), mas **insere 5 reservas duplicadas a cada execução** — a sessão
verificou o código de saída, não o estado do banco. Não reprova (não há dano de produção, de
dinheiro ou de dado pessoal, e o texto literal do CA-06.4.c — "`migrate` e `seed` executáveis no
compose" — continua verdadeiro), mas é exatamente o tipo de afirmação não conferida que fez a
auditoria anterior reprovar a branch irmã. Corrigir antes que vire registro acadêmico.

### Evidência de execução (verificação independente, não o log do dev)

```
$ git clone --branch feature/docker-compose-rabbitmq <repo> ./clone   # repositório limpo
$ cp .env.example .env && (JWT_SECRET preenchido) && echo BACKEND_HOST_PORT=3010 >> .env
$ docker compose config          # sem JWT_SECRET: "required variable JWT_SECRET is missing a value" ✅
$ docker compose up -d --build   # exit 0

postgres   healthy      redis    healthy      minio   healthy
rabbitmq   healthy      backend  healthy      nginx   healthy   (em ~10s após o start)

$ docker compose exec backend node command.js migrate
✅ Conexão / ✅ Migrations / ✅ Constraints, CHECKs e índices compostos aplicados.

$ docker compose exec backend node command.js seed        # exit 0
$ curl -s http://localhost/health
{"status":"OK","timestamp":"2026-09-22T00:08:11.534Z","service":"Sistema de Gestão de Hotel Backend"}
$ curl -s -X POST http://localhost/auth/login -d '{"email":"admin@aurora.example","password":"senha123"}'
{"token":"eyJ...","user":{"name":"Admin Aurora","role":"ADMIN"}}   # JWT com tenantId ✅

$ docker compose exec backend node command.js seed        # 2ª e 3ª execução, exit 0
reservations: 40 → 45 → 50        ❌ (as demais tabelas ficaram estáveis)

$ docker compose down -v
Volumes clone_{postgres,redis,minio,rabbitmq}_data Removed · Network clone_default Removed
containers órfãos: 0 · volumes órfãos: 0 · networks órfãs: 0
```

---

## Achados no escopo

### 🟡 [veracidade/dados] O seed **não é idempotente**: +5 reservas `CANCELLED` a cada execução

**Onde:** `services/core-service/seed/seed_hotels.sql:243` e `:415` (`ON CONFLICT DO NOTHING`),
linhas de dados `:236-238` (Aurora) e `:409-410` (Sol);
afirmação contrária em `services/core-service/seed/seed_hotels.sql:6`,
`services/core-service/command.js:69` ("idempotente"),
`docs/historico_sessao/weslley/fecha_t064_docker_compose_seed_21set2026.md:72-74`
e `docs/specs/SPEC-06-qualidade-divida-tecnica.md` (CA-06.4.e marcado `[x]`).

**Cenário:** banco recém-migrado, `node command.js seed` → 40 reservas. Roda de novo (porque o
apresentador não lembra se já rodou, cenário típico do dia da defesa) → 50 reservas na terceira
execução, sem erro nenhum. Verificado:

```
room_id                              | check_in   | check_out  | status    | count
15fb2aad-9acc-4c9d-9f6b-60607480ebd5 | 2027-03-01 | 2027-03-05 | CANCELLED |   3
24933252-614f-470b-957e-d771167e3b59 | 2027-01-05 | 2027-01-08 | CANCELLED |   3
... (5 grupos, todos CANCELLED)
```

**Causa raiz (confirmada no banco, não inferida):** `ON CONFLICT DO NOTHING` só absorve violação
de constraint. A única constraint que cobre reserva duplicada é o EXCLUDE criado em
`services/core-service/database/applyDbConstraints.js:43-46`, que tem o predicado
`WHERE (status <> 'CANCELLED' AND deleted_at IS NULL)`. Logo as 5 linhas `CANCELLED` do seed
(3 Aurora + 2 Sol) não colidem com nada e são reinseridas sempre. As linhas não-canceladas são
corretamente absorvidas pelo EXCLUDE — por isso a contagem sobe exatamente 5, e não 40.

De quebra, o cabeçalho do seed (`seed_hotels.sql:17-20`) afirma que o EXCLUDE "vale para
QUALQUER status" — o banco diz o contrário. O predicado do EXCLUDE está **certo** (reserva
cancelada não deve bloquear o quarto); quem está errado é o comentário e a guarda do seed.

**Regra violada:** CLAUDE.md §7 ("código sem propósito prático" / evidência que não sustenta a
alegação); CA-06.4.e da SPEC-06 ("Testado de verdade, não só escrito") — foi testado o *exit
code*, não o *efeito*.

**Correção sugerida (menor ajuste):** trocar `ON CONFLICT DO NOTHING` nos dois blocos de
`reservations` por uma guarda explícita no mesmo padrão já usado em `payments` e
`contract_installments` — `WHERE NOT EXISTS (SELECT 1 FROM reservations r WHERE r.tenant_id =
t.id AND r.room_id = rm.id AND r.check_in_date = v.check_in::date)`. Depois, corrigir o
comentário `:17-20`, e reexecutar a evidência **comparando contagens**, não exit codes.

---

### 🟡 [segurança] A imagem de produção agora carrega o seed — e o comando que cria ADMIN com senha pública

**Onde:** `services/core-service/Dockerfile:18-20` (`seed/` deixou de ser removido),
`services/core-service/.dockerignore:14`, `services/core-service/command.js:38-60`.

**Cenário:** antes desta branch, `seed/` não entrava na imagem e `node command.js seed` não
existia. Agora a mesma imagem que roda em Kubernetes (`infra/k8s/backend.yaml` usa este
Dockerfile) contém `seed/seed_hotels.sql` e um comando que o executa contra `POSTGRES_HOST` —
que, no pod de produção, é o banco de produção. O seed cria `admin@aurora.example` com role
`ADMIN` e senha `senha123`, documentada em texto claro em `seed_hotels.sql:12` e no README.
Basta um `kubectl exec ... node command.js seed` por engano (ou por quem já tenha exec) para
nascerem contas ADMIN de senha conhecida em dois tenants no banco real. Confirmei que o arquivo
está na imagem: `docker compose exec backend ls seed/` → `seed_hotels.sql` (36 KB).

**Regra violada:** princípio do menor privilégio; o próprio comentário do `.dockerignore`
anterior ("não pertence ao runtime") era a mitigação removida.

**Correção sugerida:** manter o `seed/` na imagem (é o que viabiliza a contingência), mas colocar
uma guarda explícita em `command.js`: recusar `seed` a menos que venha um opt-in inequívoco
(`ALLOW_SEED=1` ou argumento `--confirm`), imprimindo o host e o banco alvo antes de executar.
Um guard por `NODE_ENV !== 'production'` **não** serve: o próprio `docker-compose.yml:85` sobe a
contingência com `NODE_ENV=production`.

---

### 🟡 [documentação/contingência] `BACKEND_HOST_PORT` não existe em lugar nenhum da documentação — e é a saída para a falha mais provável do dia

**Onde:** `docker-compose.yml:80-83` (única menção, num comentário inline),
ausente de `.env.example` (raiz), ausente de `services/core-service/.env.example`,
ausente de `README.md:255-310`; `README.md:301-303` afirma o contrário.

**Cenário:** a defesa começa, a nuvem caiu, alguém roda `docker compose up -d --build` no laptop
— e a porta 3000 já está ocupada (foi **exatamente** o que aconteceu com o próprio dev nesta
sessão, `docs/historico_sessao/.../fecha_t064...md:49-50`, e comigo nesta auditoria: a máquina
tinha 3000 em uso). O compose falha no bind, e o README, que é o único documento que a pessoa vai
abrir sob pressão, não diz que existe `BACKEND_HOST_PORT`; diz, ao contrário, que
"nenhuma variável de ambiente extra é necessária" (`README.md:302-303`). E se a pessoa descobrir
a variável no comentário do YAML e usar `BACKEND_HOST_PORT=3010`, o frontend quebra em silêncio:
`frontend/apps/pms/vite.config.ts:12` aponta fixo para `http://localhost:3000` e o README não
menciona esse acoplamento.

**Regra violada:** CA-06.4.f — o README documenta o caminho feliz, não o procedimento de
contingência (que por definição é o caminho onde algo já deu errado).

**Correção sugerida:** acrescentar `BACKEND_HOST_PORT=3000` (comentado) nos dois `.env.example` e
um parágrafo curto no README: "porta 3000 ocupada? `BACKEND_HOST_PORT=3010` no `.env` — e então
ajuste o `target` do proxy em `frontend/apps/pms/vite.config.ts` para a mesma porta".

---

### 🟡 [documentação] Duas instruções divergentes de qual `.env.example` copiar — e o arquivo que esta branch criou não é o citado no README

**Onde:** `README.md:263` (`cp services/core-service/.env.example .env`) vs
`docker-compose.yml:5` (`cp .env.example .env`). O `.env.example` da raiz **foi criado por esta
branch** (28 linhas, documentando exatamente as variáveis do compose) e o README nunca o cita.

**Cenário:** a pessoa segue o README e copia o `.env.example` do backend. Verifiquei: funciona
(tem `JWT_SECRET`, e o compose sobrescreve `POSTGRES_HOST`, `REDIS_URL` e `MINIO_ENDPOINT`, então
os `localhost` de lá não causam dano) — mas ela sobe com `NODE_ENV=development` em vez de
`production`, e sem as chaves `RABBITMQ_DEFAULT_*` e `MINIO_BUCKET` que o arquivo da raiz
documenta. Dois arquivos com o mesmo nome e propósitos parecidos, com a documentação apontando
para o errado, é a semente do próximo "funcionou na minha máquina".

**Regra violada:** DRY na configuração; CA-06.4.f.

**Correção sugerida:** README passa a mandar `cp .env.example .env` (o da raiz, que é o do
compose) e diz em uma linha que `services/core-service/.env.example` é para rodar o backend
**fora** do Docker.

---

### 🟢 [armadilha de configuração] `NODE_WEB_PORT` é oferecido como variável, mas a porta 3000 está fixa em três outros pontos

**Onde:** `docker-compose.yml:86` (`NODE_WEB_PORT: ${NODE_WEB_PORT:-3000}`) e `:80` (lado direito
do mapping fixo em `3000`); `services/core-service/Dockerfile:27-28` (HEALTHCHECK em
`localhost:3000`); `docker/nginx/default.conf:4` (`server backend:3000`). O backend honra a
variável (`services/core-service/_web.js:25`).

**Cenário:** alguém define `NODE_WEB_PORT=3001` no `.env` achando que resolve um conflito de
porta. O backend passa a escutar em 3001; o HEALTHCHECK bate em 3000, falha para sempre; o
container nunca fica `healthy`; o nginx, que depende de `service_healthy`, nunca sobe. Diagnóstico
não óbvio sob pressão.

**Correção sugerida:** ou remover `NODE_WEB_PORT` do `.env.example` da raiz (a porta interna do
container não precisa ser configurável), ou propagá-la para o HEALTHCHECK e para o upstream do
nginx.

### 🟢 [healthcheck] O healthcheck do nginx continua não provando que o proxy chega ao backend

**Onde:** `docker-compose.yml:120-121` (`curl -f http://localhost/healthz`),
`docker/nginx/default.conf:23-27` (`return 200 "ok\n"` estático).

**Cenário:** backend cai depois da subida. O nginx segue `healthy` porque `/healthz` é literal do
próprio nginx — verificado no log de saúde do container (`Output: ...ok`). O commit fala em
"healthcheck real de nginx"; é real para o processo nginx, não para o caminho que o usuário usa.
Mitigado em parte pelo `depends_on: backend: service_healthy` e pelo aviso honesto do
`README.md:286-287`. **Correção:** apontar o healthcheck para `http://localhost/health`, que
atravessa o `upstream` — o mesmo curl que o README já manda o apresentador rodar.

### 🟢 [consistência] `rabbitmq` ganhou healthcheck mas o `backend` continua dependendo dele por `service_started`

**Onde:** `docker-compose.yml:66-73` (healthcheck novo) vs `:107-108` (`condition:
service_started`). Sem dano hoje (nenhum código publica/consome), mas a assimetria em relação ao
`minio` — promovido a `service_healthy` no mesmo commit — vai enganar quem ligar o primeiro
publisher.

### 🟢 [documentação] README manda esperar 5 serviços `healthy`; são 6

**Onde:** `README.md:266` — "espere backend, postgres, redis, minio e nginx ficarem healthy".
`rabbitmq` está fora da lista, embora tenha healthcheck e apareça no `docker compose ps`.

### 🟢 [documentação] "165 registros" contradiz o próprio seed

**Onde:** `README.md:221`, `:268`, `:588`, `:721` dizem 165; o rodapé de
`services/core-service/seed/seed_hotels.sql:644-651` diz "TOTAL: ~190 registros". Contagem real
após o primeiro seed: 2 tenants, 5 users, 60 guests, 25 rooms, 40 reservations, 28 payments,
6 event_quotes, 3 contracts, 7 contract_installments (+ categorias, clientes corporativos e
serviços de orçamento). O número do README é anterior ao módulo B2B.

### 🟢 [teste/regressão] Nada no CI exercita o compose nem o Dockerfile

**Onde:** `.github/workflows/ci.yml` é o único workflow e não constrói imagem nem sobe o compose.

**Cenário:** o Termo exige os arquivos de containerização "atualizados e **funcionais**". Hoje a
única prova de que continuam funcionais é alguém rodar à mão — foi assim que o `seed/` sumido da
imagem sobreviveu até a auditoria de hoje. Um job que faça `docker compose config` + `up -d
--build` + `migrate` + `curl /health` + `down -v` fecharia o buraco. Registrar como pendência na
SPEC-06 é suficiente por ora.

---

## Ceticismo dirigido — o que foi pedido, ponto a ponto

| Ponto | Resultado |
|---|---|
| Nome dos tipos ENUM (`\dT+` no Postgres do compose, pós-`migrate`) | **Confere.** Existem `enum_event_quotes_status` (SENT/CONFIRMED/CANCELLED) e `enum_contracts_status` (GENERATED/SIGNED/CANCELLED), exatamente como os casts escrevem. `reservations.status`, `rooms.status` e `tenants.status` são `text` — por isso não precisam de cast, e o seed está coerente ao não colocá-lo |
| `contract_installments.status` sem cast | **Confere.** O INSERT (`seed_hotels.sql:621-622`) lista apenas `(tenant_id, contract_id, descricao, data_vencimento, valor)` — `status` fica de fora. O DEFAULT existe e é válido: `'PENDING'::enum_contract_installments_status`, coluna nullable. Bloco é idempotente de verdade (contagem estável em 7 após 3 execuções) |
| `.dockerignore` **e** Dockerfile corrigidos nos dois lugares | **Confere.** `.dockerignore` removeu a linha `seed/` (mantendo `db/`, `tests/`, `*.md`, `.env*`) e o Dockerfile passou de `rm -rf db/ seed/ tests/ vitest.config.js` para `rm -rf db/ tests/ vitest.config.js`. Nenhum outro padrão bloqueia `seed/`: o `COPY . .` vem depois do `.dockerignore` e o único filtro por extensão é `*.md`, que não pega `.sql`. Comprovado em runtime: `ls seed/` na imagem devolve o arquivo; `ls db/` devolve "No such file or directory" |
| Default de `BACKEND_HOST_PORT` | **Confere.** Sem a variável, `docker compose config` resolve `published: "3000"` — o comportamento documentado. Apenas não documentado como existe (🟡-3) |
| `infra/k8s/` tocado por engano nos 3 commits de fix | **Não.** `git diff --name-only 2d20658..HEAD -- infra/k8s/` = 0 arquivos. As mudanças em `infra/k8s/` no diff da branch vêm dos commits anteriores de RabbitMQ (`57c0ec3`, `d42bcd1`), que provisionam o broker com `secretKeyRef` e NetworkPolicy própria — fora do escopo deste fix e sem regressão |
| CA-06.4.b (repositório limpo) — não testado pela sessão | **Testado por mim e passa.** Clone do zero na branch → `cp .env.example .env` → `JWT_SECRET` → `up -d --build` → 6 `healthy` → `migrate` → `seed` → login. Sem arquivo faltando e sem caminho relativo quebrado. Única pegadinha encontrada: o README manda copiar o outro `.env.example` (🟡-4) e não fala da porta (🟡-3) |
| README serve a quem não tem contexto, sob pressão | **Parcialmente.** Sobe/verifica/derruba estão corretos e o aviso `/healthz` × `/health` é honesto e útil. Lacunas: porta ocupada (🟡-3), `.env` errado (🟡-4), 5 de 6 serviços (🟢), e **não há pré-requisito declarado** — nada diz "Docker Engine 20.10+ com plugin `compose` v2" nem o que fazer se a máquina só tiver `docker-compose` v1 (que não entende a sintaxe `condition: service_healthy` combinada com `${VAR:?}`). Vale uma linha |
| Achados não-regressão da auditoria anterior | Reconfirmados sem mudança e **sem redescrição**: `JWT_SECRET:?` continua como guarda obrigatória (e funciona — `docker compose config` sem ele falha com a mensagem customizada); credencial do RabbitMQ segue em texto claro em `.env.example:27-28` e `infra/k8s/secret.yaml`; `CORS_ORIGINS=*` segue como default |

---

## O que foi verificado e está correto

- **6/6 serviços `healthy`** (não `started`): `postgres`, `redis`, `minio`, `rabbitmq`, `backend`,
  `nginx`. `nginx:1.27-alpine` e a imagem do MinIO têm `curl`, então os healthchecks novos
  realmente executam (checado no `State.Health.Log`, não só no status)
- **CA-06.4.c** — `migrate` e `seed` executáveis dentro do container, sem `psql` (que não existe
  em `node:24-alpine`). `migrate` também aplica `applyDbConstraints` (EXCLUDE + CHECKs)
- **CA-06.4.d** — instrução de frontend correta e conferida contra o código: o pacote se chama
  mesmo `app-pms` (`frontend/apps/pms/package.json:2`), a porta é 5173 e o proxy aponta para
  `localhost:3000` (`vite.config.ts:9,12`)
- **CA-06.4.f** — seção existe, com subir/verificar/frontend/derrubar e a distinção
  `/healthz` × `/health`
- **`/health` atravessa o nginx** até o backend com o JSON exato do README; `/api-docs` responde
  200 pelo proxy
- **Login ponta a ponta** com usuário do seed devolve JWT com `userId`, `role: ADMIN` e
  `tenantId` — o payload que o CLAUDE.md §3 especifica
- **ESM:** nenhum `require()` introduzido. `command.js` usa `import` estático e `await import()`
  dinâmico no mesmo padrão já existente em `migrate()`
- **Multi-tenancy:** nenhuma query de aplicação foi tocada. O seed resolve `tenant_id` sempre por
  `JOIN tenants t ON t.subdomain = ...` — nenhum UUID hardcoded, nenhum registro órfão de tenant
- **LGPD:** os `console.log`/`console.error` de `command.js` imprimem só mensagens fixas e
  `error.message` — nenhum objeto de model, nenhum CPF, e-mail ou token. `logging: false` no
  Sequelize (`database/connections/sequelize.js`) impede que os 36 KB de SQL do seed (com CPFs e
  e-mails fictícios) vazem para stdout. Dados do seed são fictícios (`*.example`)
- **Transação:** o seed inteiro roda em `BEGIN`/`COMMIT` do próprio arquivo
- **`down -v` limpo:** 4 volumes, 1 network e 6 containers removidos; zero órfãos. Só a imagem
  construída permanece, o que é o comportamento normal de `down` (removida por mim ao final)

## Repassados a outro dev

Nenhum. Todos os arquivos do diff estão na área do Weslley
(`docs/DIVISAO_TRABALHO_TIME_09set2026.md` §7: `infra/k8s/`, `docker-compose.yml`). O defeito de
idempotência vive em `services/core-service/seed/seed_hotels.sql`, arquivo que **esta branch já
edita**, e a constraint que o expõe (`applyDbConstraints.js:43-46`, área do Sirlande) está
**correta** — não há o que repassar; vale só avisar o Sirlande da correção quando ela sair, por
ser dado de domínio.

## Não foi possível verificar

- **Frontend rodando de fato** contra o backend do compose (`pnpm install` + `pnpm --filter
  app-pms dev`): não executado — `pnpm install` do monorepo exige rede e tempo fora do orçamento
  desta auditoria. A instrução foi conferida **contra o código** (nome do pacote, porta, alvo do
  proxy), não em execução. Continua sendo o único CA cuja prova é por leitura
- **Comportamento com a porta 3000 livre**: a máquina de auditoria tinha 3000 ocupada, então usei
  `BACKEND_HOST_PORT=3010`. O default de 3000 foi confirmado por `docker compose config`, não por
  bind real
- **`docker-compose` v1**: não testado — não está instalado no ambiente
