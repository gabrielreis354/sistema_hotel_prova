# QA Red Team — public-booking payment leak (T-06.5, reauditoria pós-merge de layout)

**Branch:** `fix/public-booking-payment-leak` (c20b7e3) · **Base:** `origin/develop@fb60708` · **Data:** 16/09/2026
**Arquivos auditados:** 4 no diff + 17 lidos por contexto · **Achados:** 10 (🔴 2 pré-existentes, fora do diff · 🟡 3 · 🟢 5)
**Auditoria anterior:** `docs/qa/redteam_public-booking-leak_26ago2026.md` (26/08) — as três ressalvas 🟡 dela foram endereçadas nesta branch.

## Veredito

**APROVADO COM RESSALVAS**

O diff cumpre o que promete, não introduz nenhum achado 🔴 e **não quebra contrato de resposta
em nenhum dos três pontos alterados** — verificado com a suíte completa (221 passam · 1 skip) e com
o SQL gerado pela query pública. As três ressalvas 🟡 da auditoria de 26/08 foram de fato fechadas.

As ressalvas novas são:

1. **CA-06.5.c está cumprido só na letra.** O teste adicionado trava o contrato da resposta, mas
   **passa com a correção removida** — reproduzi, 15/15 verdes. E a rede que o implementador montou
   no lugar (regra 6 do `qa_checks.sh`) é `report_warn`, não `report_error`: o CI fica **verde**. O
   comentário no código afirma o contrário, e essa afirmação falsa é o que mais preocupa aqui.
2. **A correção é por call site, não por model.** Um terceiro consumidor de `PaymentModel` amanhã
   vaza de novo, e o detector não enxerga query direta no model — prova viva: `GET /payments`
   devolve `pix_qr_code` **hoje**, e nunca apareceu em aviso nenhum.

Existem **dois 🔴 pré-existentes** no mesmo fluxo, ambos fora do diff e presentes em `develop`.
Não reprovam esta branch (mesma convenção do relatório de 26/08), mas um deles é **novo neste
relatório, reproduzido, e é o item de maior dano do módulo**.

---

## Critérios de aceite — verificação item a item

| CA | Status | Evidência |
|---|---|---|
| **CA-06.5.a** — `attributes` explícito, só o necessário | ✅ **Cumprido** | SQL real da query (instrumentado): `SELECT ... "payments"."id", "payments"."kind", "payments"."status", "payments"."amount", "payments"."paid_at" FROM "reservations" LEFT OUTER JOIN "payments"`. `pix_qr_code`, `provider` e `provider_charge_id` **não entram no SELECT**. O `payments.id` é adicionado pelo Sequelize automaticamente (não é sensível e elimina o risco de colapso de linhas). |
| **CA-06.5.b** — sensíveis não retornam sem autenticação | ⚠️ **Cumprido no endpoint auditado; falso no escopo do sistema** | `GET /public/:subdomain/bookings/:id/status`: nada sensível, nem na query nem na resposta. Mas `POST /public/:subdomain/bookings` (também **sem autenticação**) devolve `pix.provider_charge_id` e `pix.qr_code` — `CreateBookingController.js:158-161`. O QR é necessário (o hóspede paga com ele); o `provider_charge_id` **não é**, e é o token de forja do webhook (🔴 nº 2). Pré-existente. |
| **CA-06.5.c** — teste garantindo que sensíveis não aparecem | ⚠️ **Parcial** | O teste existe e trava o contrato da resposta, mas **não falha sem a correção** — reproduzido (ver 🟡 nº 1). |
| **CA-06.5.d** — `qa:checks` sem o aviso | ✅ **Cumprido, e desta vez pela correção** | `bash scripts/qa_checks.sh` → exit 0, 3 avisos, nenhum de include sem attributes. Testei o inverso: removendo o `attributes`, o aviso **volta** (`GetBookingStatusController.js:29`). A decisão de manter o include em uma linha funcionou — a ressalva de 26/08 sobre "cumprido pela formatação" está resolvida. |

---

## Achados

### 🔴 [segurança/financeiro — PRÉ-EXISTENTE, fora do diff, NOVO neste relatório] `GET /payments` entrega o `provider_charge_id` a qualquer usuário autenticado — e ele é a senha do webhook

