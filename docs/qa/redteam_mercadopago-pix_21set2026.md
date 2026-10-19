# QA Red Team — Integração Mercado Pago PIX (T-03.2 / SPEC-03)

**Branch:** `feature/mercadopago-pix` (c8018e1) · **Dev:** Weslley (dono da SPEC-03, §1 da divisão de trabalho) ·
**Base:** `develop@9ae6c87` · **Data:** 21/09/2026
**Arquivos auditados:** 9 no diff + 14 lidos por contexto (models, schema.sql, swagger, routers, suíte)
**Achados no escopo:** 12 (🔴 1 · 🟡 7 · 🟢 4) · **Repassados:** 3

## Veredito

**REPROVADO**

Um achado 🔴 dentro do escopo, **reproduzido com sonda executável**: o webhook marca o pagamento
como `PAID` e promove a reserva `PENDING → CONFIRMED` a partir de uma notificação **autêntica do
Mercado Pago que informa um pagamento não aprovado**. A assinatura é validada corretamente — o que
não é validado é se alguém pagou. O código nunca lê o `status` do pagamento, nem no corpo da
notificação nem consultando a API do provedor. Com `PIX_PROVIDER=mercadopago` isso significa reserva
confirmada sem dinheiro, no endpoint público, para todo mundo.

O resto da entrega é sólido: contrato respeitado, HMAC com `timingSafeEqual`, ESM puro, valor sempre
calculado no servidor, suíte inteira verde (237 passam · 1 skip) e cobertura acima do portão. O
defeito é de **um conceito**, não de execução — e é exatamente o conceito que a tarefa existia para
entregar (CA-03.2.d).

A mudança arquitetural do commit `2d6d8a8` (cobrança fora da transação) **não** deixa `Payment`
inconsistente no banco — CA-03.2.i se sustenta do lado de cá. Mas ela criou um efeito colateral novo,
também reproduzido: cobrança viva no PSP sem nenhuma linha no banco quando a transação falha
(🟡 nº 2).

---

## Critérios de aceite — verificação item a item

| CA | Status | Evidência |
|---|---|---|
| **CA-03.2.a** — implementa o contrato `PixProvider` | ✅ **Cumprido** | `MercadoPagoPixProvider extends PixProvider`, assina `createCharge` e `verifyWebhook` com o mesmo retorno (`MercadoPagoPixProvider.js:16,77`). O contrato foi **estendido**, não reinventado (`PixProvider.js:22-30`). |
| **CA-03.2.b** — selecionável por `PIX_PROVIDER=mercadopago` | ✅ **Cumprido** (verificado em execução) | `PIX_PROVIDER=mercadopago node -e "…"` → `MercadoPagoPixProvider`. Sem env → `FakePixProvider`. **Mas**: `PIX_PROVIDER=mercadopagoo` (typo) → `FakePixProvider`, em silêncio (🟡 nº 4). |
| **CA-03.2.c** — cobrança real no sandbox, QR e copia-e-cola válidos | ❌ **Sem evidência** | Nenhum print, log de sandbox, relatório de sessão ou anotação na SPEC. O único QR exercitado é `'00020126...copia-e-cola'`, string inventada no mock (`tests/mercadopago-pix.test.js:44`). Não é possível afirmar que a integração já produziu um BR Code válido. |
| **CA-03.2.d** — webhook processa notificação real do provedor | ❌ **Não cumprido** | Processa **qualquer** notificação assinada como "pago", inclusive de pagamento `pending`, `cancelled`, `rejected` ou `expired`. Reproduzido — ver 🔴 nº 1. |
| **CA-03.2.e** — validação de autenticidade, não confiar em POST anônimo | ⚠️ **Cumprido para `mercadopago`, falso no default** | HMAC-SHA256 sobre o manifesto `id:…;request-id:…;ts:…;` com `crypto.timingSafeEqual` (`MercadoPagoPixProvider.js:100-107`) — correto. Mas o provider **padrão** (`fake`) continua aceitando POST anônimo (`FakePixProvider.js:35-37`), e o default é o que roda hoje em dev, staging e demo. |
| **CA-03.2.f** — fake permanece e é o padrão em teste | ✅ **Cumprido** | `PROVIDERS.fake` intacto, default do factory inalterado, nenhum teste altera `PIX_PROVIDER`. |
| **CA-03.2.g** — `public-booking.test.js` continua passando | ✅ **Cumprido** (executado) | 18 arquivos · **237 passam · 1 skip**, incluindo os 15 de `public-booking.test.js` (criação → webhook → status → idempotência). Postgres 17 em container temporário, Node 22. |
| **CA-03.2.h** — credenciais por env, `.env.example` atualizado | ⚠️ **Parcial** | `.env.example:25-31` documenta `PIX_PROVIDER`, `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET`, com aviso de sandbox. Mas `infra/k8s/configmap.yaml` e `infra/k8s/secret.yaml` **não** receberam nenhuma das três — um deploy no cluster cai no fake sem avisar (🟡 nº 4). E a credencial é única e global para todos os tenants (🟡 nº 5). |
| **CA-03.2.i** — falha do provedor não deixa `Payment` inconsistente | ⚠️ **Cumprido no banco, quebrado no PSP** | `PixProviderUnavailableError` → **503** antes de abrir transação, sem escrita nenhuma (`CreateBookingController.js:97-102`) — correto, e melhor que o desenho anterior. O que ficou sem rede é o inverso: cobrança criada no PSP e transação falhando depois (🟡 nº 2, reproduzido). |

