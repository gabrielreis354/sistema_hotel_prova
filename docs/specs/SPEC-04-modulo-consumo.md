# SPEC-04 — Módulo de Consumo (Comanda)

**Prioridade:** 🟠 Alta — diferencial de produto
**Estado:** 🟡 Parcialmente implementado — **2 de 9 fatias concluídas**
**Criado em:** 26/08/2026
**Bloqueia:** SPEC-05 Fase 2 (comanda no frontend)

---

## 1. Contexto

Módulo que dá ao sistema a capacidade de registrar consumo de bar e restaurante, cobrindo cenários que o vínculo rígido *"consumo pertence a uma reserva"* não comporta.

**Esta Spec substitui** o plano em `docs/historico_sessao/gabriel/planejamento_modulo_consumo_02ago2026.md`, cuja tabela de status está **desatualizada** — marca as 9 fatias como pendentes, quando 2 já estão em produção.

### 1.1 Estado real, verificado no código em 26/08

| Fatia | Plano dizia | **Realidade verificada** |
|-------|-------------|--------------------------|
| 0 — Pré-requisitos (CORS, filtro de datas, `WAITER`) | 🔲 Pendente | ✅ **Mergeada** em `313ed71` |
| 1 — Catálogo de Produtos | 🔲 Pendente | ✅ **Mergeada** — `ProductModel`, `ProductApi`, `/products`, `tests/products.test.js` |
| 2a — `Account` + `AccountItem` | 🔲 Pendente | 🔲 Pendente — `AccountModel.js` não existe |
| 2b — Migração do `Consumption` | 🔲 Pendente | 🔲 Pendente |
| 3a — Bill da conta + close | 🔲 Pendente | 🔲 Pendente |
| 3b — `Payment` ↔ `Account` | 🔲 Pendente | 🔲 Pendente |
| 3c — Delegação do bill da reserva | 🔲 Pendente | 🔲 Pendente |
| 4 — Check-in + Split Bill + Day-use | 🔲 Pendente | 🔲 Pendente |
| 5 — Seed, Swagger e testes | 🔲 Pendente | 🔲 Pendente |

**Evidência do que existe:** `app/Models/ProductModel.js`, `app/Controllers/ProductApi/` (5 controllers), rota `/products` registrada, `tests/products.test.js` com 36 testes, tabela `products` em `db/schema.sql` com índice único parcial.

**Evidência do que falta:** `ls app/Models/AccountModel.js` → não existe.

---

## 2. Objetivo

Completar o módulo de comanda, entregando os quatro cenários operacionais que motivaram seu desenho.

---

## 3. Cenários que o módulo resolve

| Cenário | Como o modelo resolve | Estado |
|---------|----------------------|--------|
| Família hospedada consome na conta da suíte | Conta `ROOM` vinculada à reserva | 🔲 |
| Pessoas diferentes na mesma suíte, contas separadas | Múltiplas contas com o mesmo `room_id`; só uma com `charges_lodging = true` | 🔲 |
| *Day-use* — consome sem se hospedar | Conta `DAY_USE` com `reservation_id` nulo | 🔲 |
| Consumo interno — cortesia, refeição de funcionário, perda | Conta `INTERNAL` ou item com `billable = false` e `reason` | 🔲 |

---

## 4. Desenho — já fechado

Decidido em 07/08/2026 e documentado no MER (entidades 4.11 e 4.12). **Não está em aberto.**

```
Account
  type:             ROOM | DAY_USE | TABLE | DIRECT | INTERNAL
  status:           OPEN | CLOSED | PAID
  reservation_id    (nullable — null em DAY_USE e INTERNAL)
  room_id, guest_id (nullable)
  label             "Suíte 201 - João" | "Mesa 5"
  charges_lodging   BOOLEAN DEFAULT true

AccountItem
  account_id, product_id (nullable — permite lançamento avulso)
  description, quantity, unit_price, total
  billable          BOOLEAN DEFAULT true
  reason            COURTESY | STAFF | LOSS | INTERNAL_USE
  client_item_id    (idempotência da fila offline)
  created_by        (auditoria)

Payment (alteração)
  + account_id nullable
  reservation_id → nullable
  CHECK (reservation_id IS NOT NULL OR account_id IS NOT NULL)
```

### Regras de negócio (do MER)

| ID | Regra |
|----|-------|
| **RN-005** | Duas contas no mesmo `room_id` não podem ambas ter `charges_lodging = true` — a diária seria cobrada em duplicidade |
| **RN-006** | Contas `INTERNAL` nunca entram em soma de receita |
| **RN-007** | Item não faturável mantém `unit_price` e `total` gravados — o valor precisa ser mensurável para responder "quanto demos de cortesia?" |
| **RN-008** | Reenvio do mesmo `client_item_id` não duplica o item — a fila offline do garçom reenviaria e cobraria duas vezes |

---

## 5. Tarefas

