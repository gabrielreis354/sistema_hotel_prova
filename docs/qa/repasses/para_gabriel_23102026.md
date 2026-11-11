# Repasses para Gabriel — 23/10/2026

## Origem: qa-redteam da T-05.2 (`feature/t052-reservas`) — `docs/qa/redteam_t052-reservas_21out2026.md`

### 🟡 [Máquina de estados] Reserva do balcão não chega ao check-in: domínio e backend discordam e não há "confirmar"
**Onde:** `frontend/packages/domain/src/state-machines.ts:93` (`PENDING: ['CONFIRMED', 'CANCELLED']`) · `services/core-service/app/Controllers/ReservationApi/CheckInController.js:26` (aceita `PENDING` e `CONFIRMED`) · `services/core-service/routes/apis/reservationRouter.js` (sem rota de confirmação) · `CreateReservationController.js:66` (nasce `PENDING`)
**Cenário:** recepcionista cria a reserva no balcão → `PENDING` → a tela (corretamente) obedece `@hotel/domain` e deixa "Fazer check-in" desabilitado → não existe ação nem endpoint para levar a reserva a `CONFIRMED` (só o webhook PIX e a assinatura de contrato B2B fazem isso). O hóspede presente não consegue fazer check-in pelo PMS.
**Regra violada:** três fontes divergentes sobre a mesma transição — CLAUDE.md §3 e `@hotel/domain` proíbem `PENDING → CHECKED_IN`; o backend permite. A allowlist do servidor é mais frouxa que a documentada.
**Correção sugerida (decisão sua, já registrada na SPEC-05 §5):**
- (a) Aceitar `PENDING → CHECKED_IN` como regra do negócio (walk-in): incluir `'CHECKED_IN'` em `RESERVATION_TRANSITIONS.PENDING`, ajustar `state-machines.test.ts` (linhas 19 e 34) e atualizar o diagrama do CLAUDE.md §3. O módulo de reservas habilita sozinho.
- (b) Manter o diagrama: criar `PUT /reservations/:id/confirm` (endpoint dedicado, tenant, transação) e **apertar** o `CheckInController` para aceitar só `CONFIRMED`; a T-05.2 ganha o botão "Confirmar".
Em qualquer caso, depois trocar a asserção condicional de `reservationLogic.test.ts:76` por uma firme.

#### Tratamento (24/10/2026)
- **Decisão do Gabriel:** opção **(a)**, walk-in. A transição `PENDING → CHECKED_IN` é regra do negócio, alinhada ao `CheckInController.js:26`, que já aceitava `PENDING` e `CONFIRMED`. Cancelamento continua só de `PENDING` e `CONFIRMED`.
- **Commits** em `feature/t052-reservas`:
  - `58e37b5` — `feat(domain): libera check-in direto de reserva PENDING (walk-in)`: `'CHECKED_IN'` em `RESERVATION_TRANSITIONS.PENDING`; `state-machines.test.ts` afirma a transição explicitamente e confere que `CHECKED_IN`, `CHECKED_OUT` e `CANCELLED` não fazem check-in.
  - `4755177` — `fix(reservations): reserva PENDING habilita o check-in na tela`: o teste de `reservationActions('PENDING')` passa a afirmar check-in e cancelar habilitados (a asserção condicional saiu antes, em `50aa4f8`).
- **Evidência:** o E2E faz criar → check-in direto → conta → check-out, sem promoção por SQL (41 PASS / 0 FAIL).
- **Ainda aberto:** o diagrama do CLAUDE.md §3 continua mostrando `PENDING → CONFIRMED → CHECKED_IN`. A atualização fica com o Gabriel, por ser instrução do projeto.
