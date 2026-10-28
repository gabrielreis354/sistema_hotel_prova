# Repasses — DONO INDEFINIDO — 26/10/2026

Origem: `docs/qa/redteam_t047-consumo-interno_26out2026.md` (branch `feature/t047-consumo-interno-seed`, Sirlande).

### 🟢 [Seed/estado] Reservas CHECKED_IN em quartos AVAILABLE
**Onde:** `services/core-service/seed/seed_hotels.sql:76-87` (todos os 25 quartos são inseridos como `'AVAILABLE'`) e `:218-222, :404-406` (6 reservas CHECKED_IN, em quartos como 106, 107, 203 e 302 do Aurora e 4 e 10 do Sol).
**Cenário:** o check-in pela API grava `rooms.status = 'OCCUPIED'` (`CheckInController.js:34-36`). O seed cria o estado "hóspede na casa num quarto livre", que a API nunca produz. Com a T-04.7, essas reservas também ganham uma conta de diária aberta. Na demonstração, o rack mostra a Suíte 106 livre enquanto há uma conta aberta e consumo lançado nela.
**Regra violada:** máquina de estados de quartos do CLAUDE.md (o check-in leva o quarto para OCCUPIED).
**Correção sugerida:** depois das reservas, acrescentar ao seed `UPDATE rooms SET status='OCCUPIED'` nos quartos (de `reservation_rooms`) das reservas CHECKED_IN dos tenants aurora/sol que ainda estejam AVAILABLE. É idempotente.
