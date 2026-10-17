# QA Red Team — Asaas PIX (sinal da reserva direta, somente sandbox)

**Branch:** `feature/asaas-pix` (`75d40dd`) · **Dev:** Weslley · **Base:** develop@`8840ad5` · **Data:** 16-17/10/2026
**Commits auditados:** `5602a64` (status normalizado) · `a4702ab` (provider Asaas) · `6b5f205` (testes) · `870c613` e `75d40dd` (docs)
**Arquivos auditados:** 13 do diff, mais 7 lidos para contexto (`PaymentModel`, `webhookRouter`, `config/swagger.js`,
`CancelReservationController`, `GetAlertsController`, `onlyDigits`, `redteam_mercadopago-pix_delta_12out2026.md`)
**Achados no escopo:** 10 (🔴 0 · 🟡 3 · 🟢 7) · **Repassados:** 2

## Veredito

**APROVADO COM RESSALVAS**

Nenhum caminho encontrado em que uma chamada pública ao `/webhooks/pix` confirme reserva sem pagamento real
ou confirme reserva de outro tenant. O token é comparado em tempo constante, o status e o valor vêm sempre de
`GET /v3/payments/{id}` e nunca do corpo. O mapeamento é allowlist e a trava de sandbox resistiu a todas as
variantes de URL que testei. Não há segredo nem PII em log, resposta ou histórico git. Fake e Mercado Pago
não regrediram.

As três ressalvas 🟡 precisam ser resolvidas **antes de destravar produção**, e as duas primeiras de
preferência já:
1. A cobrança Asaas fica pagável por **1 ano** (validade observada no próprio teste real), e o contrato
   `expiresInMinutes` é ignorado. Assim, reserva cancelada continua recebendo PIX.
2. Toda notificação autenticada de cobrança desconhecida recebe **404**. Cobrança órfã gera `PAYMENT_OVERDUE`
   no dia seguinte, e isso alimenta a penalização da fila do Asaas, que vale para todos os hotéis.
3. CPF malformado vira 503 "serviço indisponível" em vez de 400.

---

## Achados no escopo

### 🟡 1 [financeiro / contrato] A cobrança Asaas ignora `expiresInMinutes` e fica pagável por 1 ano, inclusive para reserva cancelada
**Onde:** `services/core-service/app/services/pix/AsaasPixProvider.js:127` (assinatura sem `expiresInMinutes`),
`:154` (`dueDate: todayInBrazil()`), `:173` (`expiration` = `expirationDate` do Asaas) · contrato em
`app/services/pix/PixProvider.js:23` (`expiresInMinutes=30`) · efeito em
`app/Controllers/WebhookApi/PixWebhookController.js:139-145`
**Cenário:** o hóspede reserva e recebe `pix.expiration`. O relatório do teste real
(`docs/historico_sessao/weslley/integracao_asaas_pix_sandbox_15out2026.md:53`) registra a validade
**17/10/2027**. Ele não paga. Passadas 48 h, `GetAlertsController` lista a reserva em `pending_too_long` e a
recepção cancela. `CancelReservationController` não toca o `Payment` nem o PSP. Dias depois o hóspede paga
o QR, que continua válido. O webhook marca o `Payment` como `PAID`, deixa a reserva `CANCELLED` e só emite um
`console.warn`. O dinheiro entra sem reserva e o quarto pode já ter sido revendido. No Mercado Pago a mesma
janela é de 30 min (`MercadoPagoPixProvider.js:28,34`). O Asaas viola o contrato que o MP cumpre (LSP), e a
resposta pública diz ao hóspede que ele tem um ano para pagar.
**Regra violada:** CLAUDE.md §7 (risco financeiro) · SOLID-LSP (contrato do `PixProvider`).
**Correção sugerida:** o menor ajuste é o provider devolver `expiration = now + expiresInMinutes` (a validade
que o sistema promete) em vez da data do Asaas. Para fechar a janela de verdade:
`cancelCharge(providerChargeId)` no contrato (`DELETE /v3/payments/{id}` no Asaas, no-op no fake), chamado no
cancelamento de reserva DIRECT com sinal `PENDING` e por um job de expiração. Registrar como pendência
bloqueante para produção.

