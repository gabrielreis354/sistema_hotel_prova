# Repasses para Gabriel — 16/09/2026

Origem: auditoria da branch `fix/public-booking-payment-leak` (T-06.5) —
relatório em `docs/qa/redteam_public-booking-leak_16set2026.md`.

Área: SPEC-06 T-06.9 (endurecimento do webhook PIX) — `docs/DIVISAO_TRABALHO_TIME_09set2026.md` §0 e §3.1.

---

## 🔴 [segurança/financeiro] `GET /payments` devolve o model inteiro — `provider_charge_id` e `pix_qr_code` para qualquer usuário autenticado do tenant

**Onde:** `services/core-service/app/Controllers/PaymentApi/ListPaymentController.js:14` ·
`services/core-service/app/Controllers/PaymentApi/GetPaymentController.js:36`

**Cenário concreto:**
1. Qualquer usuário autenticado do tenant (o `paymentRouter` não tem `requireRole` —
   `routes/apis/paymentRouter.js:14`) chama `GET /payments`.
2. `return response.json(payments)` devolve as linhas cruas do `PaymentModel`, com
   `provider_charge_id`, `pix_qr_code`, `provider` e `pix_expiration`.
3. Com o `provider_charge_id` em mãos, `POST /webhooks/pix` (sem assinatura,
   `WebhookApi/PixWebhookController.js:26`) marca o pagamento como `PAID` e promove a reserva
   para `CONFIRMED` — sem dinheiro entrar.

É o mesmo vazamento que a T-06.5 fechou no endpoint público, um nível acima: exige login,
mas não exige ADMIN. Quando existir o papel `WAITER`, ele lê a mesma lista.

**Regra violada:** LGPD art. 6º, III (minimização) · CLAUDE.md §7 (risco financeiro).

**Correção sugerida:** `attributes` explícito nos dois controllers (sem `pix_qr_code`,
`provider_charge_id`, `provider`), ou `defaultScope` no `PaymentModel` excluindo esses três
campos, com escopo `withProviderData` só onde o webhook precisa.

---

## 🔴 [segurança/financeiro] `POST /public/:subdomain/bookings` continua devolvendo `provider_charge_id` sem autenticação

**Onde:** `services/core-service/app/Controllers/PublicBookingApi/CreateBookingController.js:158-162` ·
teste que fixa o comportamento: `services/core-service/tests/public-booking.test.js:95`

**Cenário concreto:** o corpo do 201 traz `pix.provider_charge_id`. Qualquer pessoa, sem login,
cria uma reserva, pega o id da cobrança e confirma o próprio pagamento via `POST /webhooks/pix`.
O hóspede precisa de `qr_code` e `expiration` — o txid não tem uso para ele.

Está registrado também no relatório principal porque é literalmente o CA-06.5.b
("`pix_qr_code` e `provider_charge_id` nunca retornam sem autenticação"), mas a correção
depende de decisão da T-06.9: o Swagger documenta hoje o disparo manual do webhook com esse id
(`services/core-service/config/swagger.js:190`) e o `tests/public-booking.test.js:108-116` usa o
valor devolvido para simular o PSP.

**Regra violada:** CA-06.5.b · CLAUDE.md §7 (risco financeiro).

**Correção sugerida:** remover `provider_charge_id` do corpo público e mudar o teste para ler o
id direto do banco (ou de um endpoint autenticado), junto com a assinatura HMAC do webhook.
Atualizar a descrição do Swagger na mesma passagem.

---

## 🟡 [multi-tenancy] Webhook PIX busca pagamento sem `tenant_id`

**Onde:** `services/core-service/app/Controllers/WebhookApi/PixWebhookController.js:26`

**Cenário:** `PaymentModel.findOne({ where: { provider_charge_id } })` varre todos os tenants.
O comentário da linha 25 justifica (o callback não tem subdomínio) e a busca da reserva logo
abaixo reamarra o `tenant_id` do próprio pagamento, então hoje não há mistura de dados. Fica
registrado porque a unicidade de `provider_charge_id` **não é garantida por índice** — com dois
PSPs, ou com o provider fake em staging, dois tenants podem ter o mesmo id e o webhook confirma
o pagamento do tenant errado.

**Regra violada:** CLAUDE.md §7 (query sem `tenant_id`) — com atenuante documentada.

**Correção sugerida:** índice único em `(provider, provider_charge_id)` no `PaymentModel`, ou
resolver o tenant pela assinatura do PSP quando a T-06.9 for feita.
