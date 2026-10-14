# QA Red Team — public-booking payment leak (T-06.5), rodada pós-merge

**Branch:** `fix/public-booking-payment-leak` (46d62fc) · **Dev:** agente executor da trilha do Gabriel · **Base:** `develop@b9e33a4` · **Data:** 16/09/2026
**Arquivos auditados:** 5 no diff + 17 lidos por contexto
**Achados no escopo:** 5 (🔴 1 · 🟡 2 · 🟢 2) · **Repassados:** 4

> ⚠️ **ALERTA FORA DO ESCOPO (financeiro):** `GET /payments` devolve o `PaymentModel` cru —
> `provider_charge_id` e `pix_qr_code` — para **qualquer usuário autenticado do tenant**, sem
> `requireRole` (`app/Controllers/PaymentApi/ListPaymentController.js:14` e
> `GetPaymentController.js:36`). Com esse id, o `POST /webhooks/pix` sem assinatura confirma
> reserva sem pagamento. Não é desta branch. Repasse em
> `docs/qa/repasses/para_gabriel_16092026.md`.

## Veredito

**APROVADO COM RESSALVAS**

O diff está correto, é seguro, não regrediu nada e o merge com `origin/develop` preservou a
correção byte a byte (verificado: `git diff origin/fix/public-booking-payment-leak HEAD` nos 4
arquivos = 0 inserções, 0 remoções, só rename de pasta). **Pode entrar em `develop`.**

O que **não** pode acontecer é marcar a T-06.5 como concluída: o **CA-06.5.b não está cumprido**.
`provider_charge_id` continua saindo sem autenticação pelo `POST /public/:subdomain/bookings`, e
o próprio teste da suíte fixa esse comportamento (`tests/public-booking.test.js:95`). Como o
defeito é anterior à branch e a correção depende de decisão conjunta com a T-06.9 (o Swagger e a
suíte dependem hoje desse campo), ele não reprova a entrega — mas fecha o caminho para dar a
tarefa por encerrada.

As três ressalvas 🟡 da auditoria de 26/08 foram atendidas: include em uma linha,
`GetBillController` com `attributes`, `resolveTenantBySubdomain` sem CNPJ.

---

## Critérios de aceite — situação

| CA | Situação | Evidência |
|---|---|---|
| **CA-06.5.a** — `attributes` explícito no include/consulta de `Payment` | ✅ cumprido | `GetBookingStatusController.js:29` e `GetBillController.js:24`; `grep -rn "as: 'payments'"` mostra exatamente esses dois consumidores, ambos com `attributes` |
| **CA-06.5.b** — `pix_qr_code`/`provider_charge_id` nunca sem autenticação | ❌ **não cumprido** | `CreateBookingController.js:158-162` devolve `pix.provider_charge_id` no 201 público |
| **CA-06.5.c** — teste garantindo ausência dos campos sensíveis na resposta pública | ⚠️ cumprido na letra | `tests/public-booking.test.js:126-143` passa; mas **passa também com a correção revertida** — verificado empiricamente |
| **CA-06.5.d** — `qa_checks.sh` sem o aviso de include sem attributes | ✅ cumprido | `bash scripts/qa_checks.sh` → exit 0, 3 avisos, nenhum deles da regra 6 |

---

## Achados no escopo

### 🔴 [segurança/financeiro — CA-06.5.b não cumprido] O endpoint público de criação de reserva ainda entrega o `provider_charge_id`

**Onde:** `services/core-service/app/Controllers/PublicBookingApi/CreateBookingController.js:158-162`
· teste que fixa o comportamento: `services/core-service/tests/public-booking.test.js:95`

**Cenário concreto (executável hoje, sem login):**

1. `POST /public/aurora/bookings` com corpo válido → `201` com
   `pix: { provider_charge_id: 'fake_…', qr_code: '…', expiration: '…' }`.
2. `POST /webhooks/pix` com `{ provider_charge_id: <o mesmo valor> }` → `200 { status: 'confirmed' }`,
   `payment.status = PAID`, reserva `CONFIRMED`, quarto bloqueado no anti-double-booking.
3. Nenhum centavo entrou.