### 🟡 2 [disponibilidade / financeiro] Notificação autenticada de cobrança desconhecida responde 404, e cobrança órfã envenena a fila do Asaas no dia seguinte
**Onde:** `services/core-service/app/Controllers/WebhookApi/PixWebhookController.js:57-62` (404) e `:51-53`
(400 sem `payment.id`) · `docs/pagamentos/ASAAS_SANDBOX.md:94-95` (assina `PAYMENT_OVERDUE` e
`PAYMENT_DELETED`) e `:169-170` (reconhece a pausa após 15 falhas) · `services/core-service/tests/asaas-webhook.test.js:282-287`
(o teste fixa o 404 como comportamento esperado)
**Cenário (determinístico):** duas reservas disputam o último quarto. A segunda cria a cobrança `pay_X` e
cai no EXCLUDE, o que gera 409 e deixa a órfã no Asaas, como o próprio guia admite. O `dueDate` é hoje, então
amanhã o Asaas emite `PAYMENT_OVERDUE` de `pay_X` (evento assinado conforme o guia). O webhook responde 404 e
o Asaas reenvia. Se o hotel seguir a orientação de "reconciliar/cancelar no PSP", também chega
`PAYMENT_DELETED` de `pay_X`, e de novo 404. O guia diz que o Asaas pausa a fila depois de 15 falhas
seguidas. Com uma conta para todos os tenants (`ASAAS_SANDBOX.md:158`), pausada a fila **nenhum hotel recebe
mais confirmação** até alguém reativá-la no painel. O 404 existia para não dar a quem não está autenticado um
oráculo de enumeração. Esse risco não se aplica aqui, porque a resposta só sai depois de `verifyWebhook`.
**Regra violada:** fail-safe operacional · CLAUDE.md §7 (reserva paga que não confirma).
**Correção sugerida:** depois da autenticação, responder `200 { status: 'ignored' }` com o `console.warn`
que já existe, tanto para cobrança desconhecida quanto para corpo sem `payment.id` (evento que não é de
cobrança). Atualizar o teste da `:282` e a seção 9 do guia.
`SUSPEITA` (falta confirmar na doc ou no sandbox): se a fila do Asaas for **sequencial**, um único evento
falhando já segura os seguintes enquanto é reenviado.

### 🟡 3 [validação / UX] Só a presença do CPF é validada, e CPF malformado devolve 503 "serviço indisponível"
**Onde:** `services/core-service/app/Controllers/PublicBookingApi/CreateBookingController.js:95-97` ·
`AsaasPixProvider.js:118-121`
**Cenário:** `guest.cpf = "123"` ou `"111.111.111-11"`. `onlyDigits` devolve `"123"`, que é truthy, e a
reserva passa. O Asaas recusa `POST /customers` com 400, o provider converte em
`PixProviderUnavailableError` e o hóspede recebe `503 "Serviço de pagamento indisponível no momento"`. A
mensagem diz que o problema é do sistema, não do dado digitado, e o hóspede não tem o que corrigir. A
decisão B do relatório ("400 claro em vez de 503") fica atendida só para o caso de CPF ausente.
**Regra violada:** erro que não diz o que fazer · fail-fast antes de chamada de rede.
**Correção sugerida:** validar 11 dígitos e os dígitos verificadores (util novo em `app/utils/`, porque não
existe validador de CPF hoje) e responder `400 ['guest.cpf inválido']`. A validação deve ficar no bloco 1,
antes das consultas ao banco. Com teste.