**Onde:** `services/core-service/app/Controllers/PaymentApi/ListPaymentController.js:14` ·
`services/core-service/app/Controllers/PaymentApi/GetPaymentController.js:17` ·
`services/core-service/routes/apis/paymentRouter.js:15-16` (sem `requireRole`) ·
`services/core-service/app/Controllers/WebhookApi/PixWebhookController.js:26`

**Cenário concreto — reproduzido**, não deduzido. Rodei um teste-sonda (criado, executado e removido;
working tree limpo ao fim):

1. Reserva pública criada via `POST /public/:subdomain/bookings` → gera Payment PIX PENDING.
2. `GET /payments` com um JWT comum do tenant (a rota tem `authMiddleware` + `tenantMiddleware`,
   **nenhum `requireRole`**) → `200` com o model inteiro. Saída real da sonda:

```
PROBE qr: MDAwMjAxMjZ8YnIuZ292LmJjYi5waX
PROBE charge: fake_f940b806-62a4-4971-bb0b-30cc7b3d7662
```

3. Com esse `provider_charge_id`, `POST /webhooks/pix` (sem autenticação, sem assinatura) marca o
   pagamento como `PAID` e promove a reserva `PENDING → CONFIRMED` — **sem um centavo entrar**.

Ou seja: **qualquer** usuário do tenant — inclusive papéis não-ADMIN — consegue confirmar uma
reserva como paga. A branch fechou a porta pública do QR e deixou a porta autenticada escancarada,
e a porta autenticada não tem trava de papel.

**Por que a regra 6 nunca pegou:** ela casa `include: [{ ... model: PaymentModel ... }]`. Aqui o
`PaymentModel` é o **model raiz** da query (`PaymentModel.findAll`), não um include. Fora do alcance
do grep, para sempre.

**Regra violada:** LGPD art. 6º, III (minimização) · CLAUDE.md §7 (risco financeiro) · princípio
fail-safe.

**Correção sugerida (outra branch):** `defaultScope` no `PaymentModel` com
`attributes: { exclude: ['pix_qr_code', 'provider_charge_id', 'provider'] }`. Resolve os dois
controllers, o `GetBillController`, o `GetBookingStatusController` e **todo consumidor futuro**, de
uma vez — quem precisar dos campos pede via `PaymentModel.unscoped()`.

---

### 🔴 [segurança/financeiro — PRÉ-EXISTENTE, fora do diff, JÁ REPORTADO em 26/08 e ainda aberto] Webhook PIX sem verificação de origem

**Onde:** `services/core-service/app/Controllers/WebhookApi/PixWebhookController.js:20-30` ·
`services/core-service/app/Controllers/PublicBookingApi/CreateBookingController.js:158-161`

