# Repasse para Gabriel — 19/10/2026
Origem: `docs/qa/redteam_t042-consumption-migration_delta_19out2026.md`, achado N-1 (branch `feature/t04-2-consumption-migration`, dev Sirlande). Não reprova a branch dele; a causa raiz está no módulo de reservas.

### 🟡 [RN-005 / dinheiro futuro] Troca e remoção de quarto não levam junto a conta que cobra a diária
**Onde:** `services/core-service/app/Controllers/ReservationApi/UpdateReservationController.js:85-90` (troca o `room_id`, e o trigger troca o pivô, mas as contas não são tocadas). Também `RemoveRoomFromReservationController.js:38` (remove o extra e deixa a conta dele).
**Cenário (reproduzido):** reserva CHECKED_IN no 906, e a recepção abre a conta ROOM `charges_lodging` do 906. `PUT /reservations/:id { room_id: 907 }` → 200. A conta continua apontando para o 906, que saiu de `reservation_rooms`. Em seguida, `POST /accounts` ROOM no 907 → 201. Agora há **duas** contas cobrando diária na mesma estadia, uma delas num quarto que o hóspede deixou. O mesmo acontece com `DELETE /reservations/:id/rooms/:roomId` de um extra que tem conta própria. Hoje o `bill` ignora a diária das contas, então não há valor errado **ainda**. O fechamento por conta da T-04.3 vai cobrar a diária duas vezes. Desde a T-04.2 (D-28), também existe conta ROOM antes do check-in, e aí a troca de quarto é rotina.
**Regra violada:** RN-005 / D-3 (uma conta cobrando diária por quarto da estadia) e D-5 (a conta de suíte pertence ao quarto da estadia).
**Correção sugerida:** na mesma transação da troca, re-apontar para o quarto novo a conta `charges_lodging` (não fechada) do quarto que sai. Na remoção do extra, desligar `charges_lodging` ou recusar com 409 enquanto houver conta aberta nele. O Sirlande já re-aponta no caminho da rota antiga (`app/utils/reservationRoomAccount.js`, D-32), e a lógica pode ser reaproveitada daí. Combinar com ele, que é dono de `accounts`.

---

### ℹ️ [Aviso, não é achado] A T-04.3 acrescentou uma chamada em 4 controllers seus
**Origem:** branch `feature/t04-3-account-bill` (dev Sirlande), commit `73ece40`. Decisão D-36 em `docs/specs/anexos/SPEC-04-decisoes-T-04.3.md`.
**O que mudou:** check-out, cancelamento de reserva, cancelamento de contrato e exclusão de reserva chamam `closeReservationAccounts(reserva, transação)`, que fecha as contas `OPEN` da reserva na mesma transação. Se o fechamento falha, o encerramento volta atrás.
- `CheckOutController.js`, `CancelReservationController.js`, `CancelContractController.js`: um import e uma chamada antes do `commit`.
- `DeleteReservationController.js`: passou a usar transação e a travar a reserva (`FOR UPDATE`), porque agora toca duas tabelas.
**O que pedir de você:** se for mexer nesses arquivos, mantenha a chamada dentro da transação. Um caminho novo que encerre reserva (por exemplo, no-show) deve chamar o mesmo utilitário.
**Sobre o 🟡 acima (troca de quarto):** desde a T-04.3, a conta cujo quarto saiu da reserva tem diária 0 no bill. O risco de cobrar a diária duas vezes acabou, mas a conta continua apontando para o quarto antigo, e a correção sugerida segue válida.

---

### 🟡 [Complemento ao repasse de troca de quarto] Com a T-04.3, o efeito passou de "diária em dobro" para "diária não cobrada"
**Origem:** `docs/qa/redteam_t043-account-bill_19out2026.md` (🟡-3), branch `feature/t04-3-account-bill`. Não reprova a branch.
**Onde:** `services/core-service/app/Controllers/ReservationApi/UpdateReservationController.js:85-90`
**Cenário (reproduzido):** reserva CHECKED_IN de 1 quarto (400.00) com conta da suíte. `PUT /reservations/:id { room_id: <novo> }` → 200. O `GET /accounts/:id/bill` da única conta da estadia mostra agora `room_charges: 0.00`, e ela pode ser fechada assim (`PUT /accounts/:id/close` → 200, total só com o consumo). O aviso acima diz que "o risco de cobrar a diária duas vezes acabou". Acabou, mas no lugar dele ficou a diária **não** cobrada pela conta.
**Regra violada:** RN-005 / D-3, e D-33 (soma das contas = total da reserva).
**Correção sugerida:** a mesma do repasse acima: re-apontar a conta de diária **OPEN** para o quarto novo na transação da troca. A prioridade sobe, porque agora há valor apresentado errado. O Sirlande também vai tratar no bill (🔴-1/🟡-3 do relatório), mas a conta apontando para o quarto errado continua sendo do módulo de reservas.
