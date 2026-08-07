# Planejamento — Módulo de Consumo e Contas (F&B + Day-use)
**Desenvolvedor:** Gabriel (orquestrador / Claude Code)
**Data:** 02/08/2026 · **Revisado em:** 02/08/2026
**Branch base:** `develop` @ `227d905`

---

> ## ⚠️ Revisão — base corrigida
>
> A versão original deste plano foi escrita contra a `main` em `55eaae0` (PR #36), **106 commits
> atrás** da `origin/develop`. Ela partia da premissa de que **não existia nenhum modelo de consumo**.
> Isso está errado.
>
> **A `develop` já tem:** `ConsumptionModel`, os endpoints `/reservations/:id/consumptions`
> (POST/GET/DELETE), o `GetBillController` em `GET /reservations/:id/bill` e a suíte
> `tests/bill-consumptions.test.js`.
>
> As Sprints 1, 4 e 5 seguem válidas. **As Sprints 2 e 3 foram reescritas** — o trabalho passa a ser
> de *absorção e refatoração*, não de criação do zero. As estimativas foram ajustadas.
>
> Leia `docs/BRIEFING_AGENTE_EXECUTOR_02ago2026.md` antes de começar.

---

## Contexto

O sistema atual trata `1 reserva = 1 conta = 1 pagamento`. Essa premissa quebra em 4 cenários reais:

1. Família quer registrar consumos (drinks, restaurante) na conta da suíte
2. Múltiplas suítes da mesma família com contas separadas
3. Dois hóspedes na mesma suíte com contas independentes
4. Day-use: cliente sem quarto consome e precisa pagar

O `ConsumptionModel` existente resolve parcialmente o cenário 1 — mas com `reservation_id` NOT NULL
e sem catálogo, não alcança os outros três.

Análise completa: `docs/historico_sessao/gabriel/analise_gaps_consumo_02ago2026.md`

---

## Estado real da base

| Recurso | Situação |
|---|---|
| `ConsumptionModel` (`reservation_id` NOT NULL, `deleted_by`) | ✅ Existe |
| `POST/GET/DELETE /reservations/:id/consumptions` | ✅ Existe |
| `GET /reservations/:id/bill` | ✅ Existe |
| `tests/bill-consumptions.test.js` | ✅ Existe — **não pode quebrar** |
| `ProductModel` (catálogo) | ❌ Não existe |
| `AccountModel` / `AccountItemModel` | ❌ Não existe |
| `PaymentModel.account_id` | ❌ Não existe · `reservation_id` é NOT NULL |
| Role `WAITER` | ❌ Não existe — só `ADMIN` e `RECEPTIONIST` |

---

## Arquitetura das novas entidades

```
Product (Cardápio)
  id, tenant_id, name, description, price, category (FOOD|DRINK|SERVICE|OTHER), active

Account (Conta/Comanda)
  id, tenant_id
  type:             ROOM | DAY_USE | TABLE | DIRECT | INTERNAL
  status:           OPEN | CLOSED | PAID
  reservation_id    (nullable — null para day-use e interno)
  room_id           (nullable)
  guest_id          (nullable)
  label             "Suíte 201 - João" | "Mesa 5" | "Piscina - Ana"
  charges_lodging   BOOLEAN DEFAULT true   ← quem carrega a diária no split
  opened_at, closed_at

AccountItem (Linha de consumo)
  id, tenant_id, account_id
  product_id      (nullable — do catálogo ou avulso)
  description, quantity, unit_price, total
  billable        BOOLEAN DEFAULT true     ← não faturável não soma no total
  reason          (nullable) COURTESY | STAFF | LOSS | INTERNAL_USE
  client_item_id  (nullable, UUID do cliente — idempotência da fila offline)
  created_by      (user_id do garçom)

Payment (alteração)
  + account_id (nullable FK)
  reservation_id → passa a nullable
  CHECK (reservation_id IS NOT NULL OR account_id IS NOT NULL)
```

### Consumo interno e cortesia — decidido em 07/08/2026

Três eventos de negócio distintos, não um só:

| Situação | Onde é lançado | Efeito |
|---|---|---|
| Refeição de funcionário | Conta `INTERNAL`, `reason: STAFF` | Custo. Nunca cobrado de ninguém |
| Perda, quebra, vencimento | Conta `INTERNAL`, `reason: LOSS` | Custo. Registra o evento para estoque futuro |
| **Cortesia ao hóspede** | Conta **do hóspede**, `billable: false`, `reason: COURTESY` | Aparece na conta dele, **não soma no total** |

**Por que isso importa — com precisão.** `GET /analytics/revenue` hoje soma `payments` e
`reservations.total_amount`; não lê consumos. Então consumo interno **já ficaria fora da
receita** por não gerar pagamento. O risco real é outro e é mais direto:

1. **A conta do hóspede cobraria a cortesia.** Sem `billable`, uma cerveja oferecida entra no
   total e o hóspede paga por um presente. É erro de cobrança, não de relatório.
2. **Refeição de funcionário não tem onde ser lançada** sem virar consumo de algum hóspede.
3. Quando alguém somar receita de A&B a partir de `account_items` — e vai somar — o filtro
   precisa já existir.

**Regra única:** total da conta e qualquer soma de receita consideram apenas
`billable = true` e ignoram contas `INTERNAL`.

**Fora de escopo agora (decidido):** controle de estoque. E **sem campos preparatórios** —
`category` já distingue serviço de produto, e coluna não usada é a abstração especulativa
que o próprio `qa-redteam` reprova. O `reason: LOSS` registra o evento; isso basta para
reconstruir depois.

### Split da diária — `charges_lodging`

No cenário de duas contas na mesma suíte, sem regra explícita a diária é cobrada duas vezes
ou some. Só a conta marcada `charges_lodging: true` carrega a hospedagem; as demais nascem
de consumo puro. Numa reserva multi-quarto com uma conta por suíte, cada conta cobra a
diária **do seu próprio quarto**.

### Decisão de reconciliação: `Account` absorve `Consumption`

`Account` e `Consumption` resolvem o mesmo problema e não podem coexistir — dois caminhos de
lançamento produziriam um `/bill` que soma errado.

1. `Account` tipo `ROOM` passa a ser a conta da estadia; `Consumption` vira `AccountItem`
2. Migração de dados preservando `created_at` e `deleted_by`
3. `GET /reservations/:id/bill` **continua existindo**, delegando para as contas da reserva
4. `POST /reservations/:id/consumptions` vira *deprecated*, gravando via `Account`

---

## Decisões de design aprovadas

| Decisão | Escolha |
|---|---|
| Criação da conta no check-in | **Automática** — `CheckInController` cria Account(s) na mesma transação |
| Split bill | Recepcionista especifica `accounts: [...]` no body do check-in; se omitido, 1 conta automática |
| Item sem catálogo | Suportado — `product_id` nullable; `description` + `unit_price` obrigatórios nesse caso |
| `total` do AccountItem | **Sempre** calculado pelo servidor (`quantity × unit_price`) |
| Conta sem guest (mesa externa) | `guest_id` nullable — `label` basta |
| Pagamento parcial | Aceito — conta segue `OPEN`; `PAID` só quando `amount >= balance` |
| Idempotência do lançamento | `client_item_id` — a fila offline do garçom pode reenviar |

---

## Sprints

Fatiadas para serem **gerenciáveis**: cada fatia entrega em ≤ 3 dias, tem merge próprio e é
**ou puramente aditiva, ou um único risco isolado**. Isso vale mais do que parecer enxuto —
com 3 agentes em paralelo, merge grande é o que trava o time.

| # | Fatia | Natureza | Est. | Branch |
|---|---|---|---|---|
| **0** | CORS + filtro de datas/paginação + role `WAITER` | Aditiva | 1 d | `fix/backend-prep-frontend` |
| **1** | Catálogo de Produtos (Product CRUD) | Aditiva | 2 d | `feature/product-catalog` |
| **2a** | `Account` + `AccountItem` + CRUD, com `INTERNAL`, `billable`/`reason` e `charges_lodging` · fecha o least-privilege do `WAITER` | Aditiva | 3,5 d | `feature/account-entities` |
| **2b** | Migração `Consumption` → `AccountItem` + deprecar endpoints antigos | ⚠️ Migração de dados | 2–3 d | `feature/consumption-migration` |
| **3a** | `GET /accounts/:id/bill` + `PUT /accounts/:id/close` | Aditiva | 2 d | `feature/account-bill` |
| **3b** | `Payment.account_id` + `reservation_id` nullable + CHECK | 🔴 **Risco isolado** | 2–3 d | `feature/payment-account-link` |
| **3c** | `GET /reservations/:id/bill` passa a delegar para as contas | ⚠️ Refatoração | 1–2 d | `feature/reservation-bill-delegate` |
| **4** | Check-in auto-cria conta + Split Bill + Day-use | Aditiva | 3 d | `feature/split-bill-dayuse` |
| **5** | Endpoint de cortesias/perdas · seed, Swagger e testes de isolamento | Aditiva | 2,5 d | `feature/consumo-seed-swagger` |

**Total:** ~20 dias · **PR único ao final:** `develop → main`

> **Decisões de 07/08/2026 já incorporadas:** consumo interno entra agora (só modelo e regra
> de soma — telas de lançamento interno ficam para depois) · cortesia mostrada riscada com
> rótulo · estoque **fora** de escopo, e sem campos preparatórios · endpoint do relatório na
> Fatia 5, tela na Fase 3 do frontend.
>
> **Princípio que orienta o corte:** entregar a **base** primeiro. Onde couber escolher,
> escolha o que é caro de retrofitar (modelo de dados, regra de soma) e adie o que é barato
> de acrescentar depois (telas, fluxos de aprovação, configurações por hotel).

### Por que 3a / 3b / 3c separados

A Sprint 3 original juntava três coisas de risco muito diferente num único merge. Separadas:

- **3a é aditiva** — endpoint novo, nada existente muda. Merge sem medo.
- **3b é o único ponto que pode quebrar o motor de reservas e o PIX.** Sozinha numa branch, se
  `tests/public-booking.test.js` ficar vermelho, a causa é inequívoca. Junto com 3a e 3c, seria
  preciso bissectar dentro do próprio merge.
- **3c é refatoração pura** — o contrato de resposta não muda e `tests/bill-consumptions.test.js`
  é o critério de aceite.

Mesma lógica em 2a/2b: criar entidade é seguro, migrar dado é o que exige atenção e rollback.

### Ponto de parada seguro

Se o prazo apertar, **parar depois da 3a ainda entrega um módulo coerente**: catálogo, comanda,
lançamento de itens e conta com total — que é o que o app do garçom precisa. As fatias 3b, 3c e 4
adicionam day-use, split bill e unificação do pagamento, e podem ficar para depois do TCC sem
deixar nada quebrado pela metade.

---

## Sprint 0 — Pré-requisitos

Compartilhada com a Fase 0 do frontend. Detalhes em `docs/BRIEFING_AGENTE_EXECUTOR_02ago2026.md` §6.

| Item | Arquivo | Motivo |
|---|---|---|
| Habilitar CORS | `_web.js` ou `bootstrap/app.js` | Frontend em outra origem não consegue chamar a API |
| `GET /reservations?from=&to=` + paginação | `ListReservationController.js` | Hoje faz `findAll` do tenant inteiro com 3 joins |
| Role `WAITER` | `UserModel.js`, `middlewares/roleMiddleware.js` | Garçom não pode ver o sistema inteiro |

### Critérios de aceite
- [ ] Requisição de origem diferente recebe os headers CORS corretos
- [ ] `GET /reservations?from=2026-08-01&to=2026-08-31` devolve só o intervalo
- [ ] `GET /reservations?page=1&limit=50` devolve `{ data, total, page, limit }`
- [ ] Usuário `WAITER` recebe 403 em `/rooms`, `/users`, `/analytics`
- [ ] `npm test` passando

---

## Sprint 1 — Catálogo de Produtos

### Arquivos a criar
| Arquivo | Propósito |
|---|---|
| `app/Models/ProductModel.js` | Model Sequelize |
| `app/Controllers/ProductApi/CreateProductController.js` | `POST /products` |
| `app/Controllers/ProductApi/ListProductController.js` | `GET /products` |
| `app/Controllers/ProductApi/GetProductController.js` | `GET /products/:id` |
| `app/Controllers/ProductApi/UpdateProductController.js` | `PUT /products/:id` |
| `app/Controllers/ProductApi/DeleteProductController.js` | `DELETE /products/:id` (ADMIN) |
| `routes/apis/productRouter.js` | Roteador |
| `tests/products.test.js` | Suíte de testes |

### Arquivos a modificar
| Arquivo | O que muda |
|---|---|
| `database/relations.js` | `TenantModel.hasMany(ProductModel)` |
| `command.js` | Importar `ProductModel` para o sync |
| `routes/router.js` | Registrar `/products` |
| `config/swagger.js` | Paths `/products` + schema `Product` |

### Schema
```js
{
  id:          UUID PK,
  tenant_id:   UUID NOT NULL FK tenants,
  name:        TEXT NOT NULL,
  description: TEXT nullable,
  price:       DECIMAL(10,2) NOT NULL,
  category:    TEXT NOT NULL DEFAULT 'OTHER',  // FOOD|DRINK|SERVICE|OTHER
  active:      BOOLEAN NOT NULL DEFAULT true
}
// tableName: 'products', paranoid: true
// unique: [name, tenant_id]  ← composto, padrão SaaS do projeto
```

### Critérios de aceite
- [ ] `POST /products` cria produto com `name`, `price`, `category`
- [ ] `GET /products?active=true` filtra corretamente
- [ ] `PUT /products/:id` atualiza; `DELETE` exige role `ADMIN`
- [ ] `active: false` desativa sem deletar
- [ ] Tenant B não vê produtos do Tenant A
- [ ] `WAITER` consegue ler `/products` (precisa do cardápio) mas não escrever
- [ ] `node command.js migrate` cria `products` sem erro
- [ ] `npm test` passando

---

## Sprint 2 — Account + AccountItem + migração do Consumption

> **Reescrita.** Além de criar as entidades, esta sprint absorve o `ConsumptionModel` existente.

### Arquivos a criar
| Arquivo | Propósito |
|---|---|
| `app/Models/AccountModel.js` | Model Sequelize |
| `app/Models/AccountItemModel.js` | Model Sequelize |
| `app/Controllers/AccountApi/CreateAccountController.js` | `POST /accounts` |
| `app/Controllers/AccountApi/ListAccountController.js` | `GET /accounts` |
| `app/Controllers/AccountApi/GetAccountController.js` | `GET /accounts/:id` |
| `app/Controllers/AccountApi/DeleteAccountController.js` | `DELETE /accounts/:id` (ADMIN) |
| `app/Controllers/AccountApi/AddItemController.js` | `POST /accounts/:id/items` |
| `app/Controllers/AccountApi/RemoveItemController.js` | `DELETE /accounts/:id/items/:itemId` |
| `db/migrations/consumptions_to_account_items.sql` | **Migração de dados** |
| `routes/apis/accountRouter.js` | Roteador |
| `tests/accounts.test.js` | Suíte de testes |

### Arquivos a modificar
| Arquivo | O que muda |
|---|---|
| `database/relations.js` | Relações Account, AccountItem, Product, Guest, Reservation, Room |
| `command.js` | Importar `AccountModel` e `AccountItemModel` |
| `routes/router.js` | Registrar `/accounts` |
| `config/swagger.js` | Paths + schemas `Account`, `AccountItem` |
| `tests/helpers/factories.js` | `createProduct`, `createAccount`, `addItemToAccount` |
| `app/Controllers/ConsumptionApi/*` | Passam a gravar/ler via `Account` (deprecated) |

### Migração de dados
Para cada `consumption`:
1. Localizar a `Account` tipo `ROOM` da `reservation_id`; se não existir, criar com
   `label` derivado do quarto e do hóspede
2. Inserir `AccountItem` com `description`, `total` = `amount`, `quantity` = 1,
   `unit_price` = `amount`, `product_id` = null
3. Preservar `created_at` original e `deleted_by`/`deleted_at` dos registros soft-deleted

### Critérios de aceite
- [ ] `POST /accounts/:id/items` com `product_id` preenche `description` e `unit_price` do catálogo
- [ ] `POST /accounts/:id/items` sem `product_id` exige `description` + `unit_price`
- [ ] `total` sempre calculado pelo servidor — valor enviado pelo cliente é ignorado
- [ ] Reenvio do mesmo `client_item_id` **não** duplica o item (idempotência)
- [ ] Resposta do `POST /items` inclui o total atualizado da conta
- [ ] `GET /accounts?status=OPEN&type=ROOM` filtra corretamente
- [ ] Conta `CLOSED` rejeita novos itens (422)
- [ ] Tenant isolation em `accounts` e `account_items`
- [ ] **Migração:** todo `consumption` existente vira `AccountItem` sem perda de valor nem de data
- [ ] **`tests/bill-consumptions.test.js` continua passando sem alteração**

#### Consumo interno e cortesia
- [ ] `POST /accounts` aceita `type: INTERNAL` sem `reservation_id` e sem `guest_id`
- [ ] Item com `billable: false` **exige** `reason`
- [ ] `unit_price` e `total` do item não faturável são gravados normalmente — o valor do que
      foi dado ou perdido precisa ser mensurável
- [ ] Soma da conta ignora itens `billable: false`
- [ ] Conta `INTERNAL` nunca entra em soma de receita
- [ ] `reason` restrito por **allowlist** (`COURTESY|STAFF|LOSS|INTERNAL_USE`), não blocklist
- [ ] Lançar item não faturável exige role `ADMIN` ou `RECEPTIONIST` — **garçom não dá
      cortesia sozinho**

#### Split da diária
- [ ] `charges_lodging` default `true`
- [ ] Duas contas no mesmo `room_id` com `charges_lodging: true` → rejeitar (422). A diária
      não pode ser cobrada duas vezes

#### Least privilege do `WAITER` (pendência herdada da Fatia 0)
- [ ] Definir e aplicar a allowlist do `WAITER`: ele lança consumo e lê o cardápio, e **não**
      alcança `GET /reservations`, `/guests`, `/payments`, check-in/out nem `/bill`

---

## Sprint 3 — Refatorar Bill e Fechamento

> **Reescrita.** O `/bill` **já existe**. O trabalho é redirecioná-lo para as contas e estender
> o `PaymentModel` — não criar do zero.

### Endpoints
| Endpoint | Situação |
|---|---|
| `GET /reservations/:id/bill` | **Refatorar** — passa a somar as `Accounts` da reserva. Contrato de resposta preservado |
| `GET /accounts/:id/bill` | Criar |
| `PUT /accounts/:id/close` | Criar — `OPEN` → `CLOSED` |
| `POST /accounts/:id/pay` | Criar — cria `Payment` e fecha se o saldo zerar |

### Resposta de `GET /accounts/:id/bill`
```json
{
  "account": { "id": "...", "label": "Suíte 201 - João", "status": "OPEN" },
  "room_charges": 600.00,
  "consumptions": 180.00,
  "total": 780.00,
  "payments_made": 300.00,
  "balance": 480.00,
  "items": []
}
```

### ⚠️ Ponto de maior risco: `PaymentModel`

Tornar `reservation_id` nullable e adicionar `account_id` **impacta o motor de reserva direta
e o fluxo PIX**, que não existiam quando este plano foi escrito:

| Arquivo afetado | Por quê |
|---|---|
| `app/Controllers/PublicBookingApi/CreateBookingController.js` | Cria `Payment` com `reservation_id` |
| `app/Controllers/WebhookApi/PixWebhookController.js` | Confirma pagamento pelo `provider_charge_id` |
| `tests/public-booking.test.js` | Cobre o fluxo inteiro |

O model atual tem `status` (PENDING/PAID/EXPIRED/FAILED), `kind` (FULL/DEPOSIT/BALANCE),
`provider`, `provider_charge_id`, `pix_qr_code`, `pix_expiration`, `paid_at` — todos precisam
continuar funcionando.

### Critérios de aceite
- [ ] `balance = total − payments_made`, calculado em runtime (nunca persistido)
- [ ] Pagamento total → `PAID` automático; parcial → segue `OPEN`
- [ ] `PaymentModel` aceita `account_id` **ou** `reservation_id`
- [ ] Constraint no banco: `CHECK (reservation_id IS NOT NULL OR account_id IS NOT NULL)`
- [ ] **`tests/public-booking.test.js` continua passando** — fluxo PIX intacto
- [ ] **`tests/bill-consumptions.test.js` continua passando**
- [ ] `npm test` completo verde antes de abrir PR

#### Faturável e diária no bill (fatia 3a)
- [ ] `consumptions` do bill soma **apenas** itens `billable: true`
- [ ] Itens não faturáveis vêm na lista `items` com `billable: false` e `reason` — a tela
      precisa deles para mostrar a cortesia riscada
- [ ] `room_charges` é 0 quando `charges_lodging: false`
- [ ] Conta `INTERNAL` fecha com `room_charges: 0` e `total: 0`

---

## Sprint 4 — Check-in auto-cria conta + Split Bill + Day-use

### Mudança no `CheckInController`
```js
// body opcional:
{
  "accounts": [
    { "guest_id": "uuid-joao",  "label": "Suíte 201 - João" },
    { "guest_id": "uuid-pedro", "label": "Suíte 201 - Pedro" }
  ]
}
// se accounts ausente → 1 Account automática, guest_id e label derivados da reserva
// tudo na mesma transação Sequelize
```

### Critérios de aceite
- [ ] Check-in sem body cria 1 Account automaticamente
- [ ] Check-in com `accounts` cria N Accounts na mesma transação
- [ ] Falha em qualquer conta faz rollback do check-in inteiro
- [ ] `GET /reservations/:id/accounts` lista as contas da reserva
- [ ] Day-use: `POST /accounts` com `type: DAY_USE` e `reservation_id` null funciona
- [ ] Bill de day-use traz `room_charges: 0`
- [ ] Tenant isolation em todos os novos endpoints

---

## Sprint 5 — Qualidade e encerramento

### Endpoint de cortesias e perdas

`GET /analytics/internal-consumption?start=&end=` — agrupa por `reason`, devolve valor e
contagem.

O motivo de estar aqui não é entregar a feature: é que **escrever essa query é a prova de
que o modelo de consumo interno funciona.** Se agrupar por motivo e período for difícil, o
modelo está errado — e é muito melhor descobrir na Fatia 5 do que semanas depois. São ~2
horas. A tela vai para a Fase 3 do frontend, junto com as outras de analytics.

- [ ] Agrupa por `reason` no período, com valor somado e contagem
- [ ] Considera itens `billable: false` de qualquer conta **mais** todos os itens de contas
      `INTERNAL`
- [ ] Tenant isolation
- [ ] Requer role `ADMIN`

### Restante

- `seed/seed_consumo.sql` — cardápio básico para os dois tenants, contas abertas de exemplo
  (incluindo uma day-use, uma `INTERNAL` e uma cortesia), seguindo o padrão idempotente
  `NOT EXISTS` do `seed_hotels.sql`
- Swagger completo de `/products` e `/accounts` — **obrigatório**: o cliente de API do frontend
  é gerado a partir dele
- `tests/tenant-isolation.test.js` expandido com `Account` e `Product`
- Verificar cobertura ≥ 60% (portão do CI em `.github/workflows/ci.yml`)
- Relatório de sessão em `docs/historico_sessao/gabriel/`

---

## Sequência de branches

```
0    fix/backend-prep-frontend         → merge develop   [desbloqueia o frontend]
1    feature/product-catalog           → merge develop
2a   feature/account-entities          → merge develop
2b   feature/consumption-migration     → merge develop
3a   feature/account-bill              → merge develop   ← ponto de parada seguro
3b   feature/payment-account-link      → merge develop   [risco: PIX]
3c   feature/reservation-bill-delegate → merge develop
4    feature/split-bill-dayuse         → merge develop
5    feature/consumo-seed-swagger      → merge develop
     PR único: develop → main
```

Cada merge passa pelo `qa-redteam` antes — ver `docs/COORDENACAO_AGENTES.md` §5.

---

## Status das fatias

| # | Fatia | Status |
|---|---|---|
| 0 | Pré-requisitos de backend | 🔲 Pendente |
| 1 | Product Catalog | 🔲 Pendente |
| 2a | Account + AccountItem | 🔲 Pendente |
| 2b | Migração do Consumption | 🔲 Pendente |
| 3a | Bill da conta + close | 🔲 Pendente |
| 3b | Payment ↔ Account | 🔲 Pendente |
| 3c | Delegação do bill da reserva | 🔲 Pendente |
| 4 | Check-in + Split Bill + Day-use | 🔲 Pendente |
| 5 | Seed, Swagger e testes | 🔲 Pendente |

---

## Documentos relacionados

- `docs/BRIEFING_AGENTE_EXECUTOR_02ago2026.md` — **ponto de entrada**
- `docs/historico_sessao/gabriel/analise_gaps_consumo_02ago2026.md` — diagnóstico dos 5 cenários
- `docs/frontend/PLANEJAMENTO_FRONTEND.md` §8 — como este módulo aparece na interface