> Cada fatia é uma branch própria com merge próprio. Nenhuma acumula duas fatias.

### T-04.1 — `Account` + `AccountItem` + CRUD 🔲 *(fatia 2a · ~3,5 dias)*

Aditiva. **Não tocar no `ConsumptionModel` ainda.**

**Critérios de aceitação**
- [ ] **CA-04.1.a** — `POST /accounts/:id/items` com `product_id` copia `description` e `unit_price` do catálogo
- [ ] **CA-04.1.b** — Sem `product_id`, exige `description` + `unit_price`
- [ ] **CA-04.1.c** — `total` **sempre** calculado no servidor; valor do cliente é ignorado
- [ ] **CA-04.1.d** — Reenvio do mesmo `client_item_id` não duplica (RN-008)
- [ ] **CA-04.1.e** — Resposta do `POST /items` devolve o total atualizado da conta
- [ ] **CA-04.1.f** — `GET /accounts?status=OPEN&type=ROOM` filtra
- [ ] **CA-04.1.g** — Conta `CLOSED` rejeita item novo → **422**
- [ ] **CA-04.1.h** — `type: INTERNAL` aceito sem `reservation_id` e sem `guest_id`
- [ ] **CA-04.1.i** — Item `billable: false` exige `reason`, validado por **allowlist**
- [ ] **CA-04.1.j** — Soma da conta ignora `billable: false` (RN-007)
- [ ] **CA-04.1.k** — Duas contas no mesmo `room_id` com `charges_lodging: true` → **422** (RN-005)
- [ ] **CA-04.1.l** — Lançar item não faturável exige `ADMIN` ou `RECEPTIONIST` — garçom não dá cortesia sozinho
- [ ] **CA-04.1.m** — Isolamento multi-tenant em `accounts` e `account_items`
- [ ] **CA-04.1.n** — **Least privilege do `WAITER` fechado** — ver §6

**Armadilha:** `database/relations.js` já causou conflito neste projeto. Acrescentar ao final da seção, nunca reordenar.

---

### T-04.2 — Migração `Consumption` → `AccountItem` 🔲 *(fatia 2b · ~2-3 dias)*

**DEP:** T-04.1 · ⚠️ migração de dados

**Critérios de aceitação**
- [ ] **CA-04.2.a** — Todo `consumption` existente vira `AccountItem` sem perda de valor
- [ ] **CA-04.2.b** — `created_at` original preservado
- [ ] **CA-04.2.c** — Soft-deletados preservam `deleted_at` e `deleted_by` — trilha financeira
- [ ] **CA-04.2.d** — `POST /reservations/:id/consumptions` continua respondendo, gravando via `Account`
- [ ] **CA-04.2.e** — **`tests/bill-consumptions.test.js` passa sem nenhuma alteração no arquivo**

> Se precisar editar `tests/bill-consumptions.test.js` para passar, um contrato foi quebrado. **Parar e escalar.**

---

### T-04.3 — Bill da conta e fechamento 🔲 *(fatia 3a · ~2 dias)* — ✅ ponto de parada seguro

**DEP:** T-04.2

**Critérios de aceitação**
- [ ] **CA-04.3.a** — `GET /accounts/:id/bill` devolve `room_charges`, `consumptions`, `total`, `payments_made`, `balance`, `items`
- [ ] **CA-04.3.b** — `balance = total − payments_made`, calculado em runtime, **nunca persistido**
- [ ] **CA-04.3.c** — `consumptions` soma **apenas** itens `billable: true`
- [ ] **CA-04.3.d** — Itens não faturáveis vêm na lista com `billable` e `reason` — o frontend precisa deles para exibir cortesia riscada
- [ ] **CA-04.3.e** — `room_charges` é 0 quando `charges_lodging: false`
- [ ] **CA-04.3.f** — Conta `INTERNAL` fecha com `room_charges: 0` e `total: 0`
- [ ] **CA-04.3.g** — `PUT /accounts/:id/close` faz `OPEN → CLOSED`

> **Parar aqui ainda entrega um módulo coerente:** catálogo, comanda, lançamento e conta com total — que é tudo o que o app do garçom precisa. As fatias seguintes agregam day-use, split bill e unificação do pagamento.

---

### T-04.4 — `Payment` ↔ `Account` 🔲 *(fatia 3b · ~2-3 dias)* — 🔴 **maior risco**

**DEP:** T-04.3 · **branch isolada, nada mais junto**

Único ponto que pode quebrar o motor de reserva direta e o fluxo PIX.

**Arquivos atingidos:** `PublicBookingApi/CreateBookingController.js`, `WebhookApi/PixWebhookController.js`, `tests/public-booking.test.js`

