# PIX com Asaas (Sandbox)

> Provider `asaas` do motor de reserva direta. **Somente sandbox nesta fase**: o backend
> recusa URL fora de `api-sandbox.asaas.com` e chave que não comece com `$aact_hmlg_`.
> O padrão do sistema continua sendo `PIX_PROVIDER=fake`.

Fontes oficiais usadas (consultadas em 15/10/2026):
[Autenticação](https://docs.asaas.com/docs/autenticação) ·
[Sobre os webhooks](https://docs.asaas.com/docs/sobre-os-webhooks) ·
[Eventos para cobranças](https://docs.asaas.com/docs/webhook-para-cobrancas) ·
[Cobranças via Pix](https://docs.asaas.com/docs/cobrancas-via-pix) ·
[Criar novo cliente](https://docs.asaas.com/reference/criar-novo-cliente) ·
[Criar nova cobrança](https://docs.asaas.com/reference/criar-nova-cobranca) ·
[Recuperar uma cobrança](https://docs.asaas.com/reference/recuperar-uma-unica-cobranca) ·
[FAQ Sandbox](https://docs.asaas.com/docs/duvidas-frequentes-sandbox) ·
[Pix no sandbox sem chave = 404](https://docs.asaas.com/docs/tentar-pagar-qr-code-pix-no-sandbox-sem-chave-cadastrada-erro-404)

---

## 1. Como funciona

```
Hóspede                 core-service                         Asaas (sandbox)
  │ POST /public/:sub/bookings (com CPF)                         │
  │──────────────────────▶│ POST /v3/customers (nome, CPF)  ────▶│
  │                       │ POST /v3/payments (PIX, externalReference = id da reserva) ─▶│
  │                       │ GET  /v3/payments/{id}/pixQrCode ───▶│
  │◀── 201 reserva PENDING + copia-e-cola                         │
  │                                                               │
  │   (paga o PIX — no sandbox: botão no painel)                  │
  │                       │◀── POST /webhooks/pix  (header asaas-access-token)
  │                       │ confere o token → GET /v3/payments/{id} (fonte de verdade)
  │                       │ RECEIVED/CONFIRMED + valor confere → Payment PAID, reserva CONFIRMED
```

- O **corpo** do webhook nunca é usado para decidir: o status e o valor vêm sempre de `GET /v3/payments/{id}`.
- O Asaas **não assina** o corpo (não há HMAC). A autenticação documentada é o token que você cadastra no webhook, enviado no cabeçalho `asaas-access-token`.

| Status no Asaas | Efeito no sistema |
|---|---|
| `RECEIVED`, `CONFIRMED` (com valor igual ao cobrado) | Payment `PAID`; reserva `PENDING → CONFIRMED` |
| `RECEIVED`/`CONFIRMED` com valor diferente | Payment `FAILED` (sinal de fraude) |
| `REFUNDED`, `REFUND_*`, `CHARGEBACK_*`, cobrança removida (`deleted: true`) | Payment `FAILED`, reserva intocada |
| `PENDING`, `OVERDUE`, `RECEIVED_IN_CASH`, `AWAITING_RISK_ANALYSIS`, qualquer outro | Nada muda — aguarda nova notificação |

`OVERDUE` não encerra porque PIX vencido ainda pode ser pago com atraso.
`RECEIVED_IN_CASH` (baixa manual no painel) não confirma porque o sinal online é por PIX.

## 2. Criar a conta sandbox

1. Crie a conta em <https://sandbox.asaas.com> **pelo navegador** (é separada da conta de produção;
   a chave de API não pode ser gerada pelo app). Use dados fictícios, como recomenda a doc oficial.
   **Confira o endereço**: chave gerada em `asaas.com` começa com `$aact_prod_` e é de dinheiro real.
2. **Cadastre uma chave PIX na conta sandbox.** Sem ela, pagar um QR no sandbox dá erro 404 (doc oficial acima).
3. Gere a chave de API em **Integrações → Chaves de API**. Ela começa com `$aact_hmlg_`.

## 3. Variáveis de ambiente

Em `services/core-service/.env` (nunca versionado; o `.env.example` tem os nomes sem valores):

```bash
PIX_PROVIDER=asaas
ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3
ASAAS_API_KEY=$aact_hmlg_...            # da conta sandbox
ASAAS_WEBHOOK_TOKEN=<string forte que VOCÊ inventa>   # NÃO pode ser igual à API Key
```

Gere o token com, por exemplo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Se a chave começar com `$aact_prod_` ou a URL não for o sandbox, toda reserva responde
`503` e o log mostra `ASAAS_API_KEY não é chave de sandbox — recusada` (a chave nunca é impressa).

> Atenção ao `$` no `.env`: o `dotenv` lê o valor literal, mas no shell use aspas simples
> (`ASAAS_API_KEY='$aact_hmlg_...'`), senão o `$aact...` é tratado como variável.

## 4. Subir o projeto

```bash
cd services/core-service
npm install
node command.js migrate
ALLOW_SEED=1 node command.js seed      # cria o Hotel Aurora (subdomínio "aurora", sinal de 30%)
npm start                               # porta NODE_WEB_PORT (padrão 3000)
```

## 5. Expor o webhook para o Asaas

O Asaas precisa alcançar `POST /webhooks/pix` por HTTPS público. Localmente, use um túnel
(ex.: `ngrok http 3000`) e copie a URL `https://....ngrok-free.app`.

No painel do sandbox, em **Integrações → Webhooks**, crie um webhook:
- URL: `https://<seu-tunel>/webhooks/pix`
- Token de autenticação: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`
- Eventos: os de **cobrança** (`PAYMENT_*`). Basta `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`,
  `PAYMENT_OVERDUE`, `PAYMENT_DELETED` e `PAYMENT_REFUNDED`.

## 6. Testar o fluxo completo

```bash
B=http://localhost:3000

# 1. pegar uma categoria
curl "$B/public/aurora/availability?check_in=2027-03-10&check_out=2027-03-12"

# 2. reservar (CPF é obrigatório com o Asaas)
curl -X POST $B/public/aurora/bookings -H "Content-Type: application/json" -d '{
  "category_id": "<id>", "check_in": "2027-03-10", "check_out": "2027-03-12", "guests": 1,
  "guest": { "full_name": "Hospede Teste", "email": "voce@exemplo.com", "cpf": "<cpf de teste>" }
}'
```

A resposta traz `pix.qr_code` (o **copia-e-cola** do Asaas) e `pix.provider_charge_id` (`pay_...`).
A imagem do QR pode ser gerada a partir do copia-e-cola por qualquer gerador de QR; a cobrança
também aparece no painel do sandbox com o QR.

**Simular o pagamento:** o Asaas **não tem endpoint** para confirmar cobrança no sandbox (FAQ
oficial). No painel do sandbox: **Cobranças → abrir a cobrança → Ações de Sandbox → "Confirmar
pagamento"**. A cobrança passa a `RECEIVED` (verificado em 16/10/2026) e o Asaas dispara o webhook.

- **Não tente pagar o QR pelo app do banco**: o QR de sandbox é de homologação (`pix-h.asaas.com`)
  e os bancos recusam ("o pagamento desse pix falhou"). Não há dinheiro envolvido.
- Se o painel pedir token SMS (ex.: ao gerar a chave de API), o sandbox aceita o código fixo
  `000000` ([Como testar ações críticas](https://docs.asaas.com/docs/how-to-test-critical-actions)).
- **Sem túnel?** Dá para disparar o webhook localmente com o mesmo token; o efeito continua
  vindo da consulta real ao Asaas:
  ```bash
  curl -X POST $B/webhooks/pix -H "Content-Type: application/json" \
    -H "asaas-access-token: $ASAAS_WEBHOOK_TOKEN" \
    -d '{"event":"PAYMENT_RECEIVED","payment":{"id":"pay_..."}}'
  ```

**Verificar:**

```bash
curl $B/public/aurora/bookings/<reservation.id>/status
# esperado: "status": "CONFIRMED", "deposit": { "status": "PAID", ... }, "confirmed": true
```

E no painel do Asaas, em **Webhooks → Logs**, a entrega deve aparecer com resposta `200`.

## 7. Cartão de crédito — não implementado

O fluxo atual cobra só o **sinal por PIX**. Cartão precisa de mais do que um novo `billingType`:
tokenização no navegador (os dados do cartão não podem passar pelo backend sem PCI), tratamento
de `PAYMENT_AUTHORIZED`/captura, análise de risco (`PAYMENT_AWAITING_RISK_ANALYSIS`) e uma tela de
pagamento no frontend. Fica como pendência; não foi simulado.

## 8. Testes automatizados

Rodam **sem conta e sem rede** (o `fetch` é mockado):

```bash
cd services/core-service
npx vitest run asaas          # tests/asaas-pix.test.js + tests/asaas-webhook.test.js
npm test                      # suíte inteira (precisa de Postgres em localhost:55432, ver .env.test)
```

Eles provam que o sistema chama as rotas/campos da documentação e reage certo a cada resposta.
**Não provam** que o sandbox real responde exatamente assim — isso só o teste manual da seção 6.

## 9. Limitações conhecidas

- **Uma conta Asaas para todos os hotéis** (mesma limitação do Mercado Pago): o dinheiro de todos
  os tenants cai na mesma conta. Repasse por hotel exige subcontas do Asaas — fora deste escopo.
- **Um cliente Asaas por reserva**: o Asaas permite clientes duplicados; o sistema não reaproveita
  o `cus_...` do hóspede entre reservas.
- **Cobrança órfã**: se o Asaas criar a cobrança e a gravação da reserva falhar, o id `pay_...`
  vai para o log para conciliação manual.
- **Webhook de cobrança desconhecida responde 404**: o Asaas reenvia e, após 15 falhas
  seguidas, pausa a fila. Não use a mesma conta sandbox para cobranças de outros sistemas.
- **Validade do QR**: o sistema grava a `expirationDate` do Asaas. Não existe job que expire a
  reserva `PENDING` por falta de pagamento.
- **PIX pago para reserva cancelada** só gera log de aviso (herdado do controller atual).
