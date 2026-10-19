# QA Red Team — public-booking payment leak

**Branch:** `fix/public-booking-payment-leak` (653b675) · **Base:** `develop@a25c972` · **Data:** 26/08/2026
**Arquivos auditados:** 2 no diff + 12 lidos por contexto · **Achados:** 8 (🔴 1 fora do diff · 🟡 3 · 🟢 4)

## Veredito

**APROVADO COM RESSALVAS**

O diff faz o que promete e não introduz nenhum achado 🔴. Nada do que a branch alterou
piorou o sistema. As ressalvas são: (a) a correção ficou sem qualquer proteção automatizada
contra regressão — verificado empiricamente, não é opinião; (b) a mesma classe de defeito
continua em outros dois pontos do mesmo fluxo, um deles público.

Há um 🔴 **pré-existente** no fluxo auditado (webhook PIX forjável), que **não** foi introduzido
por esta branch e por isso não a reprova — mas é o item de maior dano do módulo e reenquadra a
premissa da correção.

---

## Achados

### 🔴 [segurança/financeiro — PRÉ-EXISTENTE, fora do diff] Webhook PIX sem verificação de origem confirma reserva sem pagamento

**Onde:** `app/Controllers/WebhookApi/PixWebhookController.js:18-34` · `app/Controllers/PublicBookingApi/CreateBookingController.js:158-162`

**Cenário concreto (reproduzido pela própria suíte, `tests/public-booking.test.js:74-116`):**

1. `POST /public/aurora/bookings` (sem auth) → 201 devolvendo `pix.provider_charge_id`
2. `POST /webhooks/pix` com `{ provider_charge_id: <o mesmo valor> }` (sem auth, sem assinatura)
3. → `200 { status: 'confirmed', reservation_status: 'CONFIRMED' }`, `payment.status = PAID`,
   `paid_at` preenchido, quarto bloqueado no anti-double-booking — **sem um centavo entrar**.

O `provider_charge_id` é entregue ao cliente anônimo na resposta da criação e é a **única**
credencial exigida pelo webhook. O controller não valida assinatura, IP, HMAC nem nada
(o comentário da linha 8-10 reconhece a lacuna: *"Em produção, um PSP real assina a requisição"*).

**Por que isso importa para esta branch:** o payload que a correção tirou do endpoint público
contém o próprio token de forja — `FakePixProvider.js:20-28` monta o QR com `txid=${providerChargeId}`
em base64. Ou seja, vazar `pix_qr_code` publicamente equivaleria a publicar a credencial de
"confirme minha reserva de graça". A correção auditada está certa; o buraco maior é o vizinho.

**Regra violada:** CLAUDE.md §7 (risco financeiro) · princípio fail-safe.

**Correção sugerida (outra branch):** exigir assinatura do PSP no webhook (HMAC com segredo em env,
`FakePixProvider` assinando igual) e parar de devolver `provider_charge_id` ao cliente público —
o hóspede precisa do QR, não do txid.

---

### 🟡 [testes/verificação] A correção não tem nenhuma proteção automatizada contra regressão

**Onde:** `app/Controllers/PublicBookingApi/GetBookingStatusController.js:25-29` · `tests/public-booking.test.js:126-143` · `scripts/qa_checks.sh:143-147`

**Cenário:** um dev remove a linha `attributes: ['kind','status','amount','paid_at']` amanhã.
Resultado verificado, não suposto:

- **Suíte:** verde. Confirmei restaurando a versão de `develop` do controller e rodando o arquivo:
  15/15 passam, incluindo o teste novo. (O implementador declarou isso no commit — a declaração é
  verdadeira. Working tree restaurado ao fim do experimento.)
- **`qa:checks`:** silencioso. A regra 6 é um `grep -E` de **uma linha só**
  (`include:\s*\[\s*\{[^}]*model:\s*(...)[^}]*\}`). Ao quebrar o include em 5 linhas, o arquivo
  saiu do alcance do detector. Verifiquei rodando o regex da regra 6 contra o arquivo atual **sem**
  a linha `attributes`: exit 1, nenhum match.

Portanto o critério de aceite *"`npm run qa:checks` sem o aviso correspondente"* foi cumprido pela
**formatação**, não pela correção — o aviso teria sumido igual se só a quebra de linha tivesse sido
feita. O único artefato que hoje impede o retorno do bug é o comentário nas linhas 21-24.