---

## Achados no escopo

### 🔴 [segurança / financeiro] O webhook confirma pagamento que ninguém pagou — assinatura válida ≠ pagamento aprovado

**Onde:** `services/core-service/app/Controllers/WebhookApi/PixWebhookController.js:50-52` ·
`services/core-service/app/services/pix/MercadoPagoPixProvider.js:77-110`

**Cenário — reproduzido**, não deduzido. Sonda criada, executada e removida (worktree descartada,
`git status` limpo ao fim). Com `PIX_PROVIDER=mercadopago` e `fetch` mockado:

1. `POST /public/:subdomain/bookings` → cobrança PIX criada no MP (`id: 111222333`, `status: "pending"` — ninguém pagou nada), reserva `PENDING`, `Payment` `PENDING`.
2. Notificação **assinada com o `MERCADOPAGO_WEBHOOK_SECRET` correto**, no formato real do MP:
   `POST /webhooks/pix?data.id=111222333&type=payment`, header `x-signature: ts=…,v1=<hmac válido>`,
   corpo `{"action":"payment.created","type":"payment","data":{"id":"111222333"}}`.
3. Saída real da sonda:

```
SONDA webhook status: 200 {"status":"confirmed", … ,"reservation_status":"CONFIRMED"}
SONDA payment.status: PAID | reservation.status: CONFIRMED
SONDA payment.provider: mercadopago
(fetch chamado 1 vez — apenas a criação da cobrança; nenhuma consulta de status ao MP)
```

`verifyWebhook` devolve **só** `{ providerChargeId }` e o controller aplica `payment.status = 'PAID'`
incondicionalmente. Nem o `status` do corpo é lido, nem existe `GET /v1/payments/{id}` em lugar
nenhum do repositório — confirmado por `git grep -n "approved" feature/mercadopago-pix`: **zero
ocorrências** em `app/` e `tests/`.

Consequências, em ordem de dano:

- O Mercado Pago dispara notificação na **criação** do pagamento (`action: payment.created`), não só
  na aprovação. Nesse desenho, toda reserva direta é confirmada segundos depois de criada, sem sinal
  pago. O hóspede se hospeda; o hotel descobre no check-out.
- Notificação de `payment.updated` com status `cancelled`, `rejected` ou `expired` — que é
  **garantidamente** enviada pelo MP — também vira `PAID` + `CONFIRMED`. Este ponto não depende de
  interpretação da documentação do MP: o código não lê status algum.
