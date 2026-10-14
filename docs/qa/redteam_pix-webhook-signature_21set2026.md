# QA Red Team — assinatura HMAC no webhook PIX (T-06.9)

**Branch:** `fix/pix-webhook-signature` (770fa6f) · **Base:** `origin/develop@9ae6c87` · **Data:** 21/09/2026
**Arquivos auditados:** 12 no diff + 14 lidos por contexto · **Achados:** 11 (🔴 0 · 🟡 5 · 🟢 6)
**Auditoria anterior no mesmo fluxo:** `docs/qa/redteam_public-booking-leak_16set2026.md` (16/09) — o 🔴 nº 2 daquele relatório ("Webhook PIX sem verificação de origem") é **exatamente** o que esta branch fecha.

## Veredito

**APROVADO COM RESSALVAS**

**Nenhum achado 🔴 dentro do escopo do diff.** A correção faz o que promete e resistiu a todas as
tentativas de bypass que montei. Ataquei o endpoint por 20 vetores distintos — corpo sem
`Content-Type`, `text/plain`, `application/vnd.api+json`, corpo vazio, JSON malformado, corpo
gzipado, assinatura truncada, assinatura vazia, assinatura em hex maiúsculo, assinatura multibyte
com o **mesmo comprimento em bytes** da esperada, cabeçalho `x-pix-signature` duplicado, segredo
ausente, segredo string vazia, assinatura genuína emitida um instante antes de derrubar o segredo —
e **em nenhum caso o pagamento saiu de `PENDING`**. Verifiquei o estado no banco após cada tentativa,
não só o código HTTP.

O furo que a T-06.9 existia para fechar está fechado: o `provider_charge_id` sozinho não confirma
mais nada. Os dois 🔴 pré-existentes do relatório de 16/09 continuam abertos, mas **perderam o
detonador** — o charge id vazado só vale acompanhado do segredo HMAC.

As ressalvas 🟡 são: um segredo com valor funcional versionado em `infra/k8s/secret.yaml` (amparado
por política acadêmica documentada no README, mas o README não foi atualizado), a ausência total de
observabilidade no caminho 401 (num endpoint de dinheiro, rejeição silenciosa = reservas que param
de confirmar sem ninguém saber), `provider_charge_id` sem validação de tipo (array vira `IN (...)`),
Swagger e `openapi.json` sem o novo cabeçalho obrigatório e sem o 401, e `signNotification` fora do
contrato `PixProvider`.

---

## Verificação empírica — o que eu efetivamente executei

Suíte completa na branch, sem alterações: **232 passam · 1 skip · 17 arquivos**.
Cobertura: **74,57% stmts · 76,93% lines · 83,79% funcs · 71,55% branches** — acima do portão de 60%/55% do CI.
`bash scripts/qa_checks.sh` → **exit 0**, 3 avisos, nenhum relativo a esta branch.
`app/utils/pixWebhookSignature.js`: 90% stmts / 87,5% branches.

Criei dois arquivos de sonda (`tests/zz-probe-redteam.test.js`, `tests/zz-probe2.test.js`),
executei e **removi**. Working tree limpo ao final (só a modificação prévia em `docs/specs/SPEC-06`,
que já estava lá antes de eu começar). Saída real das sondas:

### Tentativas de bypass do controle de assinatura

