# Retomada — validação de tenant nas FKs do corpo + R-2 a R-6 (fix/tenant-fk-validation)

**Atualizado:** 30/10/2026 · **Por:** agente executor (trilha Gabriel)
**Worktree:** /home/gabri/wt-fk-tenant · **Portas:** PG 5459 (antes 5451)
**Containers:** pg-fkint (subir de novo com: `docker run --rm -d --name pg-fkint -e POSTGRES_USER=hotel_user -e POSTGRES_PASSWORD=hotel_password -p 5459:5432 postgres:17`; `.env.test` com `POSTGRES_PORT=5459`)

## Objetivo
Fechar o vazamento entre hotéis por chave estrangeira vinda do corpo (R-1 do qa-redteam de
21/10), varrer a mesma classe de falha em todos os controllers e tratar R-2 a R-6 de quartos e
categorias (repasse `docs/qa/repasses/para_sirlande_21102026.md`). Sem PR e sem merge.

## Onde estou
- Último commit: `docs(historico)` das ressalvas do qa-redteam de 30/10 (push: sim)
- Passo atual: ressalvas do qa-redteam (🟡-1, 🟡-2, 🟡-3, 🟢-2, 🟢-3, 🟢-4, 🟢-5) corrigidas com RED → GREEN — 49 arquivos, 1087 passam, 1 skip, cobertura 85.36% statements; qa_checks 3 avisos, nenhum erro; container pg-fkint removido
- Próximo passo: decisão de PR/merge do Gabriel; regenerar api-client com a T-05.1 depois do merge

## Ressalvas do qa-redteam de 30/10 (relatório `docs/qa/redteam_tenant-fk-validation_24out2026.md`)
- 🟡-1 + 🟢-2: RED `b6d0906` → GREEN `a6489ef`. FOR SHARE em quem referencia o quarto ou a categoria (CreateReservation, AddRoom, UpdateReservation, SignContract, CreateRoom, UpdateRoom); FOR UPDATE no DeleteRoomCategory; testes de corrida em `tests/rooms-race.test.js`, que também matam as mutações M5 e M6.
- 🟡-2, 🟡-3, 🟢-3, 🟢-5: RED `8af65e0` → GREEN `b8a9f8a` (`numberError`, `findInTenant` no `:id`, `name.trim()`, `category.id`).
- 🟢-4: RED `4e13785` → GREEN `ab04841` (requestBody de `PUT /rooms/{id}`; api-client fica com a T-05.1).
- Fora desta rodada, por ordem do coordenador: CLEANING → MAINTENANCE e o repasse para a Sirlande.
- Relatório da sessão: `docs/historico_sessao/gabriel/tenant_fk_ressalvas_qa_30102026.md`.

## Integração com a develop (28–29/10)
- Merge (não rebase) de `origin/develop@94f7abf` (117 commits: T-04.5, T-04.6, T-04.7, T-05.5, T-06.13, repasses de schema, migrate no rollout).
- Conflito textual: nenhum. `config/swagger.js` mesclou sozinho (trechos diferentes); conferido que carrega.
- Conflito semântico: 1 — `tests/tenant-fk-isolation.test.js` usava `method: 'CASH'`; a T-06.13 pôs `method` em allowlist (`PIX | CARTAO_CREDITO | CARTAO_DEBITO | DINHEIRO`) e o teste passou a receber 400 antes da checagem do tenant. Trocado para `DINHEIRO`; o teste volta a provar o 404 do hotel alheio.
- Rotas novas verificadas (nenhuma recebe FK de outra entidade no corpo sem validar tenant): `POST /payments/:id/void` (busca com tenant e trava; teste de isolamento em `payment-void`), `GET /reservations/:id/accounts` (reserva com tenant; teste em `checkin-account`), `GET /analytics/internal-consumption` (SQL com `tenant_id`, só query de datas). Controllers alterados (CheckIn com conta da suíte, Create/UpdatePayment, CreateAccount com trava, Remove/UpdateReservation com mudança de contas) continuam filtrando por tenant; utilitários novos (`roomChangeAccounts`, `reservationBill`) também. A T-05.5 (comanda) é frontend sobre endpoints existentes. Nenhuma validação nova foi necessária.

## Feito
- [x] RED do R-1 — 5c7692c
- [x] R-1: `findInTenant` + Create/UpdateRoom — 02c4473
- [x] Baseline: 39 arquivos, 836 passam, 1 skip, cobertura 83.4% statements
- [x] Varredura: só UpdateRoom falhava; 9 regressões das FKs já corretas — 42fc9c9
- [x] RED de R-2 a R-6 — 6f02ee4
- [x] GREEN R-2/R-3 — 4e690f2 · R-4/R-5 — 671ca39 · R-6 — 24fa27f
- [x] Swagger dos 400/404/409 — 107e812
- [x] RED do `code` estável — 6c791ee
- [x] GREEN do `code` estável + Swagger `RoomError`
- [x] qa_checks: 3 avisos, os mesmos da develop (c6742b2); nenhum erro

## Falta
- [x] Relatório `docs/historico_sessao/gabriel/tenant_fk_validation_24102026.md`
- [x] Seção "Tratamento" no repasse (copiado da feature/t051-quartos-categorias)
- [x] Remover container pg-fk (feito no fim da sessão)

## Decisões tomadas nesta frente
- 24/10 — Outro hotel, inexistente, excluído ou id não-UUID → 404 (não revela existência) (delegação)
- 24/10 — Edição manual de status: AVAILABLE ↔ MAINTENANCE e CLEANING → AVAILABLE; mesmo status = sem mudança (aceito, o frontend reenvia o status velho) (delegação + CLAUDE.md §3); transição proibida → 409
- 24/10 — Diária: decimal > 0, até 2 casas, teto 99999999.99; capacidade inteira ≥ 1 (padrão 1 se ausente); floor inteiro ou null
- 24/10 — Contrato de erro com o frontend (coordenador): `code` estável em todo 400/404/409 novo ou alterado de RoomApi/RoomCategoryApi — `INVALID_INPUT` (+ `field` e a lista `errors` de sempre), `CATEGORY_NOT_FOUND`, `ROOM_NUMBER_TAKEN`, `ROOM_STATUS_TRANSITION_NOT_ALLOWED`, `ROOM_IN_USE`, `CATEGORY_IN_USE`, `CATEGORY_NAME_TAKEN`. Valores em `app/utils/roomErrors.js`; schema `RoomError` no Swagger. "Quarto não encontrado" (404 pré-existente) segue sem code

## Bloqueios e perguntas abertas
- Área de quartos/categorias é da Sirlande: ela precisa saber das mudanças.
- T-05.1 precisa rodar `pnpm gen:api` depois do rebase (enum de status do POST /rooms e schema RoomError).
- CLEANING → MAINTENANCE ficou proibido pela regra da delegação; confirmar com o Gabriel se a governança precisa dele.

## Comandos úteis desta frente
```bash
cd /home/gabri/wt-fk-tenant/services/core-service
source ~/.nvm/nvm.sh && nvm use 24 >/dev/null
npx vitest run tests/tenant-fk-isolation.test.js tests/rooms-categories-rules.test.js
npx vitest run --coverage
bash ../../scripts/qa_checks.sh
```