**Regra violada:** CODING_STANDARDS (teste que passaria com a regra quebrada) · checklist QA §8.

**Correção sugerida (a menor):** manter o include em **uma linha** —
`include: [{ model: PaymentModel, as: 'payments', attributes: ['kind','status','amount','paid_at'] }]` —
o que devolve o arquivo ao alcance da regra 6 (que ignora linhas contendo `attributes`), e mover o
comentário para cima do `include`. Cobertura real do comportamento exige um assert de query
(spy em `ReservationModel.findOne` conferindo `include[0].attributes`), aí sim um teste que falha
sem a correção.

---

### 🟡 [DRY / defesa em profundidade incompleta] O include idêntico sem `attributes` continua em GetBillController

**Onde:** `app/Controllers/ReservationApi/GetBillController.js:19-24`

```js
{ model: PaymentModel,     as: 'payments' },   // linha 21 — sem attributes
```

**Cenário:** `GET /reservations/:id/bill` carrega o Payment inteiro — `pix_qr_code`, `provider`,
`provider_charge_id` — na memória do handler. Hoje a resposta é montada campo a campo
(`GetBillController.js:60-63`), exatamente o mesmo cenário do bug corrigido. Um `payments` cru
devolvido num refactor entrega o `provider_charge_id` a **qualquer usuário autenticado do tenant**
que, dado o 🔴 acima, é um token de confirmar pagamento sem dinheiro.

Confirmei com `grep -rn "as: 'payments'"` que existem exatamente **dois** consumidores: este e o
corrigido. Também confirmei que a regra 6 do `qa_checks.sh` **não** enxerga este arquivo (o include
é multilinha), então ele nunca apareceu como aviso.

**Regra violada:** LGPD art. 6º (minimização) · consistência do próprio critério da branch.

**Correção sugerida:** `attributes: ['id','amount','method','kind','status','paid_at']` — exatamente
os campos usados nas linhas 36-63.

---

### 🟡 [LGPD art. 6º] Endpoint público continua carregando o tenant inteiro, com CNPJ, a cada request

**Onde:** `app/utils/resolveTenantBySubdomain.js:17`

```js
const tenant = await TenantModel.findOne({ where: { subdomain } });
```

**Cenário:** os quatro endpoints públicos (`/hotel`, `/availability`, `/bookings`, `/bookings/:id/status`)
passam por aqui e trazem o registro completo do tenant — incluindo `legal_id` (CNPJ,
`app/Models/TenantModel.js:21`) — para dentro de um handler sem autenticação. Os controllers usam
apenas `id`, `name`, `subdomain`, `deposit_percent`, `status` e `booking_enabled`. É o **mesmo
raciocínio de defesa em profundidade** que justificou esta branch, aplicado a uma query e não à
irmã que roda no mesmo request.

**Regra violada:** LGPD art. 6º, III (minimização).

**Correção sugerida:** `attributes: ['id','name','subdomain','status','booking_enabled','deposit_percent']`.

---

### 🟢 [teste] `deposit.amount` só é validado como "algum número"

**Onde:** `tests/public-booking.test.js:138-142`

`expect.any(Number)` passa com 135, com 0 e com 999. Verifiquei por instrumentação que o driver `pg`
entrega o DECIMAL como **string** (`"135.00"`) e que o controller converte na linha 44 — não há
regressão de tipo. Mas travar o valor (`amount: 135`) protegeria de quebra no cálculo do sinal
com o mesmo custo.

### 🟢 [teste] O contrato trava o nome da chave, não o valor do QR

**Onde:** `tests/public-booking.test.js:132-135`

`not.toContain('pix_qr_code')` só falharia se a **chave** aparecesse. Um `payload: <base64 do QR>`
com outro nome passaria. Como o teste já guarda `providerChargeId`, guardar também `res.body.pix.qr_code`
do teste de criação e afirmar `expect(corpo).not.toContain(qrCode)` fecha o buraco em uma linha.

### 🟢 [robustez, pré-existente] `.find(kind === 'DEPOSIT')` sem ordenação

**Onde:** `app/Controllers/PublicBookingApi/GetBookingStatusController.js:35`