A branch fechou a porta do `GET .../status`, mas o mesmo token sai pela porta ao lado, no mesmo
router público (`routes/apis/publicBookingRouter.js:20-21`), no mesmo módulo que a tarefa nomeia.
O hóspede precisa de `qr_code` e `expiration` para pagar; o txid não tem uso para ele.

**Por que não reprova:** não foi introduzido por este diff (está em `develop` desde a criação do
motor de reserva direta) e a auditoria de 26/08 já havia endereçado a correção à branch do
webhook. Além disso, remover o campo hoje quebra dois consumidores declarados: o
`tests/public-booking.test.js:108-116`, que simula o PSP com esse valor, e a descrição do Swagger
(`config/swagger.js:190`: *"dispare manualmente com o provider_charge_id retornado na criação da
reserva"*). É mudança de contrato, não ajuste de uma linha.

**Regra violada:** CA-06.5.b · CLAUDE.md §7 (risco financeiro) · LGPD art. 6º, III.

**Correção sugerida (a menor que resolve, junto com a T-06.9):** tirar `provider_charge_id` do
corpo do 201, fazer o teste ler o id via `PaymentModel` direto no banco e atualizar o texto do
Swagger. Repasse registrado em `docs/qa/repasses/para_gabriel_16092026.md`.

---

### 🟡 [testes/verificação] A proteção contra regressão é só um aviso — o build não reprova, e o comentário no código diz que reprova

**Onde:** `services/core-service/app/Controllers/PublicBookingApi/GetBookingStatusController.js:26-28`
· `scripts/qa_checks.sh:148-153` e `scripts/qa_checks.sh:15` · `.github/workflows/ci.yml:29-30`

**Cenário, verificado e não suposto.** Removi `attributes` da linha 29 e rodei as duas camadas:

- **Suíte:** `15 passed (15)` — inclusive o teste novo "o status público não expõe dados
  sensíveis do pagamento". Ele afere a resposta, que continua montada campo a campo nas linhas
  37-47; a query volta a carregar o QR e o txid para a memória do handler sem que nada falhe.
  (Arquivo restaurado; `git status` limpo ao fim.)
- **`qa_checks.sh`:** agora **aponta** —
  `GetBookingStatusController.js:29: include: [{ model: PaymentModel, as: 'payments' }]`.
  Essa parte melhorou de verdade em relação a 26/08: manter o include em uma linha devolveu o
  arquivo ao alcance da regra 6.
- **Mas:** a regra 6 é `report_warn`, e o script termina em `[ "$ERRORS" -eq 0 ]`
  (`scripts/qa_checks.sh:15` diz explicitamente *"WARN não reprova"*). Rodei com o `attributes`
  removido: **exit 0**. O CI (`ci.yml:30` roda o mesmo script) continua verde.

O comentário nas linhas 26-28 afirma: *"remover o `attributes` deixaria de reprovar o build"* —
o que dá ao próximo leitor a impressão de que o build reprova. Ele nunca reprovou: reprovar
exigiria `report_error`. O comentário está factualmente errado sobre o mecanismo que ele mesmo
pede para preservar.

**Regra violada:** CODING_STANDARDS / checklist de QA §8 (teste que passa com a regra quebrada) ·
comentário que descreve comportamento inexistente.

**Correção sugerida (a menor):** corrigir o texto do comentário para "vira **aviso** no
`qa:checks`" e, para proteção real, um assert de query no teste — espionar `ReservationModel.findOne`
e afirmar `include[0].attributes` — ou promover a regra 6 a `report_error` no `qa_checks.sh`
(decisão do dono do portão, o Gabriel).

---

### 🟡 [cobertura do detector] O `attributes` do `GetBillController` ficou sem nenhuma rede — o include é multilinha

**Onde:** `services/core-service/app/Controllers/ReservationApi/GetBillController.js:19-26`

**Cenário, verificado:** removi `attributes` da linha 24 (deixando
`{ model: PaymentModel,     as: 'payments' },`) e rodei `bash scripts/qa_checks.sh`: **zero**
ocorrências da regra 6. O `include: [` está na linha 19 e o item na 24; o regex da regra exige
`include:` e `model:` na **mesma linha**. Arquivo restaurado.

Ou seja: das duas correções de `attributes` desta branch, só uma tem detector. A do
`GetBillController` depende exclusivamente do comentário das linhas 21-23. É o mesmo diagnóstico
de 26/08, agora deslocado de arquivo — e a assimetria não está documentada em lugar nenhum
(o comentário do `GetBookingStatusController` explica a regra da linha única; o do
`GetBillController` não menciona que ali ela não vale).

**Regra violada:** checklist de QA §8 (feature sem proteção contra regressão).

**Correção sugerida:** colapsar o include do `GetBillController` para uma linha por item já
resolve — a regra 6 casa item a item, e a linha 24 contém `attributes` — ou tornar o regex
multilinha (`grep -Pzo`) no `qa_checks.sh`.

---

### 🟢 [teste] O contrato trava o nome da chave, não o valor do QR

**Onde:** `services/core-service/tests/public-booking.test.js:133-135`

`not.toContain('pix_qr_code')` e `not.toContain(providerChargeId)` cobrem o nome do campo e o
valor do txid. O **valor do QR** não é afirmado: um refactor que devolvesse
`{ payload: <base64 do QR> }` passaria no teste. O teste de criação já lê `res.body.pix.qr_code`
(linha 94) — guardar numa variável e acrescentar `expect(corpo).not.toContain(qrCode)` fecha em
uma linha. Ressalva já levantada em 26/08 e ainda aberta.

### 🟢 [robustez] `attributes` do status sem `id`, e `.find(kind === 'DEPOSIT')` sem ordenação

**Onde:** `services/core-service/app/Controllers/PublicBookingApi/GetBookingStatusController.js:29` e `:35`

A lista `['kind','status','amount','paid_at']` omite a PK. A auditoria de 26/08 testou a hipótese
de colapso de linhas idênticas e **descartou** (3 pagamentos, 2 idênticos, 3 objetos devolvidos) —
não repeti o experimento, aceito o resultado. Mesmo assim, incluir `id` custa zero e o dia em que
existir reemissão de PIX (dois `DEPOSIT` na mesma reserva) o `.find()` sem `order` pode mostrar o
`PENDING` velho a quem já pagou. Ordenar por `created_at DESC` no include é preventivo.

---

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🔴 | `GET /payments` devolve o `PaymentModel` cru (`provider_charge_id`, `pix_qr_code`) a qualquer usuário autenticado, sem `requireRole` | `app/Controllers/PaymentApi/ListPaymentController.js:14` · `GetPaymentController.js:36` | Gabriel (T-06.9) | `docs/qa/repasses/para_gabriel_16092026.md` |
| 🔴 | `provider_charge_id` no 201 público de criação de reserva (mesmo achado do escopo, registrado para a T-06.9) | `app/Controllers/PublicBookingApi/CreateBookingController.js:158-162` | Gabriel (T-06.9) | `docs/qa/repasses/para_gabriel_16092026.md` |
| 🟡 | Webhook PIX busca pagamento sem `tenant_id` e sem unique de `provider_charge_id` | `app/Controllers/WebhookApi/PixWebhookController.js:26` | Gabriel (T-06.9) | `docs/qa/repasses/para_gabriel_16092026.md` |
| 🟡 | `include` de `CorporateClientModel` sem `attributes` devolve CPF/RG do representante | `app/Controllers/ContractApi/GetContractController.js:12,17` (+4 arquivos) | **DONO INDEFINIDO** (backend B2B não está na §7) | `docs/qa/repasses/para_indefinido_16092026.md` |

**Fora do escopo por decisão do solicitante:** ausência de assinatura no `POST /webhooks/pix`
(T-06.9). Citado acima só como elo do cenário de dano; não pesa no veredito.

---

## O que foi verificado e está correto

Cobertura da auditoria, não elogio.

- **Merge não tocou na lógica:** `git diff -M origin/fix/public-booking-payment-leak HEAD` nos 4
  arquivos de código/teste → `4 files changed, 0 insertions(+), 0 deletions(-)`, puro rename
  `app/ → services/core-service/app/`. `git merge-base origin/develop HEAD` == tip de `develop`,
  então o diff de três pontos é o diff real.
- **Escopo real do diff:** 5 arquivos, nenhum fora das áreas declaradas; nenhuma rota nova,
  nenhuma escrita nova, nenhuma migração.
- **`attributes` suficiente para a lógica:** `GetBookingStatusController` usa só
  `kind/status/amount/paid_at` (linhas 35, 44); `GetBillController` usa exatamente
  `id/amount/method/kind/status/paid_at` (linhas 39-41 e 63-66). Nenhum campo consumido ficou de
  fora — suíte completa verde confirma.
- **Contrato de resposta intacto:** os corpos de `/status` e de `/:id/bill` são montados campo a
  campo e não mudaram. `tests/bill-consumptions.test.js` (fechamento de conta) e os 4 testes do
  fluxo público de reserva passam sem alteração de expectativa.
- **`resolveTenantBySubdomain` com minimização correta:** `grep` dos campos usados pelos 4
  controllers públicos + `getAvailableCategories` devolve exatamente
  `id`, `name`, `subdomain`, `deposit_percent` — mais `status` e `booking_enabled`, lidos pelos
  guards das linhas 27 e 31. O `legal_id` (CNPJ, `TenantModel.js:21`) deixou de sair do banco em
  request sem autenticação. Não há nenhum outro consumidor do util (`grep -rn` em `app/`,
  `routes/`, `tests/`).
- **Nenhum outro include de model sensível sem `attributes` em código público:** `grep -rn`
  por `model: (UserModel|GuestModel|PaymentModel|CorporateClientModel|ContractModel)` — os dois
  de `payments` estão corrigidos; os demais estão em controllers **autenticados**
  (ContractApi, EventQuoteApi, `GetReservationController.js:14`) e foram repassados.
- **`bash scripts/qa_checks.sh` na raiz do worktree:** exit 0, 3 avisos — Swagger
  (falsos positivos conhecidos de `public-booking` e `room-category`, reais para `contract`,
  `corporate-client`, `event-quote`), `<button>` cru em `GuestsListPage.tsx` e bloco de classes
  repetido no frontend. **Nenhum** aviso "include de model com dado sensível, sem attributes".
- **Detector volta a enxergar o arquivo corrigido:** removi o `attributes` e o `qa_checks.sh`
  passou a apontar a linha 29 — regressão ao menos fica visível no log do CI (ressalva 🟡 sobre
  ser só aviso).
- **Suíte completa:** `17 arquivos · 227 passam · 1 skip`, com o Postgres em 127.0.0.1:55433.
- **Cobertura:** 74,39% statements · 76,76% lines · 71,29% branches · 83,42% functions — acima do
  portão de 60% do CI.
- **Regras do CLAUDE.md aplicáveis ao diff:** ESM puro (sem `require`), sem `findByPk`, sem
  gravação (transação não se aplica), ordem de rotas inalterada, `total_amount` calculado no
  servidor, isolamento multi-tenant preservado (`where: { id, tenant_id: tenant.id }`,
  `GetBookingStatusController.js:20`; `tenant_id: tenantId` vindo de `request.user`,
  `GetBillController.js:15`).
- **LGPD no diff:** nenhum campo novo coletado, nenhum `console.*` com objeto de request ou model
  inteiro, nenhum PII em query string, e o diff **reduz** dado trafegado em três pontos.
- **Documento da auditoria anterior** (`docs/qa/redteam_public-booking-leak_26ago2026.md`) é
  adição de documentação, sem efeito em runtime.

## Não foi possível verificar

- **Se a exposição de `provider_charge_id` no 201 público é decisão consciente** para o provider
  simulado. O Swagger e a suíte dependem dela, o que sugere que sim, mas não há ADR nem nota na
  SPEC-06 registrando o trade-off. Para confirmar, faltaria uma decisão escrita do dono da T-06.9.
- **Comportamento com PSP real:** só existe `FakePixProvider`. O quanto um `provider_charge_id`
  real é adivinhável ou reutilizável não dá para afirmar daqui.
- **Eliminação definitiva (LGPD art. 18, VI):** `PaymentModel` e `CorporateClientModel` são
  `paranoid: true` e não localizei rotina de purge. Pendência de produto (T-06.11, trilha do
  Sirlande), não achado desta branch.
- **Rate limit no caminho `/public/:subdomain/*`:** continua sem throttle. Os ids são UUIDv4, o
  que torna a enumeração cara, mas não testei sob carga nem existe proteção contra varredura de
  subdomínios.