### 🟢 4 [financeiro] `FAILED` é terminal, mas o Asaas permite restaurar cobrança removida, e o pagamento posterior é ignorado sem log
**Onde:** `AsaasPixProvider.js:23` (`deleted → FAILED`) · `PixWebhookController.js:65-67` (`already_processed`
sem consultar nem logar)
**Cenário:** a cobrança é removida, o webhook grava `FAILED`, o hotel restaura a cobrança no painel e o
hóspede paga. Chega `PAYMENT_RECEIVED`, o webhook vê `FAILED` e responde `already_processed`: dinheiro
recebido, reserva `PENDING`, nenhum log. `SUSPEITA` em duas partes: (a) a existência do restore na API
(`POST /v3/payments/{id}/restore`), que não confirmei na doc; (b) o formato de `GET` de cobrança removida
(`200` com `deleted: true`, como o teste supõe, ou `404`). Se for 404, o `PAYMENT_DELETED` vira 503 em loop e
soma ao achado 🟡 2. Nenhum dos dois foi exercitado no teste real.
**Correção sugerida:** para pagamento local `FAILED`, consultar `getChargeStatus` e, se vier `PAID`, emitir
`console.warn` para reconciliação. Confirmar o formato do `GET` de cobrança removida no sandbox.

### 🟢 5 [segurança em profundidade] O webhook usa o provider ATIVO e ignora `payment.provider`
**Onde:** `PixWebhookController.js:34,56` (não compara `payment.provider` com `PIX_PROVIDER`) · `CreateBookingController.js:175` (grava o provider)
**Cenário:** em staging, com o sandbox fora do ar, alguém volta `PIX_PROVIDER=fake`. Todo `Payment`
`PENDING` com `provider='asaas'` passa a ser confirmável por uma notificação HMAC do fake com
`provider_charge_id: "pay_..."`, que é público e devolvido no 201 do booking. O fake declara
`amountVerifiable: false`, então a reserva vira `CONFIRMED` sem dinheiro. O ataque exige
`PIX_WEBHOOK_SECRET`, o que limita a ameaça a um operador interno ou a um erro de configuração. A branch
passou o registro a ter três providers, o que torna essa troca mais provável.
**Correção sugerida:** se `payment.provider !== (process.env.PIX_PROVIDER || 'fake')`, responder 200
`ignored` com `console.warn`, sem efeito.

### 🟢 6 [robustez] 2xx com corpo que não é JSON vira 500, não 503
**Onde:** `AsaasPixProvider.js:124` (`response.json()` fora do `try`)
**Cenário:** um proxy ou WAF devolve 200 com HTML. Sai um `SyntaxError` que não é
`PixProviderUnavailableError`, então o booking responde 500 em vez de 503 e o webhook responde 500. O timeout
também é limpo antes da leitura do corpo (`:115`), de modo que um corpo lento não tem limite.
**Correção sugerida:** envolver `response.json()` em try/catch que lance `PixProviderUnavailableError`, e
limpar o timeout só depois de ler o corpo.

### 🟢 7 [LGPD art. 6º III e art. 18 VI] Mais PII no PSP do que o necessário, sem caminho de eliminação
**Onde:** `AsaasPixProvider.js:133-143` (e-mail enviado sem ser exigido; um `customer` novo por reserva) ·
`:148-161` (se `POST /payments` falha, o `customer` com nome e CPF fica órfão no Asaas)
**Cenário:** o mesmo hóspede faz 5 reservas e o Asaas guarda 5 cadastros com nome, CPF e e-mail. Uma
reserva cujo `POST /payments` falha deixa o cadastro sem nenhuma cobrança. Quando o titular pedir eliminação,
nada no sistema sabe que esses cadastros existem.
**Correção sugerida:** não enviar `email`, já que o Asaas exige só `name` e `cpfCnpj` e
`notificationDisabled` está ligado. Registrar como pendência da T-06.11 a eliminação no PSP
(`DELETE /v3/customers/{id}`) e, opcionalmente, reaproveitar o cliente por `externalReference`/CPF.

### 🟢 8 [testes] Lacunas: metade da allowlist sem teste, trava sem variantes, CPF inválido
**Onde:** `tests/asaas-pix.test.js:240-250` · `:98-135` · `tests/asaas-webhook.test.js:109-114`
- Só 2 dos 6 `FAILED_STATUSES` são testados (`REFUNDED`, `CHARGEBACK_REQUESTED`). Tirar
  `REFUND_REQUESTED`, `REFUND_IN_PROGRESS`, `CHARGEBACK_DISPUTE` ou `AWAITING_CHARGEBACK_REVERSAL` da lista
  não quebra nenhum teste, e essas cobranças passam a ser `PENDING`. Constatado por leitura, sem mutação.
  O impacto é pequeno porque `PENDING` não confirma, mas a allowlist fica sem proteção contra regressão.
