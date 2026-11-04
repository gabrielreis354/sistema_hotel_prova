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

---

## Tratamento — 21/10/2026 (Gabriel, branch `fix/repasses-gabriel-out`)

**Tratado.** No ramo FAILED, o `PixWebhookController` relê o `Payment` com `lock: transaction.LOCK.UPDATE` dentro da transação e só grava `FAILED` se ainda estiver `PENDING` (allowlist). Em qualquer outro status, responde `already_processed`, como o ramo PAID.
- Teste de concorrência em `tests/asaas-webhook.test.js` (PAID e FAILED simultâneos, nas duas ordens). RED em `0d31d72`: o resultado era `confirmed` + `not_approved`, ou seja, reserva CONFIRMED com sinal FAILED. GREEN em `59650de`.
- Relatório: `docs/historico_sessao/gabriel/repasses_conta_quarto_webhook_21102026.md`.

### Tratamento — complemento de 21/10
O teste de corrida não depende mais de `setTimeout`. A segunda resposta do PSP mockado só sai quando a primeira notificação grava o pagamento (commit `c91303f`, 🟢-3 da auditoria `docs/qa/redteam_repasses-gabriel-out_21out2026.md`). Conferido por mutação: o controller antigo volta a falhar.