| Vetor | Resultado HTTP | Estado do pagamento no banco |
|---|---|---|
| `Content-Type: text/plain` + assinatura **válida** | `401 Assinatura inválida` | `PENDING` |
| `Content-Type: application/vnd.api+json` + assinatura **válida** | `401 Assinatura inválida` | `PENDING` |
| `Content-Encoding: gzip` + assinatura válida do corpo descomprimido | `400` (body-parser) | `PENDING` |
| Corpo vazio, sem assinatura | `401 Assinatura inválida` | — |
| Corpo vazio, assinatura válida do corpo vazio | `400 provider_charge_id obrigatório` | — |
| JSON malformado com assinatura válida dos bytes malformados | `400` (body-parser, HTML) | — |
| `x-pix-signature: sha256=` + 32× `é` (**71 bytes**, exatamente o tamanho da esperada) | `401` | `PENDING` |
| `x-pix-signature` duplicado (válida + `lixo`) | `401` | `PENDING` |
| Assinatura válida em **hex maiúsculo** | `401` | `PENDING` |
| `PIX_WEBHOOK_SECRET=""` + assinatura emitida com o segredo real | `401 Webhook não configurado` | inalterado |
| `PIX_WEBHOOK_SECRET=""` + assinatura calculada com segredo vazio | `401 Webhook não configurado` | inalterado |
| `GET /webhooks/pix` · `PUT /webhooks/pix` | `404` · `404` | — |
| Assinatura correta (caminho feliz) | `200 confirmed` → reenvio `200 already_processed` | `PAID`, idempotente |

**O ponto que mais me interessava — `rawBody` indefinido virando "passa":** não acontece.
`express.json({ verify })` só é chamado quando o `Content-Type` casa com `application/json`; em
qualquer outro tipo `request.rawBody` fica `undefined`, e `verifyPixSignature` trata `undefined`
explicitamente (`pixWebhookSignature.js:30`) retornando `false`. Confirmado com dois content-types
diferentes, ambos carregando assinatura genuína: `401`, pagamento intocado.

**`crypto.timingSafeEqual` não é alcançável com buffers de tamanhos diferentes.** A guarda de
comprimento em `pixWebhookSignature.js:38` vem antes. Testei 16 combinações hostis diretamente na
função (string vazia, `undefined`, `null`, `sha256=` sozinho, 71 chars arbitrários, 36 chars
multibyte = 72 bytes, hex maiúsculo, segredo vazio): **nenhuma lançou**, todas retornaram `false`.
O único jeito de fazer a função lançar é passar um `rawBody` que não seja string/Buffer — ver 🟢 nº 3.

### Regressão T-06.5 — `provider_charge_id` em resposta pública

`GET /public/:subdomain/bookings/:id/status` (saída real da sonda):

```json
{"reservation_id":"91d4…","status":"CONFIRMED","check_in":"2027-01-10","check_out":"2027-01-12",
 "total_amount":300,"deposit":{"status":"PAID","amount":90,"paid_at":"…"},"confirmed":true}
```

Sem `provider_charge_id`, sem `pix_qr_code`, sem `provider`. **CA-06.9.f cumprido — sem regressão.**

`POST /public/:subdomain/bookings` **continua** devolvendo `pix.provider_charge_id` no `201`
(`CreateBookingController.js:159`) — achado conhecido, fora do escopo desta branch, já registrado.
Confirmado **igual**, sem piora. Com a assinatura no caminho, esse vazamento deixou de ser
explorável sozinho.

---

## Critérios de aceite — item a item

| CA | Status | Evidência |
|---|---|---|
| **CA-06.9.a** — HMAC-SHA256 com `timingSafeEqual` antes de qualquer efeito colateral | ✅ **Cumprido** | `PixWebhookController.js:26-39` é a primeira coisa no corpo do `try`; a primeira query (`PaymentModel.findOne`) só aparece na linha 47. Um 401 nunca toca o banco — confirmei que o 401 para charge inexistente e para charge existente são **indistinguíveis** (mesmo corpo `{"error":"Assinatura inválida"}`), então não há oráculo de enumeração. |
| **CA-06.9.b** — segredo de env, nunca versionado | ⚠️ **Parcial** | `.env.example` e `.env.test.example` corretos, `process.env` lido em tempo de requisição. Mas `infra/k8s/secret.yaml:12` versiona um **valor funcional**. Ver 🟡 nº 1. |
| **CA-06.9.c** — sem assinatura / inválida → `401` e **não altera estado** | ✅ **Cumprido** | 13 vetores na tabela acima; estado no banco checado em cada um. |
| **CA-06.9.d** — `FakePixProvider` assina a notificação | ✅ **Cumprido** (com ressalva de design) | `FakePixProvider.signNotification()` existe e os testes usam `getPixProvider().signNotification(rawBody)`. Ressalva: o método não está no contrato `PixProvider` — 🟡 nº 5. |
| **CA-06.9.e** — testes: válida promove · inválida recusa · ausente recusa · idempotência | ✅ **Cumprido** | `public-booking.test.js:122-181` e `237-246`. Os 4 testes novos **falham** se a verificação for removida (são asserções de `401`), então não são teste-fantasma. Falta um caso: corpo não-JSON — 🟢 nº 4. |
| **CA-06.9.f** — `provider_charge_id` fora de resposta pública | ✅ **Cumprido, sem regressão** | Saída real acima. |

