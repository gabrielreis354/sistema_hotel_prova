# Sessão — Fecha T-06.4 de verdade (docker-compose + seed) — 21/09/2026

## Contexto

A branch `docs/conformidade-t064-rabbitmq` (revisão de texto, 16/09) declarava o critério 20 do
Termo de Aceite como atendido a partir do trabalho feito em `feature/docker-compose-rabbitmq`.
Auditoria `qa-redteam` desta sessão (`docs/qa/redteam_conformidade-t064-rabbitmq_21set2026.md`)
**reprovou** as duas branches: os arquivos que sustentam a alegação não estavam em `develop`
(branch irmã não mergeada), e mesmo lendo a branch irmã, 3 dos 6 critérios de aceite da T-06.4
não eram cumpridos — `seed` não funcionava, não havia instrução de frontend, e o `README.md` não
documentava o procedimento.

Esta sessão fecha os três gaps de verdade, com evidência real de execução (não só leitura
estática) — é exatamente o que faltava para o CA-06.4.e.

## O que foi corrigido

1. **`seed` não existia** (`node command.js seed` respondia com a mensagem de uso). Implementado
   em `services/core-service/command.js`, lendo `seed/seed_hotels.sql` e executando via
   `sequelize.query()` — sem depender de `psql`, que não existe na imagem `node:24-alpine`.
2. **`seed/` nunca chegava na imagem** — estava tanto no `Dockerfile` (`rm -rf ... seed/`) quanto
   no `.dockerignore` (nem entrava no contexto de build). Os dois foram corrigidos; `db/` segue
   fora da imagem (não é usado em runtime — `migrate` usa `sequelize.sync`, não `schema.sql`).
3. **Bug real descoberto ao rodar o seed pela primeira vez até o fim:** `event_quotes.status` e
   `contracts.status` são `ENUM` nativos do Postgres (criados pelo Sequelize). O `SELECT ... FROM
   (VALUES ...) AS v(...)` do seed passa esses literais como `text` concreto, não como literal
   "unknown" — e Postgres não faz cast implícito de `text` para `ENUM` nesse contexto (faria se
   fossem literais soltos num `INSERT ... VALUES` direto). Corrigido com cast explícito
   (`v.status::"enum_event_quotes_status"` / `::"enum_contracts_status"`) nas 3 ocorrências em
   `seed/seed_hotels.sql`. `contract_installments.status` não precisou — o seed não define essa
   coluna, fica no `DEFAULT` da tabela.
4. **CA-06.4.d (frontend):** sem `Dockerfile` em `frontend/`, a correção mínima e honesta é
   instrução clara, não um serviço novo no compose — adicionada seção no README. `backend` ganhou
   `ports: - "${BACKEND_HOST_PORT:-3000}:3000"` (configurável, default 3000) para o Vite do
   `app-pms` apontar pro backend sem precisar editar `vite.config.ts`.
5. **CA-06.4.f (README):** nova seção "Contingência Local (Docker Compose)" — subir, verificar,
   rodar frontend, derrubar.
6. **Healthchecks incompletos** (achado 🟡 da auditoria — "healthcheck de todos os serviços" era
   falso para MinIO e nginx): adicionado healthcheck ao `minio` (`curl -f
   localhost:9000/minio/health/live` — confirmado presente na imagem) e ao `nginx` (`curl -f
   localhost/healthz`); a dependência do `backend` em `minio` foi promovida de `service_started`
   para `service_healthy`.
7. **Evidência de `/healthz` era vazia** (achado 🟡 — é um `return 200` estático do nginx, nunca
   chega ao backend): README agora instrui validar via `/health` (rota real do backend,
   atravessa o proxy) e documenta a diferença.

## Evidência real de execução (CA-06.4.e)

Ambiente: `BACKEND_HOST_PORT=3010` (a porta 3000 do host já estava em uso por outro projeto
nesta máquina — não afeta o comportamento documentado, que usa 3000 por padrão).

```
$ BACKEND_HOST_PORT=3010 docker compose up -d --build
[...]
$ docker compose ps --format "{{.Name}}: {{.Status}}"
sistema_hotel_prova-backend-1: Up 44 seconds (healthy)
sistema_hotel_prova-minio-1: Up 3 minutes (healthy)
sistema_hotel_prova-nginx-1: Up 3 minutes (healthy)
sistema_hotel_prova-postgres-1: Up 3 minutes (healthy)
sistema_hotel_prova-rabbitmq-1: Up 3 minutes (healthy)
sistema_hotel_prova-redis-1: Up 3 minutes (healthy)

$ docker compose exec backend node command.js migrate
✅ Conexão com o banco de dados estabelecida.
✅ Migrations executadas com sucesso. Todas as tabelas estão atualizadas.
✅ Constraints, CHECKs e índices compostos aplicados.

$ docker compose exec backend node command.js seed
✅ Conexão com o banco de dados estabelecida.
✅ Seed executado com sucesso.

$ docker compose exec backend node command.js seed     # idempotência
✅ Conexão com o banco de dados estabelecida.
✅ Seed executado com sucesso.

$ curl -s http://localhost/health
{"status":"OK","timestamp":"2026-09-21T23:58:01.717Z","service":"Sistema de Gestão de Hotel Backend"}

$ curl -s -X POST http://localhost/auth/login -H "Content-Type: application/json" \
    -d '{"email":"admin@aurora.example","password":"senha123"}'
{"token":"eyJhbGci...", "user": {...}}     # login com usuário do seed funcionou — dado real, ponta a ponta
```

Todos os 6 serviços chegaram a `healthy` de verdade (não só `Up`/`started`). `docker compose
down -v` ao final — nenhum recurso órfão.

## O que NÃO foi re-testado nesta sessão

- **CA-06.4.b (repositório limpo):** não cloná o repo do zero para validar; o fluxo (`cp
  .env.example .env` → `JWT_SECRET` obrigatório) já estava documentado e não foi alterado.
- **Frontend rodando de fato via `pnpm --filter app-pms dev`** apontando para o backend do
  compose — a instrução foi escrita e o mecanismo (porta 3000 exposta, mesmo alvo do
  `vite.config.ts`) foi conferido por leitura, não executado ponta a ponta nesta sessão.

## Próximo passo

Ordem de merge (conforme a auditoria): `feature/docker-compose-rabbitmq` primeiro em `develop`,
depois `docs/conformidade-t064-rabbitmq` rebaseada por cima — só então o texto de conformidade
que declara o critério 20 atendido passa a descrever o estado real de `develop`. SPEC-06 T-06.4
marcada como concluída neste commit, com as 6 caixas fechadas.