**Cenário:** exatamente o descrito no relatório de 26/08, **inalterado**. O `provider_charge_id` é
devolvido ao cliente anônimo no `201` da criação e é a **única** credencial exigida pelo webhook. O
próprio código admite a lacuna no comentário (`PixWebhookController.js:7-8`: *"Em produção, um PSP
real assina a requisição"*). A suíte exercita o caminho como se fosse feature
(`tests/public-booking.test.js:108-116`).

Vale a releitura: a branch tirou o `pix_qr_code` do endpoint público **porque** ele carrega o txid
em base64 — e o txid segue sendo entregue em texto puro pelo endpoint vizinho, também público.

**Regra violada:** CLAUDE.md §7 (risco financeiro) · fail-safe.

**Correção sugerida (outra branch):** HMAC do PSP validado no webhook (`FakePixProvider` assinando
igual) **e** parar de devolver `provider_charge_id` no `201` público — o hóspede precisa do QR, não
do txid. Isso também fecha o CA-06.5.b no escopo do sistema.

---

### 🟡 [verificação / documentação enganosa] O comentário afirma que remover o `attributes` reprova o build. Não reprova.

**Onde:** `services/core-service/app/Controllers/PublicBookingApi/GetBookingStatusController.js:26-28`

```js
// Mantenha o include em UMA linha: a regra 6 do scripts/qa_checks.sh é um
// grep de linha única. Quebrado em várias linhas, o include sai do alcance
// do detector e remover o `attributes` deixaria de reprovar o build.
```

**Cenário — reproduzido.** Removi o `attributes` do include (mantendo a linha única) e medi:

- **Suíte:** `tests/public-booking.test.js` → **15/15 passam**, incluindo o teste novo
  "o status público não expõe dados sensíveis do pagamento". O motivo é o que o próprio implementador
  declarou no commit `653b675`: o vazamento estava na query, e a resposta é montada campo a campo
  (`GetBookingStatusController.js:37-47`) — serialização e query são independentes.
- **`qa_checks.sh`:** o aviso **aparece** (`GetBookingStatusController.js:29: include: [{ model: PaymentModel, as: 'payments' }]`)
  — a linha única funcionou. Mas a regra é `report_warn` (`scripts/qa_checks.sh:150`), não
  `report_error`; o script termina em `[ "$ERRORS" -eq 0 ]` e o **exit é 0**. O cabeçalho do próprio
  script diz: *"Saída: 0 se não houver ERRO. WARN não reprova"* (`scripts/qa_checks.sh:15`). O job de
  CI é `run: bash scripts/qa_checks.sh` (`.github/workflows/ci.yml:30`) — **verde**.

Resultado líquido: a regressão passaria por CI e suíte, deixando só uma linha âmbar no log que
ninguém lê. O comentário cria a ilusão oposta — e é pior que a ausência de comentário, porque
desestimula o próximo dev de montar a proteção real.

Restauração verificada: `git status` limpo após o experimento.

**Regra violada:** CLAUDE.md §9 (checklist de qualidade) · "teste que passaria com a regra quebrada".

**Correção sugerida (a menor):** corrigir o comentário para dizer o que é verdade ("a regra 6 do
`qa_checks.sh` emite **aviso** — não bloqueia") **e**, para proteção real, uma de duas:
(a) promover a regra 6 a `report_error`; ou (b) um teste que espione a query —
`vi.spyOn(ReservationModel, 'findOne')` afirmando `include[0].attributes` — que é o único artefato
que falha vermelho quando a correção sai.

---

### 🟡 [SOLID / fail-open] A defesa é por call site; o defeito volta no próximo consumidor

**Onde:** `services/core-service/app/Controllers/PublicBookingApi/GetBookingStatusController.js:29` ·
`services/core-service/app/Controllers/ReservationApi/GetBillController.js:24`

**Cenário:** o conhecimento "estes 3 campos do Payment são segredo" ficou espalhado em duas
allowlists diferentes (`['kind','status','amount','paid_at']` e
`['id','amount','method','kind','status','paid_at']`), nenhuma das duas no model. Um controller novo
`GetPaymentReceiptController` amanhã, escrito por outro dev, faz `PaymentModel.findOne(...)` sem
`attributes` e vaza — sem aviso nenhum, exatamente como `ListPaymentController` vaza hoje (🔴 nº 1).

O commit `3c2023f` afirma, corretamente, que *"eram os dois únicos consumidores de `as: 'payments'`
no repo"*. A afirmação é verdadeira e eu confirmei com `grep -rn "as: 'payments'"`. O problema é que
o recorte da busca (`as: 'payments'`) não é o recorte do risco (**qualquer** leitura do
`PaymentModel`).

**Regra violada:** fail-safe (CLAUDE.md §7 — allowlist no lugar certo) · DRY (a mesma decisão de
segurança escrita duas vezes, com listas divergentes).

**Correção sugerida:** `defaultScope` no `PaymentModel` excluindo `pix_qr_code`,
`provider_charge_id` e `provider`. As allowlists dos dois controllers podem continuar (defesa em
profundidade), mas deixam de ser a única linha.

---

### 🟡 [LGPD art. 6º, III — PRÉ-EXISTENTE, fora do diff] A mesma classe de defeito continua viva em 5 includes multilinha, dois deles vazando PII de verdade

**Onde (varredura minha, complementar à regra 6):**

```
app/Controllers/ReservationApi/GetReservationController.js:14   { model: GuestModel, as: 'guest' },
app/Controllers/ContractApi/GetContractController.js:12         { model: CorporateClientModel, as: 'client' },
app/Controllers/ContractApi/DownloadContractPdfController.js:13 { model: CorporateClientModel, as: 'client' },
app/Controllers/EventQuoteApi/GetEventQuoteController.js:11     { model: CorporateClientModel, as: 'client' },
app/Controllers/EventQuoteApi/DownloadQuotePdfController.js:12  { model: CorporateClientModel, as: 'client' },
```

**Cenário — diferente dos anteriores, aqui o dado sai na resposta:**

- `GET /reservations/:id` faz `return response.json(reservation)` (`GetReservationController.js:21`)
  com o `guest` inteiro — e `GuestModel` tem `cpf`, `phone`, `email` (`app/Models/GuestModel.js:21-29`).
  A rota não tem `requireRole` (`routes/apis/reservationRouter.js:27`): qualquer usuário autenticado
  do tenant recebe o CPF do hóspede em toda consulta de reserva.
- `GET /contracts/:id` faz `{ ...contract.toJSON(), ... }` (`GetContractController.js:17`) com o
  `client` inteiro, que carrega dados do representante legal.

Nos dois casos o `include: [` está em linha própria → **a regra 6 nunca os viu**, e nunca vai ver.
Não é achado desta branch, mas é a prova de que o critério "sem o aviso do `qa_checks`" mede pouco.

**Regra violada:** LGPD art. 6º, III (minimização).

**Correção sugerida (outra branch, escopo SPEC-06):** `attributes` explícito nos cinco pontos +
tornar a regra 6 multilinha (`grep -Pzo` ou um parser simples), senão a dívida some do radar de novo.

---

### 🟢 [teste] O teste trava o nome da chave do QR, não o valor — recomendação de 26/08 não aplicada

**Onde:** `services/core-service/tests/public-booking.test.js:132-135`

`expect(corpo).not.toContain('pix_qr_code')` só falha se a **chave** aparecer. O teste já guarda
`providerChargeId` e o confere por valor (bom), mas o QR não: um `payload: <base64 do QR>` com outro
nome passaria batido. O relatório de 26/08 sugeriu guardar `res.body.pix.qr_code` no teste de criação
e afirmar `expect(corpo).not.toContain(qrCode)`. Uma linha. Continua em aberto.

### 🟢 [teste] `deposit.amount` continua validado como "algum número"

**Onde:** `services/core-service/tests/public-booking.test.js:140`

`expect.any(Number)` passa com 135, com 0 e com 999. O valor é determinístico (30% de 450 = 135) e
está travado no teste de criação (`linha 92`). Travar aqui também custa o mesmo e protege o cálculo
do sinal. Também já sugerido em 26/08, também em aberto.

### 🟢 [teste] Não há teste de isolamento cross-tenant no endpoint público

**Onde:** `services/core-service/tests/public-booking.test.js` (um único tenant em toda a suíte) ·
`services/core-service/tests/tenant-isolation.test.js` (nenhuma rota `/public/`)

O código está correto — `where: { id, tenant_id: tenant.id }`
(`GetBookingStatusController.js:20`) — mas ninguém testa o cenário "reserva do hotel A consultada
pelo subdomínio do hotel B → 404". Como esta branch mexeu justamente nessa query e no resolver de
tenant, era o momento natural de cobrir. Pré-existente, não regressão.

### 🟢 [robustez, pré-existente] `.find(kind === 'DEPOSIT')` sem ordenação

**Onde:** `services/core-service/app/Controllers/PublicBookingApi/GetBookingStatusController.js:35`

Seguro hoje (um único produtor de `DEPOSIT`, em `CreateBookingController.js:127`). Se surgir
reemissão de PIX expirado, a reserva terá dois `DEPOSIT` e a página de polling pode mostrar o
`PENDING` velho a um hóspede que já pagou. Reiterado de 26/08.

### 🟢 [processo] Spec e histórico de sessão não acompanharam a branch

**Onde:** `docs/specs/SPEC-06-qualidade-divida-tecnica.md:99-103` · `docs/historico_sessao/*/`

Os checkboxes CA-06.5.a a d seguem desmarcados e não existe relatório de sessão desta branch em
`docs/historico_sessao/` (`grep` por "public", "leak" e "lgpd" não retorna nada) — CLAUDE.md §6 lista
o relatório como output obrigatório. A branch trouxe apenas o relatório de QA de 26/08 para dentro do
diff. Não afeta o código.

---

## O que foi verificado e está correto

Lista de cobertura da auditoria, não elogio:

- **Sem quebra de contrato nos três pontos alterados.** Os três já montavam a resposta campo a campo:
  `GetBookingStatusController.js:37-47`, `GetBillController.js:47-67`, `GetHotelController.js:14-18`.
  Nenhum campo de resposta mudou de nome, tipo ou presença.
- **`attributes` suficiente para a lógica, nos três.** `GetBillController` usa exatamente
  `id, amount, method, kind, status, paid_at` (linhas 39-41 e 63-66) — a lista cobre todos, inclusive
  o `id` necessário para o Sequelize não colapsar linhas no join triplo com `consumptions`.
  `GetBookingStatusController` usa `kind` (linha 35) e `status/amount/paid_at` (linha 44) — cobertos.
- **`resolveTenantBySubdomain` — a lista de atributos cobre 100% dos consumidores.** Verificado por
  `grep -rn "tenant\.\|tenant\["` nos quatro controllers públicos: os únicos campos lidos são `id`,
  `name`, `subdomain`, `deposit_percent` (controllers) e `status`, `booking_enabled` (guards do
  próprio resolver). `legal_id` (CNPJ) é o único campo do model deixado de fora — era o alvo. Nenhum
  `tenant.save()`/`update()` no caminho público, então instância parcial não é risco.
- **Fluxo de reserva direta sem regressão:** suíte completa `16 arquivos · 221 passam · 1 skip`, com
  os 15 testes de `public-booking.test.js` e os 7 de `bill-consumptions.test.js` verdes — incluindo
  criação → webhook → status → idempotência e "sinal PIX PENDING não conta como pago".
- **Cobertura acima do portão:** 74,05% statements · 76,4% lines · 70,96% branches · 84,02% functions
  (portão: 60/60/55/60).
- **`qa:checks` exit 0**, 3 avisos restantes, nenhum deles de include sem attributes.
- **Isolamento multi-tenant intacto:** `where: { id, tenant_id: tenant.id }` na query pública; tenant
  vem do subdomínio via util, nunca do body ou da query string. `GetBillController` usa
  `request.user.tenantId` (JWT). Nenhum `findByPk` introduzido.
- **SQL real conferido** (instrumentação do Sequelize com `logging`): o `LEFT OUTER JOIN payments`
  seleciona apenas `id, kind, status, amount, paid_at` e respeita `deleted_at IS NULL`.
- **Regras do CLAUDE.md aplicáveis ao diff:** ESM puro (sem `require`), nenhuma escrita nova
  (transação não se aplica), nenhuma rota nova (ordem de rotas inalterada), nenhum `total_amount`
  vindo do cliente, nenhum unique global novo.
- **Swagger:** os endpoints tocados já constam (`config/swagger.js:110-174`), com `200` sem schema —
  então não havia contrato tipado a quebrar. `frontend/packages/api-client/src/schema.d.ts` não
  referencia campos de payment nesses paths; nenhum consumidor em `frontend/apps`. **Nenhum impacto
  de UI/UX nesta branch** (o diff não toca frontend).
- **LGPD no diff:** nenhum campo novo coletado, nenhum `console.*` com objeto de request ou model
  inteiro, nenhuma PII em query string (o id na URL é UUID de reserva).
- **Honestidade dos commits:** `653b675` declara explicitamente que o teste passa sem a correção, e
  `3c2023f` declara que o critério anterior tinha sido cumprido pela formatação. Conferi as duas
  declarações — **ambas verdadeiras**. Declarar o desconfortável é o comportamento certo; o que falta
  é a rede de proteção, não a transparência.

## Não foi possível verificar

- **Comportamento com PSP real:** só existe o `FakePixProvider`. O dano real do 🔴 nº 2 depende de o
  `provider_charge_id` do PSP verdadeiro ser reutilizável sem assinatura — não dá para afirmar daqui.
  O 🔴 nº 1 (vazamento via `GET /payments`) independe do provider e está reproduzido.
- **Eliminação definitiva (LGPD art. 18, VI):** `PaymentModel`, `GuestModel` e demais são
  `paranoid: true` (`app/Models/PaymentModel.js:74`) e não localizei rotina de purge. Pendência de
  produto, não achado desta branch.
- **Rate limit / enumeração nas rotas `/public/:subdomain/*`:** não há middleware de throttle no
  caminho. Ids são UUIDv4 (baixo risco de adivinhação), mas não há proteção contra varredura de
  subdomínios nem teste sob carga.
- **Papéis existentes no sistema vs. `GET /payments`:** confirmei que a rota não tem `requireRole`,
  mas não mapeei exaustivamente quais papéis existem hoje em produção — a conclusão "qualquer usuário
  autenticado do tenant" vale para qualquer papel que o `authMiddleware` aceite.