---

## Achados

### 🟡 nº 1 [segurança / infra] `PIX_WEBHOOK_SECRET` com valor funcional versionado — e o README que autoriza a exceção não foi atualizado

**Onde:** `infra/k8s/secret.yaml:12` · `README.md:107-112` e `README.md:310` (não atualizados)

**Cenário concreto:** um `kubectl apply -k infra/k8s/` sem edição prévia sobe o cluster com
`PIX_WEBHOOK_SECRET=pms_hotel_pix_webhook_secreto_academico_2026`. Qualquer pessoa com leitura do
repositório: (1) cria uma reserva anônima em `POST /public/<sub>/bookings`, (2) recebe o
`provider_charge_id` no `201` (vazamento conhecido, `CreateBookingController.js:159`), (3) assina
`{"provider_charge_id":"fake_…"}` com o segredo lido do git e (4) recebe `200 confirmed` com a
reserva `CONFIRMED` — **exatamente o ataque que a T-06.9 fecha**, reaberto pelo valor default.

**Por que 🟡 e não 🔴** — e é um julgamento, não uma certeza:
- `secret.yaml:6` carrega a anotação `"SUBSTITUA os valores abaixo antes de aplicar em qualquer ambiente"`.
- `README.md:112` declara a política do projeto de forma explícita: *"Para este projeto acadêmico os
  valores estão no repositório para facilitar a avaliação"*. `JWT_SECRET`, `POSTGRES_PASSWORD` e as
  credenciais do MinIO já seguem esse padrão e não foram tratados como 🔴 em auditoria nenhuma.
- A branch **segue** a convenção vigente; não a inventa.

**Mas a exceção documentada não cobre este segredo:** a tabela do `README.md:107-110` lista apenas
`POSTGRES_PASSWORD` e `JWT_SECRET`, e o `README.md:310` diz que o Secret guarda *"`POSTGRES_PASSWORD`
e `JWT_SECRET`"*. O terceiro segredo entrou no manifesto sem entrar na documentação que o autoriza.

**Regra violada:** CA-06.9.b (literalmente: *"nunca versionado"*) · fail-safe.

**Correção sugerida (a menor):** atualizar as duas passagens do README incluindo
`PIX_WEBHOOK_SECRET`, deixando explícito que este em particular **protege dinheiro** e precisa ser
trocado antes de qualquer ambiente exposto. **Correção que resolve de verdade** (pendência para a
T-01.6, integração do PSP real): tirar o valor de `secret.yaml` e criar o Secret fora do git
(`kubectl create secret generic hotel-secret --from-literal=…`), mais uma guarda de boot que recusa
subir o serviço se `PIX_WEBHOOK_SECRET` for igual ao valor publicado no repositório.

> **Se o time discordar do enquadramento acadêmico, este achado vira 🔴 e reprova a branch.**
> Registro a régua que usei para que a decisão seja de quem é dono, não minha.

---

### 🟡 nº 2 [observabilidade / operação] Rejeição por assinatura é 100% silenciosa — o modo de falha mais provável em produção é invisível

**Onde:** `app/Controllers/WebhookApi/PixWebhookController.js:36-39`

