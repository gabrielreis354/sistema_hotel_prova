# Retomada — T-05.1 quartos e categorias (feature/t051-quartos-categorias)

**Atualizado:** 31/10/2026 (reauditoria delta 2 APROVADA, 3º merge da develop, 🟢-1 e 🟢-2) · **Por:** agente executor (trilha do Gabriel)
**Worktree:** /home/gabri/wt-t051 · **Portas:** PG 5444 (telas) · PG 5461 `pg-t051int` (suíte do core-service) · backend 3051 · Vite 5181 — todas desligadas agora
**Containers:** nenhum ativo. Para subir de novo, ver "Comandos úteis".

## Objetivo
Entregar a T-05.1 da SPEC-05 (CA-05.1.a–f): telas de quartos e categorias no `apps/pms`, precedidas da regeneração do `api-client`. Contrato: delegação do Gabriel de 21/10 — **sem PR e sem merge**; o Gabriel roda o qa-redteam e abre o PR.

## Onde estou
- Último commit: `fix(rooms)` dos 🟢-1/🟢-2 da reauditoria delta 2, mais o commit desta retomada (com push).
- Passo atual: **pronta para o PR.** A reauditoria delta 2 deu APROVADO (`a2b7799`). O 3º merge da develop (`c470169`, até `fbe086d`, PR #105) regenerou o api-client: 49 paths, `RoomError` com os 7 codes e `requestBody` nos 3 PUTs. Os 🟢-1 e 🟢-2 estão corrigidos. Tudo verde.
- **Próximo passo:** o Gabriel abre o PR. **Sem PR antes disso.** Se a develop andar de novo antes do PR: merge, `pnpm gen:api` (sem resolver o api-client à mão) e a verificação de sempre.

## Feito
- [x] api-client regenerado (40 → 46 paths) — `0a0b9b4`
- [x] `@hotel/domain`: `parseBRLInput`, `centsToBRLInput`, `StatusTone` — `6e2bf90`
- [x] `StatusBadge` generalizado (`tone` + `label`) — `cc330f3`
- [x] api, queries e regras puras com testes — `680ee3c`
- [x] telas e componentes locais — `9e17448`
- [x] rotas `/quartos` e `/quartos/categorias` + item de menu — `40f8cc2`
- [x] lista atualizada na volta e campos com 48 px — `44d16a3`
- [x] revisão Impeccable e qa_checks sem regressão — `596c6e4`
- [x] SPEC-05, CATALOGO e relatório — `9d699ce`
- [x] qa-redteam recebido (aprovado com ressalvas) — `6c9a6a5`
- [x] 🟡-2: `requestBody` dos três PUTs no Swagger e `as never` removidos — `75395a0`
- [x] 🟡-1 (PUT só com o que mudou), 🟡-3 (exclusão confia no 409), 🟢-1, parte do 🟢-3 — `22f47b2`
- [x] 🟢-3: motivo do status ligado por `aria-describedby` — `32bfb4f`
- [x] Reauditoria delta recebida — `74458e2`
- [x] Delta 🟡-1: base do diff congelada na 1ª carga (`keepFirstSnapshot`, teste do refetch) — ver git log
- [x] Delta 🟡-2/🟢-1: mensagens pelo `code` do corpo de erro, genérica honesta sem `code` — ver git log
- [x] Merge da develop (109 commits, T-05.5): conflitos em App.tsx (imports) e openapi.json/schema.d.ts (develop + regenerado, 49 paths) — `19c7e26`
- [x] Merge da develop (+8 commits de docs/infra, sem conflito) — `8d58ad4`
- [x] Refactor: rotas de quartos em `routes/roomsRoutes.tsx`, com teste e passeio por papel — `3f27492`
- [x] Verificação: typecheck, build, testes (37 + 31), qa_checks idêntico a develop, navegador (corpos de PUT capturados)
- [x] 2º merge da develop (fk + T-05.6). Conflitos: swagger.js (PUT /rooms, ficou a versão da develop com uma frase a mais), CATALOGO.md e o repasse da Sirlande. api-client regenerado, ErrorState vindo do @hotel/ui, `toRoomCreateBody` (POST só AVAILABLE/MAINTENANCE) — `e36e60c`
- [x] Codes amarrados ao `RoomError` gerado (code novo ou renomeado quebra o typecheck); teste de que a exclusão faz só o DELETE e lê o 409 — `e82c8fd`
- [x] Reauditoria delta 2: APROVADO — `a2b7799`
- [x] 3º merge da develop (PR #105, analytics-service). Único conflito no openapi.json: fiquei com a versão da develop e regenerei — `c470169`
- [x] 🟢-1: 404 sem code no PUT/DELETE diz que o registro não existe mais e manda voltar à lista; 🟢-2: ROOM_IN_USE dá o próximo passo (check-out, ou cancelar ou mover a reserva). Com testes — ver git log
- [x] Verificação após o 3º merge: typecheck 4/4; testes domain 37 e pms 154; build; qa_checks sem erro (3 avisos de fora); core-service 52 arquivos, 1117 passaram e 1 pulado
- [x] Verificação 31/10 (2º merge): typecheck 4/4; testes domain 37 e pms 151; build; qa_checks sem erro (3 avisos de fora); core-service 49 arquivos, 1100 passaram e 1 pulado; navegador desktop e 375×812 com as 7 mensagens, sem GET /rooms na exclusão

## Falta
- [ ] (Gabriel) reauditoria curta e PR
- [ ] 🟢-3 (barra do celular com 7 itens no AppShell) foi para a **T-05.3** (coordenador). Não é desta frente

## Decisões tomadas nesta frente
- 21/10 — Categorias como aba em `/quartos/categorias`, e não em `/config/...`: a recepção consulta, e a barra do celular não ganha mais uma aba (executor)
- 21/10 — Status no formulário segue a máquina de estados: Ocupado e Limpeza ficam desabilitados com motivo (executor)
- 21/10 — Componentes nascem locais em `features/rooms/components/` (regra de promoção do CATALOGO)
- 24/10 — PUT de quarto parcial (`changedRoomFields`) (qa-redteam 🟡-1)
- 24/10 — Swagger: `requestBody` nos três PUTs, editando só esses trechos (autorizado pelo coordenador)
- 24/10 — Sem trava "categoria em uso" no cliente; quem recusa é o backend com 409 (coordenador, 🟡-3)
- 24/10 — Base do diff da edição congelada na 1ª carga (reauditoria delta 🟡-1)
- 29/10 — No merge, api-client nunca resolvido à mão: aceita a versão da develop e regenera a partir do swagger.js mesclado (coordenador)
- 29/10 — Rotas de quartos isoladas em fragmentos `roomsReadRoutes`/`roomsAdminRoutes`, para reduzir conflito com a t052 em App.tsx (coordenador)
- 24/10 — Motivo do erro pelo `code` do backend; sem `code`, genérica honesta; só 403 e 5xx pelo status (coordenador, contrato com a fk)
- 31/10 — `ROOM_ERROR_CODES` com `satisfies` + exaustividade contra `RoomError['code']` gerado; switch fecha em `never` (executor)
- 31/10 — No conflito do swagger (PUT /rooms), fica o texto da develop (mais completo) e só se acrescenta "o PMS envia status só quando ele mudou" (executor)
- 31/10 — 404 sem code só vira "registro sumiu" no PUT/DELETE (no cadastro continua a genérica). Quando é a categoria escolhida que sumiu, quem diz é o CATEGORY_NOT_FOUND (reauditoria delta 2 🟢-1)
- 31/10 — Cadastro de quarto: `toRoomCreateBody` estreita o status a AVAILABLE/MAINTENANCE, como o contrato. Fail fast se vier outro (executor)

## Bloqueios e perguntas abertas
- Nenhum bloqueio. A fk está na develop, e o 409 CATEGORY_IN_USE/ROOM_IN_USE vem do servidor.
- Repasses do redteam para a Sirlande (R-1 a R-6) e para o Gabriel (R-8) estão fora desta frente.

## Comandos úteis desta frente
Rodar via `MSYS_NO_PATHCONV=1 wsl bash <script>`. No Git Bash, `$VAR` dentro de `wsl bash -c` é expandido pelo Windows, então escreva o script em arquivo.

```bash
source ~/.nvm/nvm.sh && nvm use 24
# verificação
cd /home/gabri/wt-t051/frontend && pnpm typecheck --force && pnpm build --force && pnpm turbo run test --force
cd /home/gabri/wt-t051 && bash scripts/qa_checks.sh
# regenerar o cliente (só lê o swagger.js; precisa de services/core-service/node_modules)
cd /home/gabri/wt-t051/frontend && pnpm gen:api
# suíte do core-service (a branch toca config/swagger.js)
docker run --rm -d --name pg-t051int -e POSTGRES_USER=hotel_user -e POSTGRES_PASSWORD=hotel_password -p 5461:5432 postgres:17
cd services/core-service && sed -e 's/^POSTGRES_PORT=.*/POSTGRES_PORT=5461/' -e 's/^RABBITMQ_HOST=.*/RABBITMQ_HOST=/' -e 's/^REDIS_URL=.*/REDIS_URL=/' .env.test.example > .env.test && npx vitest run
# ao final: docker stop pg-t051int; rm .env.test; rm -rf .tmp-jwt-keys
# ambiente de teste das telas (nunca 5432/3000)
docker run --rm -d --name pg-t051 -e POSTGRES_USER=hotel_user -e POSTGRES_PASSWORD=hotel_password -e POSTGRES_DB=gestao_hotel -p 5444:5432 postgres:17
cd services/core-service
sed -e 's/^NODE_WEB_PORT=.*/NODE_WEB_PORT=3051/' -e 's/^POSTGRES_PORT=.*/POSTGRES_PORT=5444/' -e 's/^REDIS_URL=.*/REDIS_URL=/' .env.example > .env
node scripts/gerar_chaves_jwt.js && node command.js migrate && ALLOW_SEED=1 node command.js seed
# backend + Vite precisam de um processo que fique vivo (o wsl bash mata filhos ao sair):
# script com "node _web.js & npx vite --config vite.t051.config.ts & wait" rodado em background.
# vite.t051.config.ts é temporário (proxy -> :3051, porta 5181), NÃO versionar.
# Ao final: parar processos, docker stop pg-t051, apagar .env, keys/ e o config temporário.
```