- O mesmo buraco cancela o valor de operação do `status` `EXPIRED` do `PaymentModel`, que a própria
  SPEC-03 lembra que já existia pronto para ser usado.

**Regra violada:** CA-03.2.d · CLAUDE.md §7 (risco financeiro) · fail-safe (aceita por ausência de
prova, em vez de exigir prova).

**Correção sugerida (a menor que resolve):** `verifyWebhook` continua validando a assinatura e
devolvendo o id; o provider ganha um `getChargeStatus(providerChargeId)` que faz
`GET /v1/payments/{id}` com o access token e o controller só promove quando `status === 'approved'` **e**
`transaction_amount` bate com `payment.amount`. Qualquer outro status: `200` sem efeito (o MP precisa
de 200 para parar de reenviar), com `EXPIRED`/`FAILED` gravados quando o provedor disser isso. O fake
implementa `getChargeStatus` devolvendo `approved` e a suíte atual continua verde.

---

### 🟡 [financeiro / atomicidade] Cobrança viva no PSP sem nenhuma linha no banco — efeito colateral do commit `2d6d8a8`

**Onde:** `services/core-service/app/Controllers/PublicBookingApi/CreateBookingController.js:86-102`
(cobrança) → `:105-157` (transação)

**Cenário — reproduzido.** Outro canal fecha o último quarto **durante** a chamada de rede ao MP (a
janela que a mudança abriu: até 10 s de `TIMEOUT_MS` entre o `checkReservationConflict` e o `INSERT`):

```
SONDA status da resposta: 500 {"error":"Erro interno do servidor"}
SONDA fetch chamado: 1 vez(es) — cobrança existe no MP
SONDA Payment no banco: null
```

O `INSERT` bate na `EXCLUDE reservations_room_id_daterange_excl` (`db/schema.sql:132-135`), a
transação faz rollback — o banco fica **consistente**, CA-03.2.i preservado — e a cobrança criada no
Mercado Pago fica órfã: sem `Payment`, sem reserva, sem cancelamento, sem reconciliação. Se ela for
paga, o webhook responde **404 "Cobrança não encontrada"** e o dinheiro entra sem destino conhecido.

Comparação honesta com `develop`: lá a ordem era `reservation.create` → `pivô` → `createCharge` →
`payment.create` **dentro** da transação. A mesma corrida estourava na `EXCLUDE` **antes** de existir
cobrança. Ou seja, o commit trocou "transação segurando chamada de rede" (problema real, que valia
corrigir) por "cobrança sem compensação" — não é um empate, é um risco diferente que precisa de rede.

Efeito secundário no mesmo caminho: o hóspede que perdeu a corrida recebe **500 "Erro interno do
servidor"** em vez do **409 "Sem disponibilidade"** que o endpoint já sabe devolver.

`SUSPEITA` — não verificável daqui: se o Mercado Pago envia o copia-e-cola por e-mail ao `payer.email`
(que passamos com o e-mail real do hóspede), a cobrança órfã se torna pagável pelo hóspede e o achado
vira 🔴. Confirmar no sandbox antes de decidir a prioridade.

**Regra violada:** CLAUDE.md §7 (risco financeiro) · compensação ausente em operação distribuída.

**Correção sugerida:** tratar `SequelizeExclusionConstraintError`/`UniqueConstraintError` no `catch`
da transação → responder **409** e chamar uma compensação no provider
(`PUT /v1/payments/{id}` com `status: cancelled`, exposto como `cancelCharge` no contrato
`PixProvider`; o fake vira no-op). Alternativa mais simples e também aceitável: gravar o `Payment`
`PENDING` **antes** de falar com o PSP e atualizar depois — aí a órfã nunca é invisível.

---

### 🟡 [segurança] Notificação sem verificação de tópico e sem janela de validade do `ts`

**Onde:** `services/core-service/app/services/pix/MercadoPagoPixProvider.js:78-110`

