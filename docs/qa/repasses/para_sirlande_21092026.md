# Repasses para Sirlande — 21/09/2026

Origem: auditoria da branch `feature/mercadopago-pix` (T-03.2, Weslley) —
`docs/qa/redteam_mercadopago-pix_21set2026.md`.
Dono da área por §7 da divisão de trabalho: `services/core-service/db/schema.sql` e
`services/core-service/app/Models/`.

---

## 🟡 `payments.provider_charge_id` não tem índice nem unique

**Onde:** `services/core-service/db/schema.sql:165` · `services/core-service/app/Models/PaymentModel.js:50-53`

A coluna é declarada como `TEXT` simples, sem índice e sem restrição de unicidade — confirmado por
`grep -n "indexes" app/Models/PaymentModel.js` (bloco inexistente) e pela leitura da tabela
`payments` no schema.

**Cenário concreto 1 — desempenho no caminho quente.** `POST /webhooks/pix` resolve a cobrança com
`PaymentModel.findOne({ where: { provider_charge_id } })`
(`app/Controllers/WebhookApi/PixWebhookController.js:38`). É *sequential scan* em `payments` a cada
notificação do PSP. Com o provedor real entrando em operação, o volume de notificações passa a ser
de produção (o Mercado Pago reenvia em caso de falha, com backoff), e `payments` é a tabela que mais
cresce depois de `reservations`.

**Cenário concreto 2 — colisão cross-tenant, hoje latente.** A busca não filtra por `tenant_id`
(correto: o PSP não conhece subdomínio). Isso só é seguro enquanto o id da cobrança for globalmente
único. Hoje é, porque existe **uma** credencial Mercado Pago para todos os tenants
(`MERCADOPAGO_ACCESS_TOKEN` global, `app/services/pix/MercadoPagoPixProvider.js:18`). No momento em
que a credencial virar por tenant — que é o desenho correto para o produto, já que o dinheiro é do
hotel — os ids de pagamento do MP passam a ser sequências **por conta coletora** e podem coincidir
entre hotéis. Aí o webhook do Hotel A marca como paga a cobrança do Hotel B, e é dinheiro.

**Regra violada:** CLAUDE.md §8 ("Unique composto (SaaS multi-tenant)") · risco financeiro
cross-tenant.

**Correção sugerida (a menor que resolve as duas):** índice único parcial composto com `tenant_id`,
no padrão que você já aplicou em `products`:

```js
indexes: [{
    unique: true,
    fields: ['provider_charge_id', 'tenant_id'],
    name: 'payments_provider_charge_tenant_unique',
    where: { provider_charge_id: { [Op.ne]: null } }   // pagamentos sem PSP ficam de fora
}]
```

O parcial é necessário: pagamento em dinheiro/cartão tem `provider_charge_id` nulo e vários nulos
não podem conflitar. Vale a mesma cautela da T-06.6 — banco que já tem a tabela não recebe índice
novo por `sync({ alter })`; o caminho é `applyDbConstraints.js`.

> Observação de escopo: **não reprova** a branch `feature/mercadopago-pix`. O defeito é da modelagem,
> anterior a ela; a integração apenas o torna alcançável.