Hoje é seguro: `grep -rn "DEPOSIT" app/` mostra um único produtor (`CreateBookingController.js:130`),
um por reserva. Se algum dia existir reemissão de PIX expirado, a reserva terá dois DEPOSIT e a
página de polling pode mostrar o `PENDING` velho para um hóspede que já pagou. Ordenar por
`created_at DESC` no include resolve preventivamente.

### 🟢 [ferramenta] Regra 7 do `qa_checks.sh` dá falso positivo justamente no router auditado

**Onde:** `scripts/qa_checks.sh:152-165`

O único aviso restante do `qa:checks` acusa `publicBookingRouter` como fora do Swagger. É falso:
o endpoint está documentado em `config/swagger.js:163` sob o path `/public/{subdomain}/bookings/{id}/status`.
A regra deriva o nome do recurso do arquivo (`public-booking`), que não é o path. `roomCategoryRouter`
tem o mesmo falso positivo (o path é `/room-categories`). Dois dos cinco avisos são ruído — os de
`contracts`, `corporate-clients` e `event-quotes` são reais.

---

## O que foi verificado e está correto

Lista de cobertura, não elogio:

- **Isolamento multi-tenant:** `where: { id, tenant_id: tenant.id }` (`GetBookingStatusController.js:20`); o tenant vem do subdomínio via util, não do body.
- **`attributes` suficiente para a lógica:** instrumentei a query real. `Object.keys(payment.dataValues)` = `['kind','status','amount','paid_at']`; `payment.pix_qr_code` e `payment.provider_charge_id` retornam `undefined`. O `.find((p) => p.kind === 'DEPOSIT')` da linha 35 funciona.
- **`deposit.amount` continua Number na resposta:** o campo chega como `"135.00"` (string) e sai como `135` via `Number()` na linha 44. Sem regressão de tipo no JSON.
- **Sem colapso de linhas por falta de PK:** hipótese testada e **descartada**. Criei 3 pagamentos, 2 deles idênticos em todos os campos selecionados; o include sem `id` nos `attributes` devolveu os 3 objetos, igual ao include com `id`.
- **Nenhum outro consumidor quebrado:** `grep -rn "as: 'payments'"` → só `GetBookingStatusController` e `GetBillController`, com queries independentes. `attributes` é por query, não global.
- **Contrato de API intacto:** o corpo da resposta não mudou nenhum campo. Swagger já documenta o endpoint (`config/swagger.js:163`, sem schema de 200) e `frontend/packages/api-client/src/schema.d.ts:210` não referencia campos de payment. Nenhum consumidor no `frontend/apps`.
- **Regras do CLAUDE.md aplicáveis ao diff:** ESM puro (sem `require`), sem escrita (transação não se aplica), sem rota nova (ordem de rotas inalterada), sem `total_amount` vindo do cliente, sem `findByPk`.
- **Suíte completa:** `16 arquivos · 221 passam · 1 skip` — número declarado pelo implementador confirmado.
- **Cobertura:** 74,05% statements · 76,4% lines · 70,96% branches · 84,02% functions — acima do portão de 60/55 do CI.
- **`npm run qa:checks`:** exit 0, sem o aviso da regra 6 no `GetBookingStatusController` (com a ressalva 🟡 acima sobre a causa).
- **Declarações do implementador:** as três foram checadas e são **verdadeiras**, inclusive a desconfortável (o teste passa sem a correção). Declarar isso no commit em vez de esconder é o comportamento certo.
- **LGPD no diff:** nenhum campo novo coletado, nenhum `console.*` com objeto de request/model, nenhum PII em query string (o id na URL é UUID de reserva).

## Não foi possível verificar

- **Comportamento com PSP real:** só existe o `FakePixProvider`. O impacto do 🔴 com um PSP de verdade
  depende de o `provider_charge_id` real ser adivinhável/reutilizável — não dá para afirmar daqui.
- **Eliminação definitiva (LGPD art. 18, VI):** `PaymentModel` e demais models são `paranoid: true`.
  Não localizei rotina de purge. Fica registrado como **pendência do produto**, não achado desta branch.
- **Rate limit / enumeração no endpoint público:** não há middleware de throttle no caminho
  `/public/:subdomain/*`. Como os ids são UUIDv4, classifico como baixo risco, mas não testei
  o comportamento sob carga nem existe proteção contra varredura de subdomínios.
