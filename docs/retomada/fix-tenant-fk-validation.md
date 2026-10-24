# Retomada — validação de tenant nas FKs do corpo + R-2 a R-6 (fix/tenant-fk-validation)

**Atualizado:** 24/10/2026 · **Por:** agente executor (trilha Gabriel)
**Worktree:** /home/gabri/wt-fk-tenant · **Portas:** PG 5451
**Containers:** pg-fk (subir de novo com: `docker run --rm -d --name pg-fk -e POSTGRES_USER=hotel_user -e POSTGRES_PASSWORD=hotel_password -p 5451:5432 postgres:17`)

## Objetivo
Fechar o vazamento entre hotéis por chave estrangeira vinda do corpo (R-1 do qa-redteam de
21/10), varrer a mesma classe de falha em todos os controllers e tratar R-2 a R-6 de quartos e
categorias (repasse `docs/qa/repasses/para_sirlande_21102026.md`). Sem PR e sem merge.

## Onde estou
- Último commit: GREEN do `code` estável + Swagger (push: sim)
- Passo atual: GREEN completo — 41 arquivos, 901 passam, 1 skip, cobertura 84.32% statements
- Próximo passo: relatório de sessão, seção "Tratamento" no repasse, remover o container pg-fk

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
- [ ] Relatório `docs/historico_sessao/gabriel/tenant_fk_validation_24102026.md`
- [ ] Seção "Tratamento" no repasse (copiado da feature/t051-quartos-categorias)
- [ ] Remover container pg-fk

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