- A trava de sandbox só é testada com `api.asaas.com` e `http://`. Faltam userinfo, porta, host parecido,
  ponto final e `@`. Eu testei essas variantes à mão (ver "Verificado").
- Não há teste de CPF malformado (🟡 3), de corpo sem `payment.id`, de `CONFIRMED` ponta a ponta nem de 2xx
  não-JSON.
- O teste de isolamento (`asaas-webhook.test.js:289-306`) é nominal: passaria mesmo sem o `tenant_id` em
  `PixWebhookController.js:131`, porque o id da reserva já é único. Pela API não dá para montar o cenário
  cross-tenant real. Aceitável, mas não prova o que o título diz.

### 🟢 9 [contrato de API] O Swagger de `/webhooks/pix` não conhece o Asaas
**Onde:** `services/core-service/config/swagger.js:452-475` (só `x-pix-signature` como `required`, corpo
`provider_charge_id`, sem 503) · `:429` (400 do booking sem a regra condicional de CPF)
**Cenário:** quem integra pela doc manda `x-pix-signature`/`provider_charge_id` e recebe 401/400. Não há
consumidor no frontend (grep em `frontend/` só acha `schema.d.ts`), então não chega a quebrar o cliente
tipado. O próprio relatório da sessão lista isso como pendência 3.
**Correção sugerida:** documentar `asaas-access-token`, o corpo `{ event, payment: { id } }`, o 503 e o
enum completo de `status`. Regenerar o `api-client`.

### 🟢 10 [docs] Relatório desatualizado e `require()` em exemplo
**Onde:** `docs/historico_sessao/weslley/integracao_asaas_pix_sandbox_15out2026.md:87` ("nada foi commitado",
quando já há 5 commits) · `docs/pagamentos/ASAAS_SANDBOX.md:67` (`node -e "...require('crypto')..."`)
**Correção sugerida:** atualizar a pendência 2. No exemplo, usar `node -e "console.log(crypto.randomBytes(32).toString('hex'))"`,
porque `crypto` é global no `node -e`.

---

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟢 | Ramo `FAILED` do webhook grava com a instância lida **sem lock**: em notificações paralelas pode sobrescrever `PAID` com `FAILED`, deixando a reserva `CONFIRMED` com pagamento `FAILED` | `PixWebhookController.js:98-107` | Gabriel (T-06.9 / lock de 12/10) | `docs/qa/repasses/para_gabriel_17102026.md` |
| 🟢 | `payments.provider_charge_id` sem índice único: o webhook faz `findOne` global, e uma duplicata faria a escolha depender do plano | `db/schema.sql:200` · `PaymentModel.js:50-53` | Sirlande (Models/schema) | `docs/qa/repasses/para_sirlande_17102026.md` |

Pendências pré-existentes do delta de 12/10 que continuam abertas, citadas sem duplicar: 🟡 nº 3 (sinal pago de
reserva cancelada, que agora é o efeito do 🟡 1 acima), 🟡 nº 4 (estorno depois de `PAID` ignorado) e 🟡 nº 6 (Swagger).

## O que foi verificado e está correto

Rodado:
- `npx vitest run asaas mercadopago public-booking pix` em `services/core-service`: **5 arquivos, 90 testes,
  todos verdes**. A suíte completa (539/1 skipped) **não** foi re-rodada; o número é do relatório do dev.
