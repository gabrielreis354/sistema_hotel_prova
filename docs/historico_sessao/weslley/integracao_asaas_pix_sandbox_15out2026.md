# Integração Asaas PIX (Sandbox) — 15/10/2026

**Dev:** Weslley (sessão orquestrada com Claude Code)
**Branch:** `feature/asaas-pix` (a partir de `origin/develop` em `8840ad5`)
**Status:** implementado, testado de verdade no sandbox (16/10) e auditado pelo qa-redteam (APROVADO COM RESSALVAS, `docs/qa/redteam_asaas-pix_16out2026.md`); mesclado em `develop`

## Contexto

O dev pediu para "resolver o PIX". Os testes manuais da manhã rodaram na branch
`docs/c4-e-sprints`, desatualizada; o `git fetch` mostrou que o Mercado Pago PIX (PR #89, T-03.2)
já estava em `develop`. A tarefa virou: adicionar o Asaas como provider de **sandbox**, ao lado do
`fake` e do `mercadopago`, sem mexer na regra de negócio.

## O que foi feito

| Arquivo | Mudança |
|---|---|
| `app/services/pix/chargeStatus.js` (novo) | `CHARGE_STATUS` normalizado: `PAID` / `FAILED` / `PENDING` |
| `app/services/pix/AsaasPixProvider.js` (novo) | Cliente → cobrança PIX → QR; webhook por `asaas-access-token`; status via `GET /v3/payments/{id}`; trava de sandbox |
| `app/services/pix/PixProvider.js` | Contrato documenta status normalizado, `payerName` e `requiresPayerCpf` |
| `app/services/pix/MercadoPagoPixProvider.js` | Traduz `approved/cancelled/rejected` para `CHARGE_STATUS` |
| `app/services/pix/FakePixProvider.js` | Devolve `CHARGE_STATUS.PAID` |
| `app/services/pix/index.js` | Registra `asaas` |
| `app/Controllers/WebhookApi/PixWebhookController.js` | Compara com `CHARGE_STATUS` em vez do vocabulário do MP |
| `app/Controllers/PublicBookingApi/CreateBookingController.js` | 400 sem CPF quando o provider exige; passa `payerName` |
| `.env.example` | `ASAAS_BASE_URL`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` (sem valores) |
| `tests/asaas-pix.test.js`, `tests/asaas-webhook.test.js` (novos) | 49 testes, `fetch` mockado |
| `docs/pagamentos/ASAAS_SANDBOX.md` (novo) | Passo a passo do sandbox, webhook, limitações |

Decisões (aprovadas pelo dev): **A** status normalizado; **B** CPF obrigatório com Asaas (o
`cpfCnpj` é obrigatório no cadastro do cliente, confirmado na referência oficial); **C** cartão
apenas documentado.

## Evidências

- Suíte completa em `develop` limpo (worktree): **29 arquivos, 490 passed, 1 skipped**.
- Suíte completa na branch: **31 arquivos, 539 passed, 1 skipped** (+49 novos, 0 regressões).
- Mutação proposital (aceitar qualquer token + tratar `PENDING` como pago): **4 testes falharam**;
  restaurado, todos passam.
- Backend real com `PIX_PROVIDER=asaas`: sem CPF → 400; chave `$aact_prod_` → 503 com log
  "não é chave de sandbox" e **a chave não aparece no log**; webhook com token errado → 401;
  nenhuma reserva gravada.
- `scripts/qa_checks.sh`: 0 erros (3 avisos pré-existentes, em arquivos não tocados).
- **Nenhum teste contra o sandbox real** — não havia chave. Só a conectividade foi checada
  (`GET` sem chave → 401).

## ✅ Teste real no sandbox — concluído em 16/10/2026

Backend com `PIX_PROVIDER=asaas` contra `api-sandbox.asaas.com`, hotel `hotel-asaas-teste`:

| Passo | Resultado real |
|---|---|
| Reserva 10–12/03/2027 (R$ 200, sinal 30%) | `201`, reserva `ba5250b5-…` `PENDING` |
| Cobrança criada no Asaas | `pay_r2mqgcempts7u43h`, PIX, R$ 60, `externalReference` = id da reserva (conferido por `GET /v3/payments` direto) |
| QR | BR Code real de homologação (`pix-h.asaas.com/qr/cobv/...`); validade 17/10/2027 |
| Webhook com token falso | `401` |
| Webhook com token certo e corpo dizendo `RECEIVED` (Asaas real: `PENDING`) | `200 pending`, reserva continua `PENDING` |
| Botão **"Confirmar pagamento"** (Ações de Sandbox) | Asaas passa a responder `RECEIVED`, `value: 60` |
| Webhook após a confirmação | `200 confirmed`; reserva `CONFIRMED`, pagamento `PAID` no banco |
| Webhook repetido | `200 already_processed` |
| Cliente criado no Asaas | `notificationDisabled: true` (o painel mostra "Envio por E-mail: Ativo" — não verificado se algum e-mail saiu) |

O webhook foi disparado localmente (sem túnel), com o mesmo formato e token do Asaas; o efeito
dependeu da consulta real à API do Asaas. **Não testado:** o Asaas chamando o webhook por conta
própria (exige URL pública).

Ocorrência: o dev colou no chat uma chave **de produção** (`$aact_prod_`) — não foi usada nem
gravada; orientado a excluí-la em asaas.com. A chave de sandbox também foi colada no chat e deve
ser trocada ao fim dos testes (expira em 15/11/2026).

## Andamento do teste real (parado em 15/10 à noite)

- ✅ Conta sandbox do Asaas criada pelo dev (Pessoa Física, serviço "Desenvolvimento")
- ✅ Chave PIX aleatória cadastrada no sandbox
- ⏳ **Chave de API não gerada**: o Asaas pede validação por celular, e o dev estava sem rede
- ✅ Hotel de teste criado no banco `gestao_hotel_manual` (container `hotel-test-pg`, porta 55432):
  "Hotel Asaas Teste", subdomínio `hotel-asaas-teste`, sinal 30%, categoria Standard R$ 100/noite,
  quartos 101–103, admin `admin@asaas-teste.example`
- ✅ `ASAAS_WEBHOOK_TOKEN` gerado e entregue ao dev (vai no `.env`, junto da chave de API)

## Pendências

1. ~~Teste real no sandbox~~ ✅ feito em 16/10 (o botão "Confirmar pagamento" gera `RECEIVED`).
   Chave de sandbox exposta: ✅ trocada pelo dev em 16/10. Eventos críticos pendentes no painel:
   ✅ tratados pelo dev. Chave de produção exposta: ✅ excluída pelo dev em 16/10. Falta: testar
   o webhook chamado pelo próprio Asaas (ngrok + cadastro em Integrações → Webhooks).
2. ~~Commits e merge em `develop`~~ ✅ feitos em 17/10. Ressalvas 🟡 do qa-redteam (validade de 1 ano da cobrança, 404 que pode pausar a fila do Asaas, CPF malformado → 503) precisam ser resolvidas antes de produção.
3. Swagger de `POST /webhooks/pix` ainda descreve só o HMAC do fake.
4. Cartão de crédito (tokenização, captura, risco) — não iniciado.
5. Herdadas: PIX pago em reserva cancelada só gera log; `payment-mix` soma pagamento de reserva
   cancelada e não filtra `deleted_at` (verificado na branch antiga, **não reverificado** no develop);
   sem job de expiração de reserva `PENDING`.
6. Uma conta Asaas para todos os tenants (sem subcontas).