```js
const signature = request.get('x-pix-signature');
if (!verifyPixSignature(request.rawBody, signature, secret)) {
    return response.status(401).json({ error: 'Assinatura inválida' });
}
```

**Cenário concreto:** em produção, o PSP real é configurado com o segredo `A` e o backend com o
segredo `B` (ou o PSP envia `Content-Type: application/vnd.api+json`, ou um proxy re-serializa o
corpo — os três casos que reproduzi acima resultam no **mesmo** `401`). A partir desse instante
**todo** callback é rejeitado: hóspedes pagam o PIX, o dinheiro entra na conta do hotel, e nenhuma
reserva sai de `PENDING`. O servidor não emite **uma única linha de log**. Ninguém descobre até um
hóspede ligar reclamando — ou até a reserva expirar e o quarto ser revendido.

Compare com o caminho vizinho: a ausência de `PIX_WEBHOOK_SECRET` **loga**
(`PixWebhookController.js:28`). A assinatura errada, que é a falha muito mais provável, não.

Também não há métrica, contador nem alerta. O endpoint que decide se o hotel recebeu dinheiro é o
único do sistema sem rastro do seu caminho de erro.

**Regra violada:** Fail Fast (CLAUDE.md §quality global — "nunca declarar pronto sem validar de
verdade"; aqui a falha nem é observável) · CLAUDE.md §7 (risco financeiro).

**Correção sugerida (a menor):** um `console.warn` no caminho 401, sem PII e sem o segredo — algo
como `PixWebhookController: assinatura inválida (content-type=%s, rawBody=%s, sig_len=%d)`, com
`rawBody` reportado apenas como `presente|ausente` e `sig_len` só o comprimento. Isso distingue, no
log, os três modos de falha (segredo errado · content-type errado · corpo alterado) sem dar nenhum
material a quem ataca.

---

### 🟡 nº 3 [validação de entrada / financeiro] `provider_charge_id` sem validação de tipo — array vira `IN (...)` e permite busca em lote

**Onde:** `app/Controllers/WebhookApi/PixWebhookController.js:41-48` (código **pré-existente**, não
alterado por esta branch, mas dentro do endpoint que a branch se propôs a endurecer)

**Cenário concreto — reproduzido.** Com assinatura válida:

```
POST /webhooks/pix
{"provider_charge_id": ["nao_existe", "fake_f1e68c24-85b4-4f1b-b7f5-034ab868470e"]}
→ 200 {"status":"confirmed","payment_id":"eb298006-…","reservation_status":"CONFIRMED"}
→ payment = PAID
```

Sequelize traduz o array para `WHERE provider_charge_id IN (…)` e o `findOne` casa com o primeiro
que existir. Efeito prático: quem tem o segredo **não precisa saber qual** charge id é válido —
manda centenas por requisição e o servidor acha. Isso **amplifica** o 🟡 nº 1: com o segredo lido do
git, a enumeração deixa de ser um chute por vez.

Outros tipos hostis (objeto vazio, `{ne:null}`, `{like:'%'}`, booleano, número) resultam em `500`
com o pagamento intocado — não vazam, mas geram `500` onde o correto seria `400`.

**Regra violada:** Fail Fast · CLAUDE.md §7 (endpoint financeiro sem validação de entrada).

**Correção sugerida (uma linha):**

```js
if (typeof provider_charge_id !== 'string' || !provider_charge_id) {
    return response.status(400).json({ error: 'provider_charge_id obrigatório' });
}
```

---

### 🟡 nº 4 [contrato de API] O contrato mudou — `config/swagger.js` e o `openapi.json` do cliente tipado não mudaram

**Onde:** `services/core-service/config/swagger.js:186-199` · `frontend/packages/api-client/openapi.json:443-478`

**Cenário concreto:** a branch tornou `x-pix-signature` **obrigatório** e introduziu a resposta
`401`. Nenhum dos dois artefatos de contrato reflete isso:

- `swagger.js:198` ainda lista só `{200, 400, 404}` — sem `401`.
- Não há `parameters: [{ in: 'header', name: 'x-pix-signature', required: true }]`.
- A `description` ainda instrui: *"No provider simulado, dispare manualmente com o
  provider_charge_id retornado na criação da reserva"* — instrução que **hoje devolve 401**.
  Quem seguir a documentação do `/api-docs` na banca vai ver o endpoint falhar.
- O `openapi.json` versionado em `frontend/packages/api-client/` (gerado por
  `npm run generate` → `scripts/dump-openapi.mjs`) carrega a mesma descrição obsoleta.

Confirmei com `grep` que **nenhum arquivo do frontend consome `/webhooks/pix`** (é callback
servidor-a-servidor), por isso 🟡 e não 🔴 — não quebra o cliente tipado hoje. Mas a regra do
CLAUDE.md sobre contrato no Swagger existe justamente para não acumular essa deriva.

**Regra violada:** CLAUDE.md §7 / checklist — endpoint com contrato divergente do Swagger.

**Correção sugerida:** adicionar o `parameters` do cabeçalho e o `401` em `swagger.js`, trocar a
`description` para apontar `scripts/simular_pagamento_pix.js`, e rodar `npm run generate` no
`api-client` para regravar o `openapi.json`.

---

### 🟡 nº 5 [SOLID — ISP/LSP] `signNotification` fora do contrato `PixProvider`: a suíte depende de um método que só o simulador tem

**Onde:** `app/services/pix/FakePixProvider.js:45` · `app/services/pix/PixProvider.js` (contrato, só
tem `createCharge`) · `tests/public-booking.test.js:25` · `scripts/simular_pagamento_pix.js:44`

**Cenário concreto:** no dia em que a T-01.6 registrar um `RealPixProvider` no mapa `PROVIDERS` de
`app/services/pix/index.js:12` e o ambiente definir `PIX_PROVIDER=mercadopago`, a linha 25 de
`public-booking.test.js` quebra com `getPixProvider(...).signNotification is not a function` — um
`TypeError` cru, não uma falha legível. O comentário do próprio método (`FakePixProvider.js:36-38`)
antecipa o problema e escolhe conviver com ele.

Há ainda uma inconsistência de caminho: **os testes assinam via o provider**
(`getPixProvider().signNotification`) enquanto **o script de demo assina via o utilitário**
(`computePixSignature` direto, `simular_pagamento_pix.js:44`) — e o cabeçalho do script afirma ser
*"o mesmo HMAC que `FakePixProvider.signNotification()` usa nos testes"*. É o mesmo HMAC, sim, mas
por duas portas diferentes. Duas portas para a mesma decisão de segurança é como as cópias divergem.

**Regra violada:** SOLID-ISP/LSP (dependente do contrato usando método fora dele) · DRY (dois
caminhos para assinar).

**Correção sugerida (a menor):** declarar `signNotification()` no contrato `PixProvider.js`
lançando `Error('signNotification() não implementado pelo provider PIX.')`, exatamente no padrão já
usado por `createCharge()`. O `RealPixProvider` futuro é obrigado a decidir conscientemente, e o
erro que a suíte dá passa a ser legível. Alternativa igualmente válida: testes e script usarem
**ambos** `computePixSignature` direto, e o método do Fake deixar de existir — mas isso conflita com
a letra do CA-06.9.d.

---

### 🟢 nº 1 [info leak, impacto ~zero] Mensagens de erro distinguem "sem segredo configurado" de "assinatura errada"

**Onde:** `PixWebhookController.js:29` (`'Webhook não configurado'`) vs `:38` (`'Assinatura inválida'`)

**Cenário:** um atacante anônimo faz `POST /webhooks/pix` com lixo e lê o corpo do 401. Se vier
`Webhook não configurado`, ele sabe que o servidor está sem `PIX_WEBHOOK_SECRET` — informação de
configuração interna entregue a quem não se autenticou. Não é explorável (o caminho é fail-closed
nos dois casos, verificado), mas é informação que não precisava sair.

**Regra violada:** princípio de mensagens de erro uniformes em endpoint não autenticado.

**Correção sugerida:** o mesmo corpo (`{ error: 'Assinatura inválida' }`) nos dois ramos; a
distinção continua existindo **no log**, que já é onde ela serve.

---

### 🟢 nº 2 [replay] Assinatura sem timestamp/nonce — replay é permanente, neutralizado só pela idempotência

**Onde:** `app/utils/pixWebhookSignature.js:18-21` (o HMAC cobre **apenas** o corpo)

**Cenário:** um par `(corpo, assinatura)` capturado — por exemplo do stdout de
`scripts/simular_pagamento_pix.js:38`, que **imprime a assinatura completa** — é válido para
sempre. Hoje o dano é nulo: o reenvio cai na idempotência e devolve `already_processed`
(reproduzi: `200 {"status":"already_processed"}`). Vira problema quando existir um webhook de
estorno/cancelamento, ou se algum fluxo futuro reverter um pagamento para `PENDING`.

PSPs reais (Stripe, Mercado Pago) assinam `timestamp.payload` e rejeitam fora de uma janela. O
projeto está definindo agora o formato que o `RealPixProvider` vai ter que seguir.

**Correção sugerida (pendência da T-01.6):** incluir o cabeçalho de timestamp no material assinado e
rejeitar fora de uma janela de ±5 min. Registrar a decisão de formato na spec antes da integração,
não depois.

---

### 🟢 nº 3 [robustez] `verifyPixSignature` **lança** se `rawBody` não for string/Buffer, contra o que o próprio docstring promete

**Onde:** `app/utils/pixWebhookSignature.js:24-27` (docstring) vs `:34` (comportamento)

O docstring diz *"Fail-closed: qualquer parâmetro ausente (secret, assinatura, corpo) retorna
false"*. Medido:

```
verifyPixSignature({a:1}, 'x', 'segredo') → THREW TypeError: The "data" argument must be of type string…
verifyPixSignature(0,      'x', 'segredo') → THREW TypeError
verifyPixSignature(false,  'x', 'segredo') → THREW TypeError
```

**Cenário:** não é alcançável pelo HTTP hoje (`request.rawBody` é sempre `Buffer` ou `undefined`).
Vira bug quando alguém chamar `verifyPixSignature(request.body, …)` — o erro mais natural de se
cometer, já que `request.body` é o que todo controller do projeto usa. O resultado seria `500` em
vez de `401`: ainda sem efeito colateral (o `catch` do controller segura), mas com o log e o código
HTTP errados.

**Correção sugerida:** trocar a guarda da linha 30 por
`if (!secret || !receivedSignature || (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody))) return false;`.

---

### 🟢 nº 4 [teste] Falta o caso que eu considerei o mais perigoso: corpo não-JSON com assinatura válida

**Onde:** `tests/public-booking.test.js:122-181`

Os 4 testes novos cobrem assinatura inválida, ausente, corpo adulterado e segredo ausente — todos
com `Content-Type: application/json` (fixo no helper `postSignedWebhook`, linha 23). O vetor que
**não** está coberto é o que depende de um detalhe de `body-parser`: `Content-Type: text/plain` faz
o `verify` nunca rodar, `request.rawBody` ficar `undefined`, e a segurança passar a depender
inteiramente da guarda `rawBody === undefined` em `pixWebhookSignature.js:30`.

Hoje funciona — verifiquei. Mas se alguém trocar essa guarda por um `!rawBody` "equivalente", ou
mudar a opção `type` do `express.json`, **nenhum teste da suíte reclama**.

**Correção sugerida:** um teste enviando `Content-Type: text/plain` com assinatura genuína e
afirmando `401` + pagamento `PENDING`. É a única asserção que trava o acoplamento entre
`express.json({verify})` e o controller.

---

### 🟢 nº 5 [interop] Assinatura em hex maiúsculo é rejeitada

**Onde:** `app/utils/pixWebhookSignature.js:34-41`

`verifyPixSignature(corpo, assinaturaValida.toUpperCase(), segredo)` → `false` (medido). O formato é
definido pelo projeto, então hoje não há divergência. Registro porque PSPs reais variam no case do
hex e no prefixo (`sha256=` vs hex puro vs base64), e essa é uma das primeiras coisas a quebrar na
T-01.6 — com diagnóstico difícil, já que o 🟡 nº 2 garante que não haverá log.

---

### 🟢 nº 6 [privacidade / memória] `request.rawBody` passou a ser retido em **todas** as rotas, inclusive `/auth/login` e `/guests`

**Onde:** `routes/router.js:35-39`

O `verify` é global ao router, não específico do webhook. Toda requisição passa a carregar o buffer
cru do corpo anexado ao objeto `request` — incluindo senha em texto puro no `POST /auth/login` e
CPF/e-mail/telefone no `POST /guests`.

**Hoje não vaza:** confirmei com `grep` que não existe `morgan`, error-handler global nem nenhum
`console.*` que imprima o objeto `request` (só `console.error('Controller:', error)`). O risco é
prospectivo: no dia em que alguém adicionar um logger de requisição ou um reporter de exceção que
serialize `request`, senhas e CPF entram no log — e a origem não será óbvia.

**Regra violada:** LGPD art. 6º, III (minimização) — prospectiva, não atual.

**Correção sugerida:** restringir o `verify` ao caminho do webhook, montando
`express.json({ verify })` apenas no `webhookRouter` e mantendo `express.json()` simples no router
geral. Custa uma linha e elimina a classe inteira.

---

## Pré-existentes confirmados (fora do diff — não reprovam esta branch)

Reconfirmei os dois 🔴 do relatório de 16/09. **Ambos seguem abertos, mas a severidade real caiu**
porque o `provider_charge_id` deixou de ser credencial suficiente:

1. **`GET /payments` devolve o `PaymentModel` inteiro** — `ListPaymentController.js:6-12`: `findAll`
   sem `attributes`, e `paymentRouter.js:15` sem `requireRole`. Qualquer usuário autenticado do
   tenant continua recebendo `pix_qr_code`, `provider` e `provider_charge_id`. O QR é instrumento de
   pagamento; a exposição a papéis não-ADMIN segue indevida. A recomendação de `defaultScope` no
   `PaymentModel` continua pendente.
2. **`POST /public/:subdomain/bookings` devolve `pix.provider_charge_id` a anônimo** —
   `CreateBookingController.js:159`. Confirmado **inalterado**. Com a assinatura exigida, não é mais
   explorável sozinho; permanece coleta de dado que o hóspede não usa (ele precisa do QR, não do txid).
3. **Bônus não reportado antes:** `paymentRouter.js:19` expõe `DELETE /payments/:id` **sem
   `requireRole('ADMIN')`** e sem trilha de auditoria (`deleted_by`). Endpoint destrutivo em
   entidade financeira. Fora do diff; registro como pendência nova.

**Isolamento multi-tenant:** a verificação de assinatura **não introduziu nenhum vazamento
cross-tenant**. `PaymentModel.findOne({ where: { provider_charge_id } })`
(`PixWebhookController.js:47`) é global por natureza — o callback do PSP não carrega tenant — e a
busca seguinte da reserva escopa corretamente por `payment.tenant_id` (linha 60). Estrutura idêntica
à de `develop`, sem regressão.

**Registro de arquitetura para a T-01.6:** o `PIX_WEBHOOK_SECRET` é **único para toda a plataforma**.
No modelo atual (um PSP do operador) está correto. No dia em que cada hotel conectar a própria conta
PSP, um tenant de posse do segredo da plataforma consegue confirmar pagamento de outro tenant. Não é
falha hoje; é uma decisão sendo congelada agora que fica cara depois. Deve virar segredo por tenant
junto com a integração real.

---

## O que foi verificado e está correto

- Verificação de assinatura é a **primeira** instrução do `try`, antes de `request.body` e antes de
  qualquer query — nenhum oráculo 400/404 disponível para quem não assina (conferido linha a linha
  e por resposta idêntica em charge existente vs inexistente).
- HMAC calculado sobre o **Buffer cru**, não sobre `JSON.stringify(request.body)` — e o teste do
  "corpo alterado depois de assinado" (`public-booking.test.js:143-155`) trava essa propriedade.
- `express.json({ verify })` é o **único** parser de corpo do serviço (`grep` em todo o repositório);
  não há um segundo `express.json()` em `_web.js`/`bootstrap/app.js` que marcasse `req._body` e
  deixasse `rawBody` vazio em produção — erro clássico, ausente aqui.
- Guarda de comprimento antes de `timingSafeEqual` em todos os caminhos; 16 entradas hostis
  testadas, zero exceções.
- Fail-closed sobre ausência **e** string vazia de `PIX_WEBHOOK_SECRET`, inclusive contra assinatura
  genuína emitida instantes antes.
- Idempotência (RF-027) preservada: `200 confirmed` → `200 already_processed`, sem reprocessar.
- Transação Sequelize cobrindo `payments` + `reservations` (`PixWebhookController.js:57-74`),
  com `rollback` no `catch`.
- Máquina de estados respeitada: só `PENDING → CONFIRMED` (allowlist, linha 68); `CHECKED_IN` e
  demais não são tocados.
- ESM puro — nenhum `require()` no diff.
- Ordem de rotas: `/webhooks` é a última montagem em `router.js:83` e não colide com `/:id` algum.
- Script de demo: **não imprime o segredo** (só a assinatura derivada), recusa rodar sem
  `PIX_WEBHOOK_SECRET` com mensagem acionável, sai com código ≠ 0 em falha.
- `FakePixProvider.signNotification` lança erro claro sem segredo, em vez de assinar com `undefined`.
- `.env.example` e `.env.test.example` documentam a variável com explicação do fail-closed; `.env`
  e `.env.test` estão no `.gitignore` (conferido).
- Suíte completa verde (232/1 skip), cobertura acima do portão do CI, `qa_checks.sh` exit 0.
- Commits atômicos e em Conventional Commits (8 commits, um por camada).

---

## Não foi possível verificar

- **Comportamento sob proxy real.** Testei via `supertest`, que fala direto com o app Express. O
  nginx de `infra/k8s/nginx.yaml` não foi exercitado — se ele reescrever ou recompactar o corpo, a
  assinatura quebra e, pelo 🟡 nº 2, silenciosamente. Precisa de um teste ponta a ponta no cluster
  antes de considerar a T-06.9 fechada em produção.
- **Interoperabilidade com PSP real** (formato do cabeçalho, case do hex, timestamp na assinatura,
  `Content-Type` efetivamente enviado). Depende da T-01.6; registrei os pontos de atrito previstos
  nos 🟢 nº 2 e nº 5.
- **Resistência a timing attack medida.** Li o código e confirmei o uso de `timingSafeEqual` com
  guarda de comprimento, mas não executei análise estatística de tempo de resposta. O vazamento
  restante é o **comprimento** da assinatura, que é público (formato fixo `sha256=<64 hex>`).
- **Os arquivos de infra em execução** (`.github/workflows/ci.yml`, `infra/k8s/*`). Validei o
  conteúdo por leitura; não rodei o workflow do GitHub Actions nem apliquei os manifests. É a área
  marcada como do Weslley no PR — a revisão dela deve confirmar que o job de teste do CI realmente
  enxerga `PIX_WEBHOOK_SECRET` (o `env` está no nível do job correto, mas só a execução prova).

---

*Auditoria executada em 21/09/2026 · sondas criadas, executadas e removidas · working tree limpo ao final
(exceto `docs/specs/SPEC-06-qualidade-divida-tecnica.md`, já modificado antes desta auditoria).*