**Cenário 1 — tópico:** o código aceita qualquer notificação assinada e usa `data.id` como id de
cobrança, sem olhar `type`/`action`. O MP envia notificações de outros tópicos (`merchant_order`,
`subscription`, `point_integration_wh`) pela mesma URL se o painel estiver configurado assim, e o
`data.id` desses tópicos vem de **sequências diferentes** da de pagamentos. Um `merchant_order` com id
numérico que coincida com um `provider_charge_id` gravado marca o pagamento errado como pago. Baixa
probabilidade, custo de defesa: uma linha.

**Cenário 2 — replay:** `ts` entra no manifesto mas nunca é comparado com o relógio. Uma notificação
capturada (log de proxy, log de aplicação do PSP, histórico do painel) é replayável para sempre. Hoje
o dano é contido pela idempotência do `PAID` (`PixWebhookController.js:44-46`), mas a contenção some
no momento em que existir reemissão de cobrança ou tratamento de `EXPIRED` — e some totalmente se a
correção do 🔴 nº 1 não incluir frescor.

**Regra violada:** fail-safe · RNF-012 (assinatura verificada em 100% dos webhooks) no espírito.

**Correção sugerida:** `if (request.body?.type && request.body.type !== 'payment') → ignora com 200`
e rejeitar `ts` fora de uma janela (±5 min é o usual).

---

### 🟡 [configuração / fail-open] Typo em `PIX_PROVIDER` cai no fake em silêncio, e o campo `provider` grava a env crua

**Onde:** `services/core-service/app/services/pix/index.js:22-24` (linha **pré-existente em
`develop`**, mas que esta branch torna crítica ao registrar um provider real) ·
`services/core-service/app/Controllers/PublicBookingApi/CreateBookingController.js:150` ·
`infra/k8s/configmap.yaml`, `infra/k8s/secret.yaml` (sem as três variáveis novas)

**Cenário — verificado em execução:**

```
PIX_PROVIDER=mercadopago  -> MercadoPagoPixProvider
PIX_PROVIDER=mercadopagoo -> FakePixProvider      (silencioso)
(sem env)                 -> FakePixProvider
```

`PROVIDERS[key] || FakePixProvider` é blocklist invertida: qualquer valor desconhecido — typo,
variável não propagada no ConfigMap, `PIX_PROVIDER` esquecida no deploy — devolve o simulado. Em
produção isso é: QR falso entregue ao hóspede (que não consegue pagar) **e** webhook aceitando POST
anônimo (`FakePixProvider.js:35-37`), ou seja, reserva confirmável de graça por quem descobrir a URL.

Agravante de auditoria: `provider: process.env.PIX_PROVIDER || 'fake'` grava a env **crua**, não o
provider efetivamente instanciado. Com o typo acima, o `Payment` diz `mercadopagoo` enquanto quem
gerou a cobrança foi o fake — a trilha financeira mente.

**Regra violada:** CLAUDE.md §7 (allowlist, fail-safe) · CA-03.2.h (credenciais chegarem ao ambiente).

**Correção sugerida:** `if (!PROVIDERS[key]) throw new Error(...)` no boot (falhar alto é o
comportamento certo para configuração de dinheiro) e gravar
`provider: pix.constructor.name` ou a chave resolvida, não a env. E acrescentar
`PIX_PROVIDER` ao `configmap.yaml` e os dois segredos ao `secret.yaml`.

---

### 🟡 [arquitetura multi-tenant / financeiro] Uma única credencial do Mercado Pago para todos os hotéis

**Onde:** `services/core-service/app/services/pix/MercadoPagoPixProvider.js:18-21` ·
`.env.example:29-31`

