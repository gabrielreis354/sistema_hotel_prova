# Repasse — DONO INDEFINIDO — 19/10/2026
Origem: `docs/qa/redteam_t044-payment-account_19out2026.md` (branch `feature/t044-payment-account`, dev Sirlande). Defeito anterior à branch, em área sem dono claro no `docs/DIVISAO_TRABALHO_TIME_09set2026.md` (PaymentApi genérico).

### 🟡 [segurança · financeiro] `DELETE` e `PUT /payments/:id` sem `requireRole('ADMIN')` e sem trilha
**Onde:** `services/core-service/routes/apis/paymentRouter.js:17-18`. `DeletePaymentController.js` não grava `deleted_by`.
**Cenário:** uma RECEPTIONIST faz `DELETE /payments/<id>` do pagamento que quitava uma conta. A conta volta de PAID para CLOSED (desde a T-04.4) e o dinheiro some do caixa e da receita, sem registro de quem excluiu. O `PUT` deixa reduzir o valor do mesmo jeito. Excluir lançamento de conta já é só ADMIN e com `deleted_by` (D-7, D-8). Pagamento, que é mais sensível, não segue a mesma regra.
**Regra violada:** checklist do qa-redteam §1 (endpoint destrutivo exige ADMIN; trilha `deleted_by` em operação financeira). Decisão D-2 de 04/10 (lançamento financeiro se estorna, não se apaga).
**Correção sugerida:** `requireRole('ADMIN')` no `DELETE` e no `PUT`, e `deleted_by` em `payments`, como em `account_items`. A solução definitiva é o estorno da T-06.13 da SPEC-06.