- `bash scripts/qa_checks.sh`: 0 erros, 3 avisos pré-existentes em arquivos que a branch não toca.
- Sonda da trava de sandbox (`getAsaasConfig` importado direto, sem rede para o Asaas):
  - recusadas: `api-sandbox.asaas.com.`, `api-sandbox.asaas.com.evil.com`, `evil.com#@api-sandbox…`,
    `api-sandbox.asaas.com@evil.com`, `%2F@evil.com`, chave com espaço à esquerda, `$AACT_HMLG_`, `$aact_prod_`;
  - aceitas, mas sempre resolvendo para o host `api-sandbox.asaas.com`: userinfo (o `fetch` do Node recusa
    URL com credenciais, `TypeError` → 503), porta `:8443`, maiúsculas, `\@evil.com` (WHATWG trata `\` como
    `/`), query e `..`. **Nenhuma alcança outro host. Trava não contornável por URL.**
  - chave com espaço à direita é aceita: inócuo, porque ela continua sendo de sandbox.
- `git log -p 8840ad5..feature/asaas-pix` e `git grep` atrás de `$aact_(prod|hmlg)_` real: só as chaves
  fictícias dos testes. Nenhum `.env` versionado além dos `.example`.

Por leitura:
- **Webhook não confirma sem pagamento:** sem token, com token errado ou com `ASAAS_WEBHOOK_TOKEN` vazio,
  responde 401 antes de qualquer consulta (`AsaasPixProvider.js:181-199`, `PixWebhookController.js:40-50`).
  A comparação é por SHA-256 + `timingSafeEqual`. Token igual à API Key é recusado. O status vem de
  `GET /payments/{id}`, porque `payment.status` do corpo nunca é lido. O id usado no `GET` é o do banco,
  com `encodeURIComponent`.
- **Mapeamento:** só `RECEIVED`/`CONFIRMED` viram `PAID`. `deleted` tem precedência. `OVERDUE`,
  `RECEIVED_IN_CASH`, `AWAITING_RISK_ANALYSIS`, `DUNNING_*` e qualquer status desconhecido viram `PENDING`,
  sem efeito. `PAID` sem `value` dá 503. Nenhum status pendente vira pago. O único `FAILED` que trava
  pagamento legítimo é o do 🟢 4.
- **Valor:** `Number(value).toFixed(2)` comparado com `Number(payment.amount).toFixed(2)`. Os dois lados
  vêm do mesmo `fromCents`. Observação: no Asaas, `value` é o valor configurado na cobrança, não o valor
  pago. No PIX dinâmico os dois coincidem.
- **Tenant:** a reserva é lida com `tenant_id: payment.tenant_id` e `LOCK.UPDATE` (`:130-134`). O `Payment`
  é relido sob lock e o status é reconferido (`:121-125`).
- **Fake e MP sem regressão:** o fake devolve `PAID`/`amountVerifiable:false`, o mesmo efeito do antigo
  `'approved'`. `toChargeStatus` do MP reproduz exatamente o antigo bloco do controller
  (approved→PAID, cancelled/rejected→FAILED, resto→PENDING), e a guarda "approved sem valor" continua no
  status cru (`MercadoPagoPixProvider.js:164`). Nenhum outro arquivo compara com `'approved'` (grep).
  `requiresPayerCpf` herda `false`.
- **Logs:** todos os `console.error` novos imprimem só status HTTP, método, rota, `payment.id` ou mensagem
  fixa. Nunca corpo, chave, nome, CPF ou e-mail. O teste da `asaas-pix.test.js:184` confere isso.
- **ESM:** sem `require()` no código. Datas: `dueDate` em `America/Sao_Paulo` e `expirationDate` lida
  como `-03:00`, o que está correto porque não há horário de verão desde 2019.
- **Transação:** os dois caminhos de escrita do webhook usam transação. O booking mantém a cobrança fora da
  transação, como já decidido em 12/10.

## Não foi possível verificar

- Comportamento real da fila de webhooks do Asaas (pausa após 15 falhas; se é sequencial). A única fonte é
  o guia do dev. A API real não foi chamada, por instrução.
- Formato de `GET /v3/payments/{id}` para cobrança removida, e se o restore existe (🟢 4).
- Se a conta Asaas aplica multa/juros padrão em PIX pago depois de `OVERDUE`, o que alteraria `value` e
  travaria em `FAILED` um pagamento legítimo atrasado. `SUSPEITA` fraca: a cobrança não envia
  `fine`/`interest`. Para descartar o risco, mandar `fine: { value: 0 }, interest: { value: 0 }` explicitamente.
- O Asaas chamando o webhook por conta própria (via túnel), que o próprio dev registrou como não testado.
