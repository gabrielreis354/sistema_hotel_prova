# Repasses para Gabriel — 21/09/2026

Origem: auditoria da branch `feature/mercadopago-pix` (T-03.2, Weslley) —
`docs/qa/redteam_mercadopago-pix_21set2026.md`.
Áreas por §7 da divisão de trabalho: T-06.9 (webhook sem assinatura) e T-06.2 (`config/swagger.js`,
arquivo congelado até a reescrita).

---

## 🔴 T-06.9 continua aberta — o provider padrão não assina nada, e o comentário novo sugere que assina

**Onde:** `services/core-service/app/services/pix/FakePixProvider.js:32-37` ·
`services/core-service/app/Controllers/WebhookApi/PixWebhookController.js:18-20`

A branch da T-03.2 acrescentou `verifyWebhook` ao contrato `PixProvider` e implementou validação
HMAC-SHA256 real (com `crypto.timingSafeEqual`) **no `MercadoPagoPixProvider`**. Isso é metade do que
a CA-06.9.a pede — e é a metade que quase ninguém executa, porque o provider padrão continua sendo o
fake:

```js
// FakePixProvider.js:35-37
verifyWebhook(request) {
    return { providerChargeId: request.body.provider_charge_id };
}
```

**Cenário concreto (inalterado desde a auditoria de 26/08):** com `PIX_PROVIDER` ausente, com typo,
ou igual a `fake` — o default em dev, teste, staging e demo — qualquer POST anônimo em
`/webhooks/pix` com um `provider_charge_id` válido marca o pagamento como `PAID` e promove a reserva
para `CONFIRMED`. Verificado em execução: `PIX_PROVIDER=mercadopagoo` → `FakePixProvider`, em
silêncio (`app/services/pix/index.js:22-24`, `PROVIDERS[key] || FakePixProvider`).

**O que mudou e por que estou repassando agora:** o comentário novo no controller afirma
*"um PSP real valida a assinatura da notificação antes de confiar em qualquer id (nunca confia em
POST anônimo)"*. Lido rápido, ele passa a impressão de que a T-06.9 foi resolvida pela integração.
Não foi — e a CA-06.9.d é explícita: **o `FakePixProvider` precisa assinar a notificação**, para que
o fluxo de teste exercite o caminho real. O ponto de extensão para isso agora existe (é o
`verifyWebhook` do contrato), o que barateia sua tarefa: basta o fake gerar e conferir o mesmo HMAC,
com um segredo de teste vindo do `.env`.

**Regra violada:** RNF-012 (assinatura verificada em 100% dos webhooks) · CLAUDE.md §7 (risco
financeiro) · fail-safe.

**Correção sugerida:** `FakePixProvider.verifyWebhook` valida HMAC com `PIX_FAKE_WEBHOOK_SECRET` e
`createCharge` devolve o material para o teste assinar; ajustar `tests/public-booking.test.js` para
assinar a notificação (os 15 testes atuais disparam POST cru e vão falhar — é exatamente o sinal que
prova que a proteção existe). Fechar também a CA-06.9.c com teste de "sem assinatura → 401 **e
estado intacto**".

> Observação de escopo: pré-existente, **não reprova** a branch de T-03.2.

---

## 🟡 O contrato de `/webhooks/pix` mudou — precisa entrar na reescrita da T-06.2

**Onde:** `services/core-service/config/swagger.js:144-199` (não tocado pela branch, corretamente) ·
`app/Controllers/WebhookApi/PixWebhookController.js:28-30` ·
`app/Controllers/PublicBookingApi/CreateBookingController.js:99`

A T-03.2 não encostou no `swagger.js` — respeitou a regra de §7 ("uma pessoa, uma vez, e ninguém
encosta durante"). O efeito colateral é que o delta de contrato só existe no código. Para a T-06.2
absorver:

**`POST /webhooks/pix`** — com `PIX_PROVIDER=mercadopago`:
- o corpo documentado hoje (`{ provider_charge_id }`, marcado como `required`) **não é lido**; o id
  vem de `?data.id=<id>` (query) ou de `body.data.id`;
- passam a existir dois headers obrigatórios: `x-signature: ts=<unix>,v1=<hmac-sha256-hex>` e
  `x-request-id: <string>`;
- resposta nova: **401** `{ error: 'Assinatura da notificação inválida' }`;
- com `PIX_PROVIDER=fake` o contrato antigo continua valendo — ou seja, hoje o endpoint tem dois
  contratos, selecionados por env. Vale decidir na T-06.2 qual documentar (sugestão: o real, com nota
  sobre o modo simulado).

**`POST /public/{subdomain}/bookings`**:
- resposta nova: **503** `{ error: 'Serviço de pagamento indisponível no momento' }` quando o PSP
  falha, expira o timeout de 10 s ou está sem credencial.

**Regra violada:** CLAUDE.md §7 (endpoint/contrato fora do Swagger quebra o cliente tipado do
frontend).

---

## Lembrete (sem dono formal): a pendência "T-06.12" da SPEC-06 §T-06.5 segue aberta

`GET /payments` e `GET /payments/:id` continuam devolvendo o `Payment` inteiro — incluindo
`provider_charge_id` e `pix_qr_code` — a qualquer usuário autenticado do tenant, sem `requireRole`
(`app/Controllers/PaymentApi/ListPaymentController.js:14`, `GetPaymentController.js:17`,
`routes/apis/paymentRouter.js:15-16`). Registrado em
`docs/specs/SPEC-06-qualidade-divida-tecnica.md:107` e em
`docs/qa/redteam_public-booking-leak_16set2026.md`.

**Nuance nova trazida pela T-03.2:** com `PIX_PROVIDER=mercadopago`, conhecer o `provider_charge_id`
deixa de bastar para forjar a confirmação — a assinatura passa a ser exigida. O vazamento continua
sendo vazamento (LGPD, minimização), mas perde o efeito de "senha do webhook" **nesse modo**. Com o
fake — o default — nada mudou. A recomendação anterior segue valendo e resolve os dois de uma vez:
`defaultScope` em `PaymentModel` excluindo `pix_qr_code`, `provider_charge_id` e `provider`.

Como a T-06.12 ainda não tem dono atribuído na divisão de trabalho, o item fica aqui por proximidade
com a T-06.9 e com o portão de QA — não como atribuição.
