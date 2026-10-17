# Repasse para Gabriel — 17/10/2026
Origem: `docs/qa/redteam_asaas-pix_16out2026.md` (branch `feature/asaas-pix`, dev Weslley). Pré-existente, não reprova a branch.

### 🟢 [concorrência] Ramo FAILED do webhook grava sem lock e sem reconferir o status
**Onde:** `services/core-service/app/Controllers/WebhookApi/PixWebhookController.js:98-107`
**Cenário:** duas notificações da mesma cobrança chegam em paralelo e o status no PSP muda entre as duas
consultas (pago e, logo depois, estornado). A requisição 1 segue pelo ramo PAID, trava o `Payment` e grava
`PAID` + reserva `CONFIRMED`. A requisição 2, que leu o `Payment` `PENDING` na `:56` antes do lock, segue pelo
ramo FAILED e faz `payment.save()` com a instância velha: `UPDATE ... SET status='FAILED'`. O resultado é a
reserva `CONFIRMED` com o sinal `FAILED`, e `GetBillController` passa a não abater o sinal.
**Regra violada:** mesma correção de 12/10 (🟡-2) aplicada só ao ramo PAID.
**Correção sugerida:** no ramo FAILED, reler com `PaymentModel.findOne({ where: { id }, lock: transaction.LOCK.UPDATE, transaction })`
e só gravar se o status ainda for `PENDING`.
