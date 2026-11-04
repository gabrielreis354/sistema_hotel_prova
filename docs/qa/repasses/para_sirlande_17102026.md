# Repasse para Sirlande — 17/10/2026
Origem: `docs/qa/redteam_asaas-pix_16out2026.md` (branch `feature/asaas-pix`, dev Weslley). Pré-existente, não reprova a branch.

### 🟢 [integridade] `payments.provider_charge_id` sem índice único
**Onde:** `services/core-service/db/schema.sql:200` · `services/core-service/app/Models/PaymentModel.js:50-53`
**Cenário:** o webhook PIX localiza o pagamento por `findOne({ where: { provider_charge_id } })` global, sem
tenant, porque o callback não tem subdomínio. Nada no banco impede dois `Payment` com o mesmo id de cobrança
(reprocessamento, script de reconciliação, troca de provider com ids colidindo). Se isso acontecer, o
Postgres escolhe a linha, que pode ser de outro tenant, e confirma a reserva errada. Hoje o fluxo não gera
duplicata. É defesa em profundidade no único lookup cross-tenant do sistema.
**Correção sugerida:** índice único parcial `(provider, provider_charge_id) WHERE provider_charge_id IS NOT NULL AND deleted_at IS NULL`.

> **Resolvido em 26/10/2026** (Sirlande, branch `fix/repasses-payments-products`): índice `payments_provider_charge_id_unique` em `(provider_charge_id) WHERE deleted_at IS NULL`, aplicado por `applyDbConstraints.js` (`indicesParciais`) e `schema.sql` (fora do model, de propósito: ver comentário em `PaymentModel.provider_charge_id`). **Global, sem `tenant_id` e sem `provider`**, diferente da sugestão: o id vem do PSP e o webhook busca só por ele, então um índice por tenant ou por provider deixaria a mesma ambiguidade. Teste em `tests/db-constraints.test.js`; relatório em `docs/historico_sessao/sirlande/repasses_payments_products_26out2026.md`.
