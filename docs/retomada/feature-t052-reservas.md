# Retomada — T-05.2 Reservas e check-in/out (feature/t052-reservas)

**Atualizado:** 28/10/2026 · **Por:** agente executor de frontend (trilha do Gabriel)
**Worktree:** /home/gabri/wt-t052 · **Portas:** PG 5445 · backend 3052 · Vite 5252
**Containers:** pg-t052 (sobe para os testes de backend da rodada; remover no fim)

## Objetivo
SPEC-05 T-05.2, CA-05.2.a a m: reservas, check-in/out, conta e comprovante no `apps/pms`.
Rodada atual: ressalvas da reauditoria delta (`docs/qa/redteam_t052-reservas_delta_24out2026.md`, commit `7bc2ffe`). Sem PR.

**Ordem de integração** (parecer do Sirlande, 28/10): `fix/tenant-fk-validation` → `feature/analytics-service` → `feature/t051` → `feature/t052`. O merge da t052 em develop está previsto para 30/10.
**Quando a t051 entrar na develop**, esta branch precisa de mais um merge da develop seguido de `pnpm gen:api`. Conflito esperado em `App.tsx`: manter os dois blocos. **Nunca resolva `openapi.json`/`schema.d.ts` à mão — regenere.** Depois disso, promover `Money`, `ErrorState`, `Notice`, `ButtonLink` e o badge (via `StatusBadge tone/label`) para `packages/ui` e registrar no `CATALOGO.md`.

## Onde estou
- Último commit: `c68db33 fix(reservations): estorno VOIDED e metodos da T-06.13 legiveis; comprovante sem estorno` (com push)
- Feito nesta rodada: merge da develop (`9da9dc5`, api-client regenerado e idêntico ao da develop) e 🟡-2 (`c68db33`)
- Próximo passo, em ordem:
  1. 🟡-1 backend: `GET /guests?q=&limit=`, com testes no `pg-t052` e Swagger, em commits separados
  2. Frontend do 🟡-1: `GuestPicker` com `?q=&limit=`, chave `['guests','search',q]`, mais o teste
  3. 🟢-1 mutações sobreviventes
  4. 🟢-2/3/4
  5. Portões: frontend e suíte completa do core
  6. Relatório, SPEC-05 e esta retomada

## Feito
- [x] Merge de `origin/develop` (PRs #100, #101 e comanda T-05.5) — `9da9dc5`
- [x] 🟡-2 da delta: VOIDED, CARTAO_CREDITO/DEBITO e comprovante sem estorno — `c68db33`
- [x] Módulo entregue (CA a–i, k, l, m) — `0be2e0d`..`3b1e41a`, docs em `3efd467`
- [x] qa-redteam: APROVADO COM RESSALVAS — `e3972c0`
- [x] 🟡-2 e 🟢-2 tratados, mais `RESERVATION_STATUSES` do domínio — `50aa4f8`
- [x] Decisão de 24/10: `PENDING → CHECKED_IN` no `@hotel/domain` — `58e37b5`; tela — `4755177`
- [x] 🟡-3 CPF mascarado — `36ea367`
- [x] 🟡-4 busca só depois de 3+ caracteres — `9f295ab`
- [x] 🟡-5 contraste AA — `9b62ecd`
- [x] 🟡-6 testes de 409 e 422 — `60fcc8c`
- [x] 🟢-3 alvo de 48 px, página fora do intervalo e período inválido — `9ea5e95`
- [x] E2E sem SQL: 41 PASS / 0 FAIL; portões verdes; SPEC-05, repasse e relatório atualizados

## Falta
- [ ] (depois da T-05.1) merge de `develop` e promoção dos componentes para `packages/ui`
- [ ] CA-05.2.j: depende de endpoint no backend

## Decisões tomadas nesta frente
- 21/10 — comprovante numa rota fora do AppShell, impresso pelo navegador, sem gerar PDF no cliente
- 21/10 — componentes locais (`ReservationStatusBadge`, `Money`, `ErrorState`); a promoção vem depois da T-05.1 (coordenador)
- 24/10 — **liberar `PENDING → CHECKED_IN` no `@hotel/domain`** (walk-in, alinhado ao `CheckInController`). Decisão do Gabriel, opção (a) do 🟡-1. Cancelamento continua só de PENDING/CONFIRMED
- 24/10 — o comprovante mascara o CPF (LGPD art. 6º, III); a tela de operação continua mostrando o CPF inteiro
- 24/10 — E2E não versionado: o repo não tem pasta convencionada para E2E; o roteiro está registrado no relatório

## Bloqueios e perguntas abertas
- CA-05.2.j (estorno com `deleted_by`): endpoint no backend
- Busca de hóspede definitiva: `GET /guests?q=&limit=` (T-05.12)
- Diagrama do CLAUDE.md §3 desatualizado frente à decisão de 24/10 (Gabriel)
- `GET /reservations/:id` sem `category` nos quartos: repassado ao dono indefinido

## Comandos úteis desta frente
Scripts na pasta scratchpad da sessão (prefixo `t052_`). Rodar com `MSYS_NO_PATHCONV=1 wsl bash /mnt/c/.../scratchpad/<script>`.
```bash
# banco próprio + backend (.env local do worktree aponta para 5445 / porta 3052)
docker run --rm -d --name pg-t052 -e POSTGRES_USER=hotel_user -e POSTGRES_PASSWORD=hotel_password -e POSTGRES_DB=gestao_hotel -p 5445:5432 postgres:17
cd /home/gabri/wt-t052/services/core-service && node command.js migrate && ALLOW_SEED=1 node command.js seed && node _web.js
# frontend com proxy para 3052: config temporária NÃO versionada (vite.t052.local.config.ts, porta 5252)
cd /home/gabri/wt-t052/frontend && pnpm typecheck && pnpm test && pnpm build
cd /home/gabri/wt-t052 && bash scripts/qa_checks.sh
# E2E: Playwright 1.48 em ~/.npm/_npx/5c6d8c4f680fcd0a (chromium-1140), script t052_e2e.mjs (sem SQL)
# fim: docker rm -f pg-t052; parar node/vite; apagar vite.t052.local.config.ts
```
