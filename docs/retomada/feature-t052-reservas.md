# Retomada — T-05.2 Reservas e check-in/out (feature/t052-reservas)

**Atualizado:** 24/10/2026 · **Por:** agente executor de frontend (trilha do Gabriel)
**Worktree:** /home/gabri/wt-t052 · **Portas:** PG 5445 · backend 3052 · Vite 5252
**Containers:** pg-t052, **parado** (para subir de novo, ver "Comandos úteis")

## Objetivo
SPEC-05 T-05.2, CA-05.2.a a m: reservas, check-in/out, conta e comprovante no `apps/pms`.
Agora: corrigir as ressalvas do qa-redteam (`docs/qa/redteam_t052-reservas_21out2026.md`) e
aplicar a decisão de 24/10 no `@hotel/domain`. Sem PR e sem merge; o Gabriel conduz.

## Onde estou
- Último commit: `9f295ab fix(reservations): busca de hospede so consulta depois de digitar` (com push)
- Passo atual: correção das ressalvas — 🟡-2, 🟡-3, 🟡-4, 🟢-2 e a decisão de domínio já foram feitas
- Próximo passo: 🟡-5 (contraste AA nos avisos de sucesso e erro, só com tokens) → 🟡-6 (testes de 409/422 em `reservationsApi.test.ts` com `api` mockado) → 🟢-3 (alvo de 48 px nos links e no "Tentar de novo", `?pagina` fora do intervalo, lista desligada com período inválido) → E2E sem a promoção por SQL → portões → SPEC-05 (CA-05.2.d `[x]` com a decisão) → repasse `docs/qa/repasses/para_gabriel_23102026.md` (seção Tratamento) → relatório

## Feito
- [x] Módulo entregue (CA a–i, k, l, m) — `0be2e0d`..`3b1e41a`, docs em `3efd467`
- [x] qa-redteam recebido: APROVADO COM RESSALVAS — `e3972c0`
- [x] 🟡-2 "aguardando" soma só PENDING; 🟢-2 asserção explícita; `RESERVATION_STATUSES` do domínio — `50aa4f8`
- [x] Decisão de 24/10: `PENDING → CHECKED_IN` no `@hotel/domain`, com teste — `58e37b5`
- [x] Tela: PENDING habilita o check-in, com teste em `reservationActions` — `4755177`
- [x] 🟡-3 CPF mascarado no comprovante — `36ea367`
- [x] 🟡-4 GuestPicker só consulta com 3+ caracteres — `9f295ab`

## Falta
- [ ] 🟡-5 contraste AA
- [ ] 🟡-6 testes de 409/422; E2E fica registrado (o repo não tem lugar convencionado para E2E)
- [ ] 🟢-3 detalhes (alvo de toque, página fora do intervalo, `enabled: rangeOk`)
- [ ] E2E de novo: criar → check-in direto → conta → check-out, sem SQL
- [ ] typecheck, build, testes e qa_checks; SPEC-05; repasse; relatório

## Decisões tomadas nesta frente
- 21/10 — `ReservationStatusBadge`, `Money` e `ErrorState` ficam locais. Sobem para `packages/ui` depois do merge da T-05.1, que entra primeiro (coordenador)
- 21/10 — comprovante numa rota fora do AppShell, impresso pelo navegador, sem gerar PDF no cliente
- 24/10 — **liberar `PENDING → CHECKED_IN` no `@hotel/domain`** (walk-in, alinhado ao `CheckInController`). Decisão do Gabriel, opção (a) do 🟡-1
- 24/10 — não mexer em `packages/ui`; em `packages/domain`, só a transição acima

## Bloqueios e perguntas abertas
- CA-05.2.j (estorno com `deleted_by`): depende de endpoint no backend
- Busca de hóspede definitiva: `GET /guests?q=&limit=` (T-05.12)
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
# E2E: Playwright 1.48 em ~/.npm/_npx/5c6d8c4f680fcd0a (chromium-1140), script t052_e2e.mjs
# fim: docker rm -f pg-t052; parar node/vite
```