**Critérios de aceitação**
- [ ] **CA-04.4.a** — `Payment` aceita `account_id` **ou** `reservation_id`
- [ ] **CA-04.4.b** — `CHECK (reservation_id IS NOT NULL OR account_id IS NOT NULL)` no banco
- [ ] **CA-04.4.c** — Pagamento total → `PAID`; parcial → conta segue `OPEN`
- [ ] **CA-04.4.d** — **`tests/public-booking.test.js` passa** — fluxo PIX intacto
- [ ] **CA-04.4.e** — Suíte completa verde

---

### T-04.5 — Delegação do bill da reserva 🔲 *(fatia 3c · ~1-2 dias)*

**DEP:** T-04.4 · ⚠️ refatoração

**Critérios de aceitação**
- [ ] **CA-04.5.a** — `GET /reservations/:id/bill` soma as `Accounts` da reserva
- [ ] **CA-04.5.b** — **Contrato de resposta idêntico** ao atual
- [ ] **CA-04.5.c** — `tests/bill-consumptions.test.js` passa sem alteração

---

### T-04.6 — Check-in cria conta + split bill + day-use 🔲 *(fatia 4 · ~3 dias)*

**DEP:** T-04.5

**Critérios de aceitação**
- [ ] **CA-04.6.a** — Check-in sem body cria 1 `Account`, com `guest_id` e `label` derivados da reserva
- [ ] **CA-04.6.b** — Check-in com `accounts: [...]` cria N contas **na mesma transação**
- [ ] **CA-04.6.c** — Falha em qualquer conta faz **rollback do check-in inteiro**
- [ ] **CA-04.6.d** — `GET /reservations/:id/accounts` lista as contas
- [ ] **CA-04.6.e** — `POST /accounts` com `type: DAY_USE` e `reservation_id: null` funciona
- [ ] **CA-04.6.f** — Bill de day-use traz `room_charges: 0`

---

### T-04.7 — Seed, Swagger, relatório e testes 🔲 *(fatia 5 · ~2,5 dias)*

**DEP:** T-04.6

**Critérios de aceitação**
- [ ] **CA-04.7.a** — `GET /analytics/internal-consumption?start=&end=` agrupa por `reason`, com valor e contagem
- [ ] **CA-04.7.b** — Considera itens `billable: false` de qualquer conta **mais** todos os itens de contas `INTERNAL`
- [ ] **CA-04.7.c** — Requer `ADMIN`
- [ ] **CA-04.7.d** — `seed/seed_consumo.sql` idempotente, com cardápio, conta aberta, day-use, `INTERNAL` e cortesia
- [ ] **CA-04.7.e** — Swagger completo de `/accounts`, **com schema de resposta** (ver SPEC-06)
- [ ] **CA-04.7.f** — `tests/tenant-isolation.test.js` expandido com `Account` e `Product`

> O endpoint de relatório está aqui menos pela feature e mais porque **escrever a query prova que o modelo funciona**. Se agrupar por motivo for difícil, o modelo está errado.

---

## 6. Pendência herdada — least privilege do `WAITER`

A Fatia 0 criou a role `WAITER` mas só a bloqueou em `/rooms`, `/users` e `/analytics` (verificado: só 3 routers mencionam `WAITER`).

**Hoje um garçom ainda alcança:** `GET /reservations` (com dados de hóspede), `/guests`, `/payments`, check-in/check-out e `/reservations/:id/bill`.

Isso é muito além de "lança consumo". **Bloqueia a Fase 2 do frontend** e precisa ser fechado na T-04.1.

- [ ] **CA-04.1.n.1** — `WAITER` lê `/products` e lança em `/accounts`
- [ ] **CA-04.1.n.2** — `WAITER` **não** alcança `/reservations`, `/guests`, `/payments`, check-in/out nem `/bill`
- [ ] **CA-04.1.n.3** — Teste cobrindo cada 403

---

## 7. Definition of Done

- [ ] Os quatro cenários operacionais funcionando ponta a ponta
- [ ] `ConsumptionModel` descontinuado, dados migrados
- [ ] Least privilege do `WAITER` fechado
- [ ] Suíte verde, incluindo os testes que não podiam quebrar
- [ ] Swagger completo com schema de resposta
- [ ] MER atualizado promovendo `ACCOUNTS` e `ACCOUNT_ITEMS` de 🔷 para ✅

---

## 8. Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| T-04.4 quebrar o fluxo PIX | 🔴 Alto | Branch isolada; `public-booking.test.js` como critério |
| Migração da T-04.2 perder dado financeiro | 🔴 Alto | CA-04.2.a a CA-04.2.c; validar contagem antes/depois |
| Escopo não caber no prazo | Médio | T-04.3 é ponto de parada seguro |
| `WAITER` ir para produção com acesso excessivo | 🔴 LGPD | CA-04.1.n bloqueia a fatia |

---

## 9. Histórico

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0 | 26/08/2026 | Gabriel Reis Cunha | Criação. Substitui o plano de 02/08, cuja tabela de status estava desatualizada — 2 fatias já mergeadas constavam como pendentes |
