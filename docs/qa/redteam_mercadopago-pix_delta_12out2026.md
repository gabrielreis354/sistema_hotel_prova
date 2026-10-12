# QA Red Team — Mercado Pago PIX (T-03.2 / PR #89): delta pós-reauditoria e merge da Etapa F

**Branch:** `pr89-integracao` (`0b5b1f1`) = `origin/feature/mercadopago-pix` + merge de `develop@f1de9f5`
**Base:** `develop@f1de9f5` · **Data:** 12/10/2026
**Auditorias anteriores:** `redteam_mercadopago-pix_21set2026.md` (REPROVADO) e
`redteam_mercadopago-pix_reauditoria_21set2026.md` (APROVADO COM RESSALVAS, até `3a599b2`)
**Escopo:** `git log 3a599b2..HEAD`, restrito ao que toca PIX/reserva pública: `4614669`, `76e8a22`
(merge, resolução de conflito no webhook e no FakePixProvider), `b2f2490`, `bb86c4a` (SPEC), `0b5b1f1`
(merge da Etapa F/PR #93 em `CreateBookingController`). Diff do PR inteiro contra a develop: 15 arquivos.
**Arquivos auditados:** 9 do diff + 8 lidos para contexto (`CheckInController`, `CancelReservationController`,
`GetBillController`, `checkReservationConflict`, `uniqueConstraintConflict`, `calculateStayTotal`,
`applyDbConstraints` (triggers do pivô), `config/swagger.js`)
**Achados:** 11 (🔴 0 · 🟡 6 · 🟢 5)

## Veredito

**APROVADO COM RESSALVAS**

Nenhum 🔴. As três ressalvas da reauditoria de 21/09 sobre o webhook foram resolvidas de fato: o valor
divergente não trava mais status não-terminal em FAILED, `approved` sem valor não confirma, e os
caminhos 503 passaram a deixar log, sem PII. Conferi na leitura e nos testes (40/40 verdes nos três
arquivos de PIX e reserva pública). O merge da Etapa F está coerente: o provider recebe `Number`, o
cálculo é em centavos, nenhum insert manual no pivô sobrou, e a corrida de ocupação agora dá 409 em
vez de 500.

O que impede um APROVADO limpo:

1. **A pendência N4 da Etapa F continua aberta.** A auditoria de 10/10 a deixou explicitamente
   para este PR (`redteam_reserva-multiquarto-contrato_10out2026.md:404`, "Webhook PIX não tocado,
   pendência no PR"). O webhook continua lendo a reserva sem lock. O cenário é pior do que o
   registrado: o check-in aceita `PENDING`, então a corrida pode rebaixar `CHECKED_IN` para
   `CONFIRMED` (🟡 nº 2). A correção é de uma linha e deveria entrar antes do merge.
2. **A cobrança órfã no PSP continua sem compensação e agora também sem rastro.** A resposta virou
   409, o que é correto, mas nenhum caminho de falha da transação registra o `provider_charge_id`, e
   o webhook responde 404 sem log (🟡 nº 1).

---

## Respostas aos pontos obrigatórios

### 1. Cobrança criada no PSP antes da transação

| Pergunta | Resposta (com evidência) |
|---|---|
| Fica cobrança órfã no PSP? | **Sim, em todo caminho de falha depois da linha 108.** `createCharge` roda em `CreateBookingController.js:95-108`, e a transação só abre na `:111`. Um rollback na `:204` (EXCLUDE de ocupação, deadlock 40P01, colisão de CPF/e-mail, qualquer outro erro) deixa a cobrança viva no Mercado Pago, sem `Payment`, sem reserva e sem cancelamento. |
| Qual status HTTP o hóspede recebe? | EXCLUDE/deadlock: **409** `ROOM_OCCUPIED_MESSAGE` (`:217`), melhoria trazida pela Etapa F (antes era 500). CPF/e-mail: **409** (`:213-214`). Outro erro: **500** (`:219-220`). |
| O hóspede recebe o QR? | **Pela API, não.** O QR só sai no corpo do 201, depois do `commit` (`:177-201`). O hóspede não tem como pagar a órfã por este sistema. `SUSPEITA` mantida da 1ª auditoria: se o MP enviar as instruções de pagamento ao `payer.email`, que é o e-mail real do hóspede, a órfã fica pagável. Só dá para confirmar no sandbox. |
| O webhook da órfã faz algo errado? | **Não cria, não confirma e não vaza nada.** Assinatura validada (`PixWebhookController.js:38-48`), depois `PaymentModel.findOne({ provider_charge_id })` → `null` → **404** (`:54-57`). Nenhuma escrita. O corpo 404 é genérico e só sai depois da assinatura, então não serve para enumerar. **Mas o 404 não tem log** (ver 🟡 nº 1). |
| É aceitável? | **Aceitável para sandbox/TCC, com duas condições ainda não cumpridas:** rastro (log do `provider_charge_id` órfão) e registro da decisão. Para produção é preciso compensação (`cancelCharge`). A cobrança expira sozinha no MP em 30 min (`MercadoPagoPixProvider.js:24`), o que limita a janela. |

### 2. Webhook: ressalvas de 21/09 e regressões

| Ressalva da reauditoria | Situação | Evidência |
|---|---|---|
| 🟡 nº 1: valor divergente trava status não-terminal em FAILED | ✅ **Resolvida** (`4614669`) | `PixWebhookController.js:89-92`: FAILED só para `cancelled`/`rejected` ou `approved && !amountMatches`. Teste `mercadopago-webhook.test.js:197` cobre pending com valor divergente seguido de approved, que confirma. |
| 🟡 nº 2: `approved` sem `transaction_amount` confirma | ✅ **Resolvida** (`b2f2490` + `76e8a22`) | Provider: `MercadoPagoPixProvider.js:154-157` lança `PixProviderUnavailableError` → 503. Controller: `:79-81` só pula a conferência com `amountVerifiable === false` explícito, e o único que declara `false` é o fake (`FakePixProvider.js:54-56`). Defesa em profundidade: mesmo que o provider devolva `amount: null`, `amountMatches` dá `false`. Teste `:238`. |
| 🟡 nº 3: 503 mudo e sem reconciliação | ⚠️ **(a)/(b) resolvidos, (c) pendência registrada** | Logs em `MercadoPagoPixProvider.js:57,65,138,147,155` e `PixWebhookController.js:69`. A falta de reconciliação está registrada na SPEC-03 (`bb86c4a`). |
| 🟢 nº 1: `resetPixProviderForTests` sem guarda | ❌ Não tratado | `index.js:32-34` |
| 🟢 nº 2: boilerplate duplicado em `createCharge`/`getChargeStatus` | ❌ Não tratado (os `catch` agora têm binding) | `MercadoPagoPixProvider.js:35-61` vs `:128-148` |

Matriz de regressão do bloco de decisão (`:79-106`), lida linha a linha:

| Status MP | Valor | Antes de `4614669` | Agora | Correto? |
|---|---|---|---|---|
| `approved` | bate | PAID/CONFIRMED | PAID/CONFIRMED | ✅ |
| `approved` | diverge | FAILED | FAILED | ✅ (fail-closed) |
| `approved` | ausente | PAID (fail-open) | **503**, sem escrita | ✅ |
| `pending`/`in_process`/desconhecido | qualquer | FAILED se divergisse | `pending`, sem escrita | ✅ |
| `cancelled`/`rejected` | qualquer | FAILED | FAILED | ✅ |
| qualquer | — | payment `PAID/FAILED/EXPIRED` | `already_processed` | ✅ idempotente, mas ver 🟡 nº 4 |
| fake, `amountVerifiable:false` | — | PAID | PAID | ✅ (exige HMAC T-06.9) |

**Nenhuma regressão de estado terminal, valor ou idempotência introduzida pelo delta.** O que sobra é
pré-existente e não foi tratado: a leitura da reserva sem lock (🟡 nº 2) e o pagamento aprovado de uma
reserva já `CANCELLED` (🟡 nº 3).

### 3. Coerência com a Etapa F

- **Provider recebe `Number`:** `CreateBookingController.js:97`, `Number(depositAmount)`, onde
  `depositAmount = fromCents(depositCents)` é string decimal (`calculateStayTotal.js:59-61`). O MP
  recebe `transaction_amount: Number(amount)` (`MercadoPagoPixProvider.js:49`). ✅ Fecha o N5 da Etapa F.
- **Centavos:** `totalCents = toCents(stay.total)` e `depositCents = Math.round(totalCents * deposit_percent / 100)`
  (`:82-83`). `deposit_percent` é `INTEGER` (`TenantModel.js:38-42`), então o produto é inteiro e o
  `Math.round` só atua no meio-centavo. `Payment.amount` grava a string (`:166`) e a reserva grava
  `stay.total` string (`:157`). ✅
- **Conferência de valor do webhook com o DECIMAL:** `Number("90.00").toFixed(2) === Number(90).toFixed(2)`.
  Dois lados nascem do mesmo `fromCents`, então o arredondamento é idêntico. ✅
- **Pivô pelo trigger:** nenhum `ReservationRoomModel`/`reservation_rooms` em `PublicBookingApi/`
  (`git grep` só encontra o comentário em `:160`). A reserva entra no pivô por
  `reservations_sincroniza_quartos` (`applyDbConstraints.js:249-283`). ✅
- **Corrida de ocupação → 409:** `isRoomOccupiedError` (`checkReservationConflict.js:64-68`) cobre
  `SequelizeExclusionConstraintError` e `40P01`. ✅ Nenhum teste exercita isso **no booking público
  com cobrança já criada** (🟢 nº 2).

### 4. Segredos e LGPD

- **Credenciais fora do código:** `MERCADOPAGO_ACCESS_TOKEN`/`MERCADOPAGO_WEBHOOK_SECRET` só são lidas
  de `process.env` (`MercadoPagoPixProvider.js:19,84,123`). `.env.example:42-43` tem valores vazios.
  `services/core-service/.env` está no `.gitignore` (`.gitignore:7`). Procurei padrões de token
  (`APP_USR-…`, `TEST-<dígitos>`) e atribuições com valor em todo `origin/develop..HEAD` por
  `git log -G`: **zero**. Os testes usam `'TEST-mp-token'` fictício. ✅
- **Logs de falha do MP sem dados do pagador:** os cinco `console.error` novos imprimem só
  `error.message` de rede, `response.status`, `externalId` (UUID da reserva) ou `providerChargeId`.
  Nenhum imprime o corpo da requisição (que tem e-mail e CPF) nem o da resposta (`payer`). ✅
- **Resíduo, não introduzido aqui:** o `catch` final do webhook faz `console.error('PixWebhookController:', error)`
  com o objeto inteiro (`PixWebhookController.js:139`). Os SQLs alcançáveis ali (UPDATE de
  `payments`/`reservations`) não têm PII, então não é achado. Registro para não regredir.

---

## Achados

### 🟡 nº 1 [financeiro / observabilidade] Cobrança órfã no PSP continua sem compensação e passou a não deixar rastro nenhum

**Onde:** `services/core-service/app/Controllers/PublicBookingApi/CreateBookingController.js:203-220` ·
`services/core-service/app/Controllers/WebhookApi/PixWebhookController.js:54-57`

**Cenário:** duas reservas públicas disputam o último quarto livre. As duas passam por
`checkReservationConflict` (`:69-72`), as duas criam cobrança no MP (`:96`, até 10 s de rede), e a
segunda bate no EXCLUDE do pivô no `ReservationModel.create` (`:147`). O resultado:
- o hóspede recebe `409 "Quarto indisponível no período solicitado"`, o que está correto;
- a cobrança `N` fica `pending` no MP por 30 min, sem linha no banco;
- **nenhum log registra `N`**: o ramo 409 (`:213-217`) retorna sem `console`, e o ramo 500 (`:219`) loga só `error.message`;
- o `payment.created` da cobrança `N` chega assinado ao webhook e recebe **404 sem log** (`:55-57`). O MP reenvia e recebe 404 de novo, em silêncio.

Se a `SUSPEITA` da 1ª auditoria se confirmar (MP enviando a cobrança ao e-mail do pagador) e o
hóspede pagar, o dinheiro entra na conta do MP e o Gesway não tem **nenhum registro**, nem em
banco nem em log, de que essa cobrança existiu. A conciliação manual fica impossível.

**Regra violada:** CLAUDE.md §7 (risco financeiro) · compensação ausente em operação distribuída.

**Correção sugerida (a menor que resolve):**
1. No `catch (txError)` (`:203`), antes do `rethrow`: `console.error('CreateBookingController: cobrança órfã', charge.providerChargeId, reservationId, txError.name)`, sem PII.
2. No 404 do webhook: `console.warn('PixWebhookController: notificação assinada de cobrança desconhecida', provider_charge_id)`.
3. Para produção: `cancelCharge(providerChargeId)` no contrato `PixProvider` (no MP, `PUT /v1/payments/{id}` com `{status:'cancelled'}`; no fake, no-op), chamado best-effort no mesmo `catch`.
4. Alternativa barata para o caso mais comum: o valor do sinal depende só de categoria × noites. Num `isRoomOccupiedError`, tentar o próximo quarto livre da mesma categoria **reaproveitando a mesma cobrança** elimina a órfã na corrida.

### 🟡 nº 2 [concorrência / máquina de estados] Webhook lê a reserva sem lock: pode rebaixar `CHECKED_IN` para `CONFIRMED` e ressuscitar `CANCELLED` (pendência N4 da Etapa F, deixada para este PR)

**Onde:** `services/core-service/app/Controllers/WebhookApi/PixWebhookController.js:115-124` ·
`services/core-service/app/Controllers/ReservationApi/CheckInController.js:26` (check-in aceita `PENDING`)

**Cenário (por leitura do código + semântica READ COMMITTED do PostgreSQL; não reproduzido com sonda):**
- **Webhook × check-in.** O hóspede chega ao balcão e paga o PIX do sinal enquanto a recepcionista
  clica em check-in. O webhook lê a reserva `PENDING` (`:115`, sem `lock`). O check-in faz `FOR UPDATE`,
  grava `CHECKED_IN`, deixa o quarto `OCCUPIED` e faz commit. Em seguida o webhook executa
  `UPDATE reservations SET status='CONFIRMED' WHERE id=…`, que só filtra por PK e por isso sobrescreve.
  O resultado é hóspede no quarto, reserva `CONFIRMED` e quarto `OCCUPIED`. O check-out exige
  `CHECKED_IN`, então fica impossível. O cancelamento aceita `CONFIRMED`, então o quarto ocupado pode
  ser liberado para venda. É uma transição `CHECKED_IN → CONFIRMED`, proibida pela máquina de estados.
- **Webhook × cancelamento:** a reserva `CANCELLED` volta a `CONFIRMED`. O trigger recopia
  `blocks_room=true`. Se o quarto já foi revendido, o EXCLUDE recusa e o webhook responde 500,
  porque não trata `isRoomOccupiedError` (`:138-141`). O `PAID` volta junto no rollback e o MP
  reenvia.

A janela é de milissegundos (entre o SELECT e o UPDATE da mesma requisição), mas o par "pagar o sinal
no balcão + check-in" é um fluxo operacional real. O registro da Etapa F
(`docs/historico_sessao/gabriel/reserva_multiquarto_contrato_10out2026.md:48`) cita só o cancelamento.
A variante do check-in é mais grave e não estava registrada.

**Regra violada:** CLAUDE.md §3 (máquina de estados) · pendência N4 explicitamente atribuída a este PR.

**Correção sugerida:** em `:115`, `lock: transaction.LOCK.UPDATE`. Melhor ainda: reler também o
`Payment` com `lock: UPDATE` dentro da transação e reconferir `status === 'PENDING'` antes de gravar,
o que fecha também a idempotência sob notificações paralelas.

### 🟡 nº 3 [financeiro] Pagamento aprovado de reserva já `CANCELLED` vira `PAID` em silêncio e o webhook responde `"confirmed"`

**Onde:** `services/core-service/app/Controllers/WebhookApi/PixWebhookController.js:109-133`

**Cenário (determinístico, sem corrida):** a recepção cancela uma reserva DIRECT `PENDING`, por
exemplo pelo alerta de `GetAlertsController.js:57`. O QR continua válido no MP por até 30 min. O
hóspede paga, e a notificação `approved` chega:
- `payment.status = 'PAID'` (`:111-113`), o que é correto, porque o dinheiro entrou;
- a reserva não é tocada (`:121`), o que também é correto;
- a resposta é `200 {"status":"confirmed", "reservation_status":"CANCELLED"}`, **sem log**.

O hotel recebeu um sinal de uma reserva que não existe mais, e nada no sistema sinaliza isso: não há
alerta, nem estorno, nem item em `GetAlertsController`. O hóspede vê a tela de polling mostrar a
reserva cancelada com o depósito pago e precisa ligar para descobrir o que aconteceu.

**Regra violada:** CLAUDE.md §7 (risco financeiro: dinheiro recebido sem destino operacional).

**Correção sugerida:** quando `reservation.status !== 'PENDING' && reservation.status !== 'CONFIRMED'`,
registrar `console.warn` com `payment.id`/`reservation.id` e devolver `status: 'paid_without_reservation'`.
Registrar como pendência de produto o estorno (`POST /v1/payments/{id}/refunds`) ou um alerta no
painel. A curto prazo, o cancelamento de reserva com sinal PIX `PENDING` poderia chamar o
`cancelCharge` do 🟡 nº 1.

### 🟡 nº 4 [financeiro] Estorno ou MED depois do `PAID` é ignorado pela idempotência e a conta do hóspede segue abatendo o sinal

**Onde:** `services/core-service/app/Controllers/WebhookApi/PixWebhookController.js:60-62` ·
`services/core-service/app/Controllers/ReservationApi/GetBillController.js:41`

**Cenário:** o sinal foi pago, `PAID`/`CONFIRMED`. Depois o pagador aciona o MED do PIX, ou o hotel
estorna pelo painel do MP. O MP notifica `payment.updated` com status `refunded`/`charged_back`. O
webhook vê `PAID` na `:60` e responde `already_processed` **sem consultar o status**. O `Payment`
continua `PAID`, e o `GetBillController` abate o sinal do saldo no check-out (`:41`, soma dos `PAID`).
O hotel perde o valor do sinal sem saber.

Não é regressão do delta: a idempotência por estado terminal já existia. É a lacuna seguinte do
mesmo desenho, agora com dinheiro real.

**Regra violada:** CLAUDE.md §7 (risco financeiro).

**Correção sugerida:** no mínimo, para `PAID`, consultar `getChargeStatus` e, se vier
`refunded`/`charged_back`, logar com `console.error` e devolver 200 sem efeito, registrando a pendência.
O completo é um status `REFUNDED` no `PaymentModel` (é do Sirlande, dono de Models/schema) e o
tratamento no webhook.

### 🟡 nº 5 [financeiro / configuração] Hotel com `deposit_percent = 0` não consegue receber nenhuma reserva direta com o Mercado Pago

**Onde:** `services/core-service/app/Controllers/PublicBookingApi/CreateBookingController.js:83,95-108` ·
`services/core-service/app/Models/TenantModel.js:38-42` (`min: 0`)

**Cenário:** o ADMIN configura sinal de 0% (permitido pelo model e pelo CHECK do schema). Toda reserva
pública chama `createCharge({ amount: 0 })` e o MP recebe `transaction_amount: 0`.
`SUSPEITA` (confirmar no sandbox): o MP recusa valor zero com 400. O provider loga `resposta 400`
(`MercadoPagoPixProvider.js:65`) e o hóspede recebe **503 "Serviço de pagamento indisponível no
momento"**, em toda tentativa. A mensagem culpa o PSP por uma configuração do hotel. Com o fake, o
cenário é outro: a reserva fica `PENDING` aguardando um "pagamento" de R$ 0,00.

**Regra violada:** fail-safe · mensagem de erro que não diz o que fazer.

**Correção sugerida:** se `depositCents === 0`, não cobrar: criar a reserva sem `Payment` de sinal
(decisão de produto: `PENDING` ou direto `CONFIRMED`), ou exigir `deposit_percent >= 1` quando
`PIX_PROVIDER=mercadopago`. Qualquer uma das duas, com teste.

### 🟡 nº 6 [contrato de API] O delta de contrato continua fora do Swagger, e o congelamento que justificava isso acabou

**Onde:** `services/core-service/config/swagger.js:362-370` (`WebhookConfirmResponse.status` enum
`['confirmed','already_processed']`) · `:443-449` (booking sem **503**) · `:452-475` (webhook só
documenta `x-pix-signature`, corpo `provider_charge_id`, sem 503, sem `x-signature`/`x-request-id`/`?data.id`)

**Cenário:** a T-06.2 foi concluída (22/09) e entrou na develop mesclada aqui. A justificativa de
21/09 ("swagger.js congelado por §7") deixou de valer. O cliente tipado
(`frontend/packages/api-client/src/schema.d.ts`) é regenerado a partir deste arquivo e não conhece o
503 do booking público nem os estados `not_approved`/`pending` do webhook. Ainda não há consumidor
no frontend (grep), por isso não é 🔴. O repasse a Gabriel foi feito e não foi absorvido.

**Regra violada:** CLAUDE.md §6 (endpoint ou contrato fora do Swagger quebra o cliente tipado).

**Correção sugerida:** acrescentar 503 em `/public/{subdomain}/bookings` e em `/webhooks/pix`, o enum
completo `confirmed|already_processed|not_approved|pending`, e uma nota sobre o formato do Mercado
Pago (`x-signature`, `x-request-id`, `?data.id`). Depois, regenerar o `api-client`.

### 🟢 nº 1 [integração] `SUSPEITA`: hóspede só com telefone gera e-mail sintético `.local` para o MP

**Onde:** `services/core-service/app/services/pix/MercadoPagoPixProvider.js:27` · `CreateBookingController.js:44`
(aceita `phone` sem `email`)

`payer.email = reserva-<uuid>@sememail.gesway.local`. Se o MP validar o domínio, todo hóspede sem
e-mail recebe 503. Confirmar no sandbox e, se for o caso, exigir e-mail quando `PIX_PROVIDER=mercadopago`
com **400** e mensagem acionável.

### 🟢 nº 2 [testes] Os caminhos novos do merge não têm teste

Não há teste de: (a) booking público com cobrança criada e transação recusada por EXCLUDE (409 e
órfã); (b) booking com MP indisponível → 503 sem escrita; (c) webhook `approved` para reserva
`CANCELLED`; (d) idempotência sob notificações paralelas. `grep "409\|CANCELLED"` em
`public-booking.test.js` e `mercadopago-*.test.js` retorna vazio. O (a) é o cenário que motivou a
mudança de ordem da cobrança e o merge com a Etapa F.

### 🟢 nº 3 [UX] 409 da corrida pública diz "Quarto indisponível" para quem escolheu categoria

**Onde:** `CreateBookingController.js:217` · `swagger.js:448`

O hóspede escolheu uma categoria, não um quarto, e outro quarto da categoria pode estar livre. A
mensagem não diz o que fazer, e o Swagger descreve o 409 como "Sem disponibilidade na categoria". A
sugestão é "Outro hóspede acabou de reservar o último quarto desta categoria. Tente novamente", ou o
retry com o próximo quarto do 🟡 nº 1.

### 🟢 nº 4 [robustez] Leitura do corpo da resposta do MP fora do timeout, e falha de parse gera cobrança órfã com 500

**Onde:** `MercadoPagoPixProvider.js:59-61` (`clearTimeout` no `finally`) → `:69` (`response.json()`)

Depois do `clearTimeout`, o `response.json()` não tem mais abort e pode ficar pendurado. Um 2xx com
corpo inválido lança `SyntaxError`, que não é `PixProviderUnavailableError`, então o controller
relança (`CreateBookingController.js:107`) → 500. A cobrança já existe no MP e vira órfã. Mover o
`clearTimeout` para depois do `json()` resolve as duas coisas.

### 🟢 nº 5 [observabilidade] `approved` com valor divergente vira `FAILED` sem log

**Onde:** `PixWebhookController.js:92-102`

O próprio comentário chama o caso de "sinal de fraude", mas nada é logado. Dinheiro entrou na conta
(valor errado) e o único rastro é uma linha `FAILED`. Um
`console.warn('…valor divergente', payment.id, chargeStatus.amount, payment.amount)` resolve.

---

## Reconferência dos achados da 1ª auditoria (não tocados pelo delta)

| Achado (21/09) | Situação em `0b5b1f1` |
|---|---|
| 🟡 órfã no PSP | **Parcial:** 500 → 409 pela Etapa F. Compensação e rastro ausentes (🟡 nº 1 acima). |
| 🟡 tópico e janela de `ts` (replay) | **Aberto:** `MercadoPagoPixProvider.js:83-116` não olha `type`/`action` nem compara `ts` com o relógio. |
| 🟡 typo em `PIX_PROVIDER` cai no fake; `provider` grava a env crua | **Aberto:** `index.js:24` (`PROVIDERS[key] \|\| FakePixProvider`) e `CreateBookingController.js:170`. `git grep MERCADOPAGO\|PIX_PROVIDER` fora de `services/core-service/.env.example` e do código: **zero**. Manifests k8s e compose continuam sem as variáveis. |
| 🟡 credencial única para todos os tenants | **Aberto**, sem ADR (T-03.3). |
| 🟡 CPF ao MP sem validação nem registro | **Aberto:** `onlyDigits` sem checagem de 11 dígitos (`CreateBookingController.js:101`). |
| 🟡 Swagger | **Aberto** e agora sem a justificativa do congelamento (🟡 nº 6). |
| 🟢 `pix_expiration` do relógio local; 30 min no limite do MP | **Abertos** (`MercadoPagoPixProvider.js:24`, `:76-80`). |
| SPEC-03 | `bb86c4a` marca CA-03.2.i como cumprido. Vale para o banco (o `Payment` nunca fica inconsistente), não para o PSP (🟡 nº 1). CA-03.2.c/d seguem sem evidência de sandbox, como a própria SPEC admite. |

## O que foi verificado e está correto

- Os três arquivos de teste de PIX e reserva pública, rodados isoladamente (Node 24.14, Postgres
  local, `pgrep vitest` vazio antes): **3 arquivos, 40/40 passam**.
- `4614669`: a matriz status × valor (tabela acima) não tem saída perigosa. Status desconhecido cai
  em inação (allowlist).
- `b2f2490`: `approved` sem valor → 503, sem escrita. O `amountVerifiable` é declarado pelo provider,
  não inferido de `null`. O controller continua fail-closed mesmo se um provider futuro esquecer o campo.
- `76e8a22`: o HMAC da T-06.9 está preservado dentro de `FakePixProvider.verifyWebhook`: fail-closed
  sem `PIX_WEBHOOK_SECRET`, 401 com log, `provider_charge_id` não-string → 400 (`PixWebhookController.js:49`).
  A assinatura é validada antes de qualquer consulta ao banco.
- `0b5b1f1`: a resolução do conflito preservou a cobrança fora da transação, o `id` da reserva como
  chave de idempotência no MP (`X-Idempotency-Key`), o cálculo em centavos da Etapa F e o 409 de
  ocupação. Nenhum insert manual no pivô.
- Tenant: o booking usa `tenant.id` do subdomínio em todas as queries. O webhook busca a reserva com
  `tenant_id: payment.tenant_id`. Não há `findByPk` em `app/` no diff.
- ESM: zero `require()` nos arquivos do diff.
- Logs novos sem PII. Nenhum segredo versionado no histórico do PR.
- Transações: o booking grava hóspede, reserva e pagamento numa transação só. O webhook grava pagamento
  e reserva numa transação, com rollback.

## Não foi possível verificar

- **Sandbox real do Mercado Pago:** se o MP envia a cobrança ao `payer.email` (que agravaria o 🟡 nº 1),
  se recusa `transaction_amount: 0` (🟡 nº 5) e e-mail `.local` (🟢 nº 1), e qual status o MED assume
  (🟡 nº 4).
- **Reprodução das corridas do 🟡 nº 2:** não montei sonda. Um probe de concorrência exigiria escrever
  no banco compartilhado fora dos três arquivos de teste autorizados. A conclusão vem da leitura (o
  `findOne` sem `lock` em `:115`, o `save` que filtra só por PK, o check-in que aceita `PENDING`) e da
  semântica READ COMMITTED do PostgreSQL. A mesma análise já tinha sido registrada na Etapa F (N4).
- **Suíte completa e cobertura:** não rodei (banco compartilhado). Uso os números do executor:
  417 passam, 1 skip, cobertura 80,12/73,45/87,12/83,36.
- **Inventário bloqueado por reservas públicas `PENDING` nunca pagas:** fora do delta. O endpoint
  público não tem rate limit (grep vazio) e, com o MP, cada tentativa abusiva cria também uma cobrança
  real. Registro como pendência de produto, sem veredito aqui.