**Cenário:** `MERCADOPAGO_ACCESS_TOKEN` é global do processo. O sinal cobrado pelo Hotel Aurora e o
sinal cobrado pelo Hotel Bela Vista caem na **mesma conta Mercado Pago** — a de quem operar o SaaS. O
produto é multi-tenant e o dinheiro é do hotel; não há `tenant_id` na seleção de credencial, nem
campo de credencial em `tenants`, nem *split payment*, nem ADR registrando a escolha (T-03.3 segue
🔲).

Para sandbox/TCC isso é aceitável. O que não é aceitável é ficar **implícito**: ninguém lendo o código
descobre que existe essa decisão. E ela tem consequência técnica imediata no achado repassado a
Sirlande (ids de cobrança do MP são únicos por conta coletora, não globalmente — credencial por
tenant + `provider_charge_id` sem unique vira colisão cross-tenant).

**Regra violada:** CLAUDE.md §3 (multi-tenancy) · SPEC-03 T-03.3 (ADR).

**Correção sugerida:** nada de código agora — registrar explicitamente no ADR da T-03.3 como
limitação conhecida, com o caminho (credencial por tenant em `tenant_settings`) e o pré-requisito
(unique de `provider_charge_id` composto com `tenant_id`).

---

### 🟡 [testes] Nenhum teste toca o caminho novo ponta a ponta — o 🔴 nº 1 passa por toda a suíte

**Onde:** `services/core-service/tests/mercadopago-pix.test.js` (9 testes, só unitários do provider) ·
`services/core-service/tests/public-booking.test.js` (não alterado, roda só com o fake)

Os 9 testes novos são bons no que cobrem: sem token → 503, fetch rejeitado → 503, não-2xx → 503, sem
QR → 503, assinatura válida/adulterada/ausente. Sem rede, `vi.stubGlobal('fetch')` — CA-03.2.f e o
"sem rede" da Definition of Done estão atendidos.

O que **nenhum** teste exercita:

- `PixWebhookController` com o provider real ativo → o 401 novo (`:28-30`) nunca roda em teste;
  cobertura do diretório `WebhookApi` ficou em **75% de linhas**.
- `CreateBookingController` devolvendo **503** quando o PSP cai (`:97-102`).
- O factory selecionando `mercadopago` (CA-03.2.b não tem teste, só a minha verificação manual).
- O cenário que quebra o dinheiro: notificação autêntica de pagamento **não aprovado**. Minha sonda
  provou que ele passa — e passaria em qualquer revisão baseada só na suíte.

**Regra violada:** CLAUDE.md §9 · "teste que passaria mesmo com a regra de negócio quebrada".

**Correção sugerida:** um `tests/mercadopago-webhook.test.js` de integração com
`process.env.PIX_PROVIDER='mercadopago'` cobrindo: assinatura inválida → 401 **e estado intacto**;
assinatura válida + pagamento aprovado → `PAID`/`CONFIRMED`; assinatura válida + pagamento `pending`
→ **sem efeito**. O terceiro é o que falha hoje — e é o que vale.

---

### 🟡 [contrato de API] O contrato de `POST /webhooks/pix` mudou e o Swagger não sabe

**Onde:** `services/core-service/config/swagger.js:186-199` (inalterado pela branch) ·
`PixWebhookController.js:28-30` · `CreateBookingController.js:99`

O Swagger declara o webhook com corpo obrigatório `{ provider_charge_id }` e respostas `200/400/404`.
Depois desta branch, com `PIX_PROVIDER=mercadopago`, o corpo documentado é **ignorado** (o id vem de
`?data.id=` ou de `body.data.id`), há dois headers obrigatórios não documentados (`x-signature`,
`x-request-id`) e existe um **401** novo. `POST /public/:subdomain/bookings` também ganhou um **503**
não documentado.

Atenuante real: `swagger.js` está congelado por §7 da divisão de trabalho ("a T-06.2 reescreve o
arquivo inteiro: uma pessoa, uma vez, e ninguém encosta durante") — não encostar foi a decisão certa.
O problema é o silêncio: nada no diff, na SPEC-03 ou em relatório de sessão avisa a T-06.2 do que
mudou. Repassado a Gabriel.

**Regra violada:** CLAUDE.md §7 (endpoint/contrato fora do Swagger quebra o cliente tipado).

**Correção sugerida:** uma linha na SPEC-03 (ou no relatório de sessão) listando o delta de contrato
para a T-06.2 absorver. O repasse já está gravado.

---

### 🟡 [LGPD art. 6º, III] CPF do hóspede passa a ser enviado ao Mercado Pago sem decisão registrada e sem validação

**Onde:** `services/core-service/app/Controllers/PublicBookingApi/CreateBookingController.js:95` ·
`services/core-service/app/services/pix/MercadoPagoPixProvider.js:28-31`

**Cenário:** o CPF é **opcional** no formulário público (`swagger.js:161`, `guest.cpf`), mas quando
vem, é normalizado e transmitido a um terceiro. Corpo real capturado na sonda:

```json
{"transaction_amount":90,"description":"Sinal reserva Hotel Sonda MP","payment_method_id":"pix",
 "date_of_expiration":"…","payer":{"email":"maria.sonda@example.com","first_name":"Hospede",
 "last_name":"Reserva","identification":{"type":"CPF","number":"39053344705"}}}
```

Três observações, em ordem:

1. **Nenhum documento do repositório registra esse compartilhamento.** O ADR da T-03.3 está 🔲, não há
   relatório de sessão e a SPEC-03 não foi atualizada. Compartilhamento de CPF com operador de
   pagamento é legítimo — precisa é estar **escrito** (art. 6º, VI, transparência).
2. **`onlyDigits` não valida.** `guest.cpf = "abc"` → `null` → sem identificação; `"111"` → enviado.
   Um CPF malformado provavelmente vira 400 no MP → `PixProviderUnavailableError` → **503 "Serviço de
   pagamento indisponível"** para o hóspede, mensagem que não diz o que fazer e culpa o provedor por
   erro de digitação do usuário.
3. **Ponto a favor, registrado por honestidade:** `first_name: 'Hospede'`, `last_name: 'Reserva'`
   fixos — o nome real do hóspede **não** é enviado. É minimização de verdade e deve continuar assim.

**Correção sugerida:** validar CPF (11 dígitos) antes de enviar, com **400** e mensagem acionável em
vez de 503; e registrar o fluxo de dados no ADR da T-03.3.

---

### 🟢 [robustez] `catch {}` sem binding engole erro de programação como indisponibilidade do PSP

**Onde:** `services/core-service/app/services/pix/MercadoPagoPixProvider.js:60-62`

Qualquer `TypeError` dentro do bloco do `fetch` (um `JSON.stringify` com referência circular, por
exemplo) vira `PixProviderUnavailableError` → **503 "Serviço de pagamento indisponível"** e o erro
real desaparece: não é logado, não é rastreável. Custa uma linha manter o diagnóstico
(`catch (error) { console.error('MercadoPagoPixProvider.createCharge:', error.name, error.message); throw new PixProviderUnavailableError(...) }` — sem imprimir o objeto inteiro, que carrega o corpo com CPF).

### 🟢 [robustez] `pix_expiration` é o relógio local, não o que o MP devolveu

**Onde:** `MercadoPagoPixProvider.js:24` e `:71-74`

`expiration` é calculado antes da chamada e devolvido **sem confronto** com o `date_of_expiration` da
resposta. Se o MP ajustar a validade, o banco guarda uma data que não é a verdadeira e a tela de
polling do hóspede expira em hora errada. `data.point_of_interaction.transaction_data` traz o valor
efetivo — usar o do provedor quando existir.

### 🟢 [SUSPEITA — integração] `date_of_expiration` exatamente no limite mínimo do Mercado Pago

**Onde:** `MercadoPagoPixProvider.js:17` (`expiresInMinutes = 30`)

O MP documenta janela mínima de 30 minutos para expiração de PIX. O valor é calculado **antes** do
`fetch`; latência de rede e desvio de relógio fazem o instante avaliado no lado do MP cair alguns
segundos **abaixo** do mínimo, o que pode virar 400 → 503 para o hóspede. Não consigo confirmar sem o
sandbox — e a ausência de prova de cobrança real (CA-03.2.c) é justamente o que deixa isso em aberto.
Margem de 35 min custa um caractere.

### 🟢 [processo] Sem relatório de sessão, sem SPEC atualizada, sem ADR

**Onde:** `docs/historico_sessao/weslley/` (nada sobre Mercado Pago) ·
`docs/specs/SPEC-03-integracoes-externas.md:92-107` (T-03.2 🔲, todos os CA desmarcados)

CLAUDE.md §6 lista o relatório de sessão como output obrigatório; §8 da divisão de trabalho manda
atualizar a Spec, não o relatório. A T-03.3 (ADR) depende da T-03.2 e é onde as decisões de credencial
global, de dados enviados ao PSP e de estratégia de teste sem rede deveriam estar.

---

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | `payments.provider_charge_id` sem índice e sem unique — webhook faz *full scan* e não há garantia de unicidade (vira colisão cross-tenant no dia em que a credencial do PSP for por tenant) | `services/core-service/db/schema.sql:165` · `app/Models/PaymentModel.js:50-53` | Sirlande (§7: dono de `schema.sql` e `Models/`) | `docs/qa/repasses/para_sirlande_21092026.md` |
| 🔴 | T-06.9 continua aberta: o provider **padrão** (`fake`) não assina nada e o webhook segue forjável por POST anônimo — e o comentário novo em `PixWebhookController` sugere o contrário | `app/services/pix/FakePixProvider.js:35-37` · `PixWebhookController.js:18-20` | Gabriel (T-06.9) | `docs/qa/repasses/para_gabriel_21092026.md` |
| 🟡 | Delta de contrato de `/webhooks/pix` (headers `x-signature`/`x-request-id`, `?data.id`, **401**) e o **503** novo em `POST /public/:subdomain/bookings` precisam entrar na reescrita da T-06.2 | `config/swagger.js:144-199` | Gabriel (T-06.2, §7: arquivo congelado) | `docs/qa/repasses/para_gabriel_21092026.md` |

Nota sobre o 🔴 repassado: ele é **pré-existente**, já está registrado na SPEC-06 (T-06.9) e não é
introduzido por esta branch — não entra no veredito. Registro aqui porque esta branch **muda a
avaliação dele**: com `PIX_PROVIDER=mercadopago` o webhook deixa de ser forjável por anônimo (mérito
real da entrega), enquanto com o default `fake` nada mudou. Meio caminho é pior que caminho nenhum se
alguém ler o comentário novo e achar que a T-06.9 foi resolvida.

---

## O que foi verificado e está correto

Lista de cobertura da auditoria, não elogio:

- **Suíte completa verde na branch:** 18 arquivos · **237 passam · 1 skip** (Postgres 17 em container
  temporário, Node 22.22). `public-booking.test.js` 15/15 — CA-03.2.g confirmado por execução, não por
  alegação.
- **Cobertura acima do portão:** 74,59% statements · 76,95% lines · 71,63% branches · 82,87% functions
  (portão 60/60/55/60). `app/services/pix` em 91,52% statements.
- **`bash scripts/qa_checks.sh` → exit 0**, 3 avisos, **nenhum** deles introduzido por esta branch.
- **ESM puro:** nenhum `require()` nos 9 arquivos do diff (`crypto` importado por `import`).
- **Valor sempre do servidor:** `transaction_amount: Number(amount)` vem de `depositAmount`, calculado
  em `CreateBookingController.js:79` a partir de `category.price_per_night` e `tenant.deposit_percent`.
  Nada financeiro vindo do corpo da requisição — verificado na sonda (`transaction_amount: 90` para
  2 × 150 × 30%).
- **Isolamento multi-tenant nos pontos tocados:** categoria, quartos e hóspede filtram por
  `tenant.id`; o tenant vem do subdomínio, nunca do corpo. A reserva do webhook é buscada com
  `{ id, tenant_id: payment.tenant_id }` (`PixWebhookController.js:55`). Nenhum `findByPk` introduzido
  no diff. A busca do `Payment` por `provider_charge_id` sem `tenant_id` é segura **hoje** (id do PSP
  globalmente único com credencial única) — a condição que a quebra está no repasse à Sirlande.
- **Máquina de estados respeitada:** o webhook só promove `PENDING → CONFIRMED` (allowlist), não toca
  `CHECKED_IN`/`CANCELLED`, e a idempotência de `PAID` foi preservada com teste verde.
- **Transação nos dois pontos que escrevem em 2+ tabelas:** booking (guest + reservation + pivô +
  payment) e webhook (payment + reservation), ambos com `rollback` no `catch`.
- **Inversão de dependência seguida, não reinventada:** o controller depende de `PixProvider` e de
  erros tipados (`errors.js`), nunca do Mercado Pago. `errors.js` espelha
  `app/services/address/errors.js`, como o comentário afirma — conferido.
- **PII: nenhum `console.*` novo com objeto de request, model ou corpo de cobrança.** O CPF vai para o
  MP, não para o log. Nenhum dado pessoal em query string nos caminhos novos.
- **Nenhum campo novo coletado** (o `PaymentModel` já tinha tudo — a SPEC pedia usar, e foi o que se
  fez; nenhuma migração, nenhuma coluna nova).
- **Sem impacto de frontend:** `grep -rn "qr_code" frontend/` fora de `node_modules` → **zero**
  ocorrências. Nenhum consumidor tipado a quebrar, nenhum item de UI/UX aplicável a este diff.
- **`timingSafeEqual` com comparação de comprimento antes** (`MercadoPagoPixProvider.js:104-106`) —
  evita o `RangeError` que a API lança com buffers de tamanhos diferentes. Detalhe fácil de errar,
  feito certo.
- **Timeout com `AbortController` e `clearTimeout` no `finally`** — o `TIMEOUT_MS` de 10 s existe e
  funciona (teste do fetch rejeitado passa). Ressalva menor: o timeout não cobre a leitura do corpo
  (`response.json()` acontece depois do `clearTimeout`).
- **Honestidade dos comentários no diff:** conferi um a um. O de `CreateBookingController.js:81-85`
  descreve corretamente o motivo da mudança e o que acontece em caso de falha **até** o ponto do
  commit; o que ele não diz é o que acontece depois (🟡 nº 2). O de `PixWebhookController.js:18-20`
  é o único que afirma mais do que entrega — "nunca confia em POST anônimo" é falso com o provider
  padrão.

## Não foi possível verificar

- **Comportamento real do Mercado Pago em sandbox.** Sem credencial no ambiente, toda a auditoria da
  integração externa é sobre o código e o mock. Três pontos dependem disso: se o MP notifica em
  `payment.created` (agrava o 🔴 nº 1 de "grave" para "toda reserva"); se o MP envia o copia-e-cola
  por e-mail ao pagador (eleva o 🟡 nº 2 a 🔴); e se `date_of_expiration` de exatos 30 min é aceito.
  O núcleo do 🔴 nº 1 — status nunca verificado — **não** depende de nenhuma dessas respostas.
- **Formato do manifesto de assinatura em ids alfanuméricos.** O MP exige `data.id` em minúsculas no
  manifesto quando alfanumérico; ids de pagamento são numéricos, então não afeta hoje.
- **Fluxo com credenciais por tenant:** não existe no código; a análise de colisão de
  `provider_charge_id` é projeção documentada, não reprodução.
- **Eliminação definitiva (LGPD art. 18, VI):** `PaymentModel` segue `paranoid` e a cobrança guarda
  `pix_qr_code` e `provider_charge_id` para sempre. Pendência de produto já registrada na T-06.11,
  fora do escopo desta branch.
