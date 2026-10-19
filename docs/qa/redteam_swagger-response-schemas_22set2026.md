# QA Red Team — T-06.2 schema de resposta no Swagger + defaultScope do PaymentModel

**Branch:** `docs/swagger-response-schemas` · **Base:** `develop@c4e2a91` · **Data:** 22/09/2026
**Worktree auditado:** `/home/gabri/sistema_gestao_hotel-etapa3` (isolado; `/home/gabri/sistema_gestao_hotel` não foi tocado)
**Arquivos no diff:** 8 · **Respostas 2xx medidas:** 54 · **Achados:** 15 (🔴 1 **fechado** · 🟡 9 · 🟢 5) + 3 pré-existentes fora do diff
**Status:** reauditado em 22/09 após a correção do 🔴 — **APROVADO COM RESSALVAS** (ver seção seguinte). O 🔴-1 original está fechado; 🟡-15 é novo.

## Reauditoria de 22/09 — correção do achado 🔴

**Escopo:** só o achado 🔴-1 e o que a correção dele pode ter movido. Working tree com 3 arquivos
modificados (`config/swagger.js`, `openapi.json`, `schema.d.ts`), ainda não commitado.

### Veredito da reauditoria

**APROVADO COM RESSALVAS** — o 🔴-1 está **FECHADO**. Nenhum 🔴 remanescente no escopo.
Libera o merge. Abre **1 achado 🟡 novo** (🟡-15), que não bloqueia.

### 🔴-1 — FECHADO, verificado por medição própria (não por leitura do diff)

Os 3 pontos foram trocados para `{ type: 'string', description: 'DECIMAL(x,2) serializado como string' }`:
`config/swagger.js:73` (`RoomCategory.price_per_night`), `:91` (`Room.category.price_per_night`),
`:127` (`Reservation.total_amount`).

`ReservationListItem` (`:134`) e `ReservationDetail` (`:160`) herdam via `allOf: [$ref Reservation]` —
a correção se propaga sozinha para as duas, não precisou ser repetida.

**Não aceitei o diff como prova.** Subi o app com supertest contra banco isolado e medi `typeof` em
**todas** as respostas 2xx que referenciam os campos corrigidos:

| Endpoint | `total_amount` / `price_per_night` medido | Bate com o schema? |
|---|---|---|
| `POST /reservations` (201) | `string("800.00")` | ✅ |
| `GET /reservations` | `string("800.00")` | ✅ |
| `GET /reservations/{id}` | `string("800.00")` | ✅ |
| `PUT /reservations/{id}` | `string("800.00")` | ✅ |
| `PUT /reservations/{id}/check-in` | `string("800.00")` | ✅ |
| `PUT /reservations/{id}/check-out` | `string("800.00")` | ✅ |
| `PUT /reservations/{id}/cancel` | `string("400.00")` | ✅ |
| `GET /room-categories` | `string("200.00")` | ✅ |
| `POST /room-categories` (201) | `string("199.90")` | ✅ |
| `GET /rooms` → `category` | `string("175.50")` | ✅ |
| `GET /rooms/available` → `category` | `string("175.50")` | ✅ |
| **`PUT /room-categories/{id}`** | **`number(175.5)`** | ❌ → 🟡-15 |

Ponto que eu tinha deduzido errado e a medição corrigiu: `POST /reservations` calcula
`total_amount` como **number** JS (`CreateReservationController.js:57`,
`parseFloat(price) * nights`) e devolve a instância do `create()` direto (`:84`, sem `reload()`).
Isso *parecia* ser um segundo ponto quebrado pela correção. Não é: o Sequelize faz
`INSERT ... RETURNING` no Postgres e reidrata o `dataValues` com a linha do banco, então a resposta
sai `string`. Medido, não inferido.

### Varredura própria por outros campos DECIMAL documentados como `number`

Não confiei nos 3 apontados. Rodei a varredura completa: `grep "type: 'number'"` em `config/swagger.js`
→ 38 ocorrências, e cruzei **cada uma** com a origem do dado. Todas as 38 restantes estão **corretas**:

- **12 são `requestBody`** (entrada, não resposta) — `POST/PUT /products.price` (`:1174`, `:1213`),
  `POST /reservations/{id}/consumptions.amount` (`:845`), `POST /payments.amount` (`:894`).
  `number` na entrada é certo: o cliente manda number, o Sequelize aceita.
- **7 são convertidas no controller com `Number()`** — `Bill` inteiro (`:204-216`):
  `GetBillController.js:30-64` faz `Number(...)` em `room_total`, `consumptions_total`, `grand_total`,
  `total_paid`, `total_pending`, `balance_due`, `consumptions[].amount` e `payments[].amount`.
- **7 são do fluxo público, também com `Number()`** — `PublicAvailability` (`:299`, `:302`) via
  `getAvailableCategories.js:44,57`; `PublicBookingResponse` (`:317`, `:323`, `:325`) via
  `CreateBookingController.js:75,119,156`; `PublicBookingStatus` (`:342`, `:346`) via
  `GetBookingStatusController.js:44,46`.
- **12 são de `/analytics`, todas com `::float` explícito no SQL cru** — conferi os 7 controllers:
  `GetRevenueController.js:16,29,40,54`, `GetTopGuestsController.js:19`, `GetAlertsController.js:14,51`,
  `GetSeasonalityController.js:17,18`, `GetOccupancyController.js:28,47,48,57`,
  `GetRevenueByCategoryController.js:17,20`, `GetPaymentMixController.js:17,21`.
  O `::float` converte `numeric` antes de o driver serializar — `number` é o tipo certo.

Confirmei também no cliente gerado: sobram **2** `total_amount?: number` em `schema.d.ts`
(`:3718` e `:3754`) e são exatamente `PublicBookingResponse` e `PublicBookingStatus` — os dois
legítimos. Nenhum campo DECIMAL ficou documentado como `number` por engano.

### 🟡 15 [contrato] `PUT /room-categories/{id}` devolve `price_per_night` como number — inconsistência **criada** pela correção do 🔴

**Onde:** `config/swagger.js:73` (schema `RoomCategory`, agora `string`) vs. a resposta 200 do
`PUT /room-categories/{id}`, que usa o mesmo `$ref`.

**Cenário (medido):** `PUT /room-categories/{id}` com `{"price_per_night": 175.5}` responde
`"price_per_night": 175.5` (**number**). O `GET /room-categories` do mesmo registro responde
`"175.50"` (**string**). Um `$ref` só, dois tipos. Causa idêntica ao 🟡-3: o `.update()` do Sequelize
não usa `RETURNING`, então o valor cru do body fica na instância e é serializado como veio.

**Honestidade sobre a origem:** isto **não existia antes** desta correção. Antes, o schema dizia
`number` — errado para GET/POST (as leituras), certo por acidente para o PUT. Agora diz `string` —
certo para GET/POST/check-in/check-out/cancel, errado só para o PUT. O saldo é fortemente positivo:
o contrato saiu de **17 respostas 2xx erradas para 1**. Mas é um ponto novo e eu não vou deixá-lo
sem registro só porque o diff melhorou a média.

**Por que 🟡 e não 🔴:** é o mesmo bug, na mesma linha de código, que o 🟡-3 (`PUT /payments/{id}`
devolve `amount` como number — reconfirmei nesta rodada: `number(310)`). Classificar este como 🔴
e aquele como 🟡 seria incoerente. Além disso não há consumidor: `grep` por
`total_amount|price_per_night` em `frontend/apps` e `frontend/packages` (fora o `schema.d.ts` gerado)
→ **zero ocorrências**.

**Correção sugerida:** `await category.reload()` antes do `response.json()` — mesma correção do 🟡-3,
e as duas cabem numa tarefa só ("PUT devolve o tipo do GET"). Corrige a API, não a doc.

### Mudança na descrição do schema `Payment` — verifiquei as afirmações novas

A descrição foi reescrita e passou a afirmar duas coisas novas. Testei as duas em vez de aceitar:

1. *"não aparecem em GET /payments, GET /payments/{id} nem PUT /payments/{id}"* — **verdadeiro**.
   `UpdatePaymentController.js:5-7` carrega via `findOne` no model **com** `defaultScope`, então a
   instância nunca tem os 3 campos e o `response.json(payment)` do `:17` não pode vazá-los.
2. *"os 3 campos vêm null nessa resposta"* (no `POST /payments`) — **verdadeiro e não injetável**.
   `CreatePaymentController.js:6` destrutura uma allowlist explícita
   (`reservation_id, amount, method, paid_at`); não há mass assignment, então um cliente **não**
   consegue mandar `provider_charge_id` no body e recebê-lo de volta no 201.

A descrição agora é fiel e o 🟡-2 está corretamente reconhecido como ressalva documentada
(a correção estrutural — `create()` devolver allowlist explícita — continua pendente, ainda 🟡).

### Achados anteriores — nenhum se agravou

Reconferidos contra esta mudança: 🟡-2 (documentado, causa intacta), 🟡-3 (reconfirmado por medição,
`number(310)`), 🟡-4 (a duplicação `Room.category` × `RoomCategory` **persiste**, mas agora as duas
cópias dizem `string` — divergiram menos, não mais), 🟡-5 a 🟡-9, 🟢-10 a 🟢-14: **inalterados**.
A mudança é puramente declarativa em `components.schemas` — não toca controller, model, rota,
transação nem query.

### Reexecução do portão — rodei tudo do zero, sem cache

| Verificação | Comando | Resultado |
|---|---|---|
| Drift do cliente gerado | `pnpm gen:api` + `diff` contra os artefatos do working tree | **sem drift** — a geração reproduz byte-a-byte `openapi.json` e `schema.d.ts` (40 paths) |
| Typecheck frontend | `npx turbo run typecheck --force` | **4 successful, 0 cached**, exit 0 |
| Suíte backend | `npm test` em banco isolado `gestao_hotel_test_qa3b` | **17 arquivos, 237 passam, 1 skip**, exit 0 |
| Cobertura | `npm run test:coverage` | **74,58 / 71,62 / 83,79 / 76,94** — acima do portão de 60%, idêntico à auditoria anterior |
| Portão determinístico | `bash scripts/qa_checks.sh` | exit 0, **3 avisos** (os mesmos pré-existentes), 0 erros |
| Consumo no frontend | `grep total_amount\|price_per_night` em `apps/` e `packages/` (fora `schema.d.ts`) | **0 ocorrências** — a troca `number` → `string` não quebra nada hoje |

O typecheck passar é evidência fraca aqui justamente porque não há consumidor — registro isso em vez
de vendê-lo como prova de compatibilidade. A prova real é o grep com zero ocorrências.

**Higiene da reauditoria:** o banco `gestao_hotel_test_qa3b` foi criado e destruído por mim para não
truncar o `gestao_hotel_test` da outra worktree; o `.env.test` foi restaurado ao original; o teste-probe
temporário foi apagado. `git status` ao final: os mesmos 3 arquivos modificados + este relatório.

### Pendência que continua valendo para o merge

🟢-14: a branch ainda não tem relatório de sessão em `docs/historico_sessao/<dev>/` e a T-06.2 segue
🔲 na SPEC-06 (CLAUDE.md §6). Não é bloqueio técnico, é fechamento de sessão.

---

## Veredito (auditoria original — 🔴 já fechado, ver reauditoria acima)

**REPROVADO** — por um único achado 🔴, de correção pequena (2 linhas de schema + regenerar o cliente).

O resto da branch é sólido e está comprovado por execução própria: a suíte, o portão de QA, o typecheck
e a regeneração do cliente foram rodados do zero por mim e batem com o relatado. O 🔴 é um erro de
**tipo de campo monetário** no contrato que a branch publica — e é justamente o contrato que o frontend
passou a consumir sem cast nesta mesma branch.

---

## Critérios de aceite CA-06.2.a–e — estado com evidência real (rodada por mim)

| CA | Estado | Evidência que eu mesmo produzi |
|---|---|---|
| **CA-06.2.a** — todas as respostas 2xx dos endpoints usados pelo frontend declaram `content` | ✅ **atendido** | Script próprio sobre o `openapi.json` gerado: **54 respostas 2xx (excluindo 9× 204), 0 sem `content`**. Ressalva de escopo em 🟡-6 (3 routers B2B continuam fora do Swagger inteiro). |
| **CA-06.2.b** — schemas reutilizáveis, sem duplicação literal | ⚠️ **parcial** | 15 schemas em `components.schemas` e `$ref` em todas as 2xx; mas há duplicação literal remanescente — ver 🟡-4. |
| **CA-06.2.c** — cliente regenerado sem `never` nos módulos cobertos | ✅ **atendido, com ressalva de fidelidade** | Rodei `pnpm gen:api`: **`git status` ficou vazio** → o `openapi.json` e o `schema.d.ts` commitados são byte-a-byte o que a geração produz (sem drift). Nenhuma resposta 2xx gera `content?: never`. **Ressalva:** "sem `never`" ≠ "fiel ao código" — ver 🔴-1 e 🟡-2. |
| **CA-06.2.d** — casts `as unknown as` removidos de `guestsApi.ts` | ✅ **atendido** | `grep -rn "as unknown as" frontend/apps/pms/src` → 0 ocorrências. Os 6 casts saíram (4 em `guestsApi.ts`, 1 em `GuestDetailPage.tsx`, 1 em `loginApi.ts`). Sobrou 1 cast `body: input as never` no PUT, justificado no comentário (requestBody, não response — fora do CA). |
| **CA-06.2.e** — typecheck do frontend limpo | ✅ **atendido** | `npx turbo run typecheck --force` → **4 successful, 0 cached** (invalidei o cache do turbo; o `pnpm typecheck` simples respondia `FULL TURBO` de cache e não provava nada). `npx tsc --noEmit` direto em `apps/pms` → exit 0. |

**Portão de QA reconfirmado (não repetido de relato):**
- `bash scripts/qa_checks.sh` → exit 0, **3 avisos**, 0 erros (os mesmos 3 relatados).
- Suíte backend em banco isolado (`gestao_hotel_test_qa3`, criado e destruído por mim para não colidir com a
  outra worktree): **17 arquivos, 237 passam, 1 skip**, cobertura **74,58 / 71,62 / 83,79 / 76,94** — idêntico ao relatado.

---

## Achados

### 🔴 1 [contrato de API / financeiro] Campo monetário DECIMAL documentado como `number`, mas a API devolve string

**Onde:** `services/core-service/config/swagger.js:73` (`RoomCategory.price_per_night`),
`:91` (`Room.category.price_per_night`), `:127` (`Reservation.total_amount`)

**Cenário concreto (medido, não deduzido):** rodei o app de verdade com supertest contra o banco:

```
GET /reservations     → total_amount     = string "600.00"   (schema diz number/float)
GET /room-categories  → price_per_night  = string "150.00"   (schema diz number/float)
GET /rooms[0].category→ price_per_night  = string "150.00"   (schema diz number/float)
```

São colunas `DECIMAL` — o driver do Postgres as entrega como string, e o Sequelize serializa string.
O próprio autor sabe disso e documentou certo em `Product.price` (`:62`, "DECIMAL(10,2) serializado como
string"), `Payment.amount` (`:230`), `Consumption.amount` (`:191`) e até em `Payment.reservation.total_amount`
(`:243`, string). Nos três campos acima escapou — é inconsistência, não convenção.

Impacto: o `schema.d.ts` tipa `total_amount?: number` em **17 das 54 respostas 2xx** (POST/GET/PUT de
`/reservations`, `/reservations/{id}`, cancel, check-in, check-out, `/room-categories` ×4, `/rooms` ×4,
`/rooms/available`). Duas falhas concretas, ambas em tela de dinheiro:

1. `reserva.total_amount.toFixed(2)` **compila** e quebra em runtime (`toFixed is not a function`).
2. `Number(reserva.total_amount)` compila, mas `parseFloat(reserva.total_amount)` dá erro de tipo
   ("number não é atribuível a string") — o dev vai resolver com `as unknown as string`, **reintroduzindo
   exatamente a classe de cast que esta branch existe para eliminar**.

Hoje nada quebra porque o frontend ainda não lê esses campos (`grep` em `apps/` e `packages/`: 0 usos de
`total_amount`/`price_per_night`). A próxima tela que os usar é o rack/fechamento de conta.

**Regra violada:** CA-06.2.c (schema escrito a partir do código do controller); checklist de UI/UX
"valor monetário convertido com `Number()` a partir de string do DECIMAL".

**Correção sugerida:** trocar os 3 para `{ type: 'string', example: '600.00', description: 'DECIMAL
serializado como string' }`, igual ao que já foi feito em `Product.price`, e rodar `pnpm gen:api`.

---

### 🟡 2 [segurança / doc enganosa] O `defaultScope` **não** se aplica a `create()` — e o schema `Payment` afirma que sim

**Onde:** `services/core-service/app/Models/PaymentModel.js:75-87`, `config/swagger.js:225` (descrição do
schema `Payment`), `app/Controllers/PaymentApi/CreatePaymentController.js:29`

**Cenário (medido):** `POST /payments` devolve, no 201, campos que o schema jura que nunca aparecem:

```json
{"id":"...","amount":"300.00","method":"PIX","provider":null,"provider_charge_id":null,
 "pix_qr_code":null,"pix_expiration":null,"deleted_at":null, ...}
```

Provei a causa por SQL: o `INSERT ... RETURNING` traz as 15 colunas e a instância de `create()` mantém
todas (`Object.keys(pay.dataValues)` inclui `pix_qr_code`, `provider`, `provider_charge_id`).
O scope só age em `findAll`/`findOne`/`findByPk` e nos `include` — não em `create`.

Hoje **não vaza**, porque o único fluxo que popula esses campos (`CreateBookingController`) monta a resposta
à mão. Mas a descrição do schema (`:225`) afirma "pix_qr_code, provider e provider_charge_id nunca aparecem
aqui — PaymentModel.defaultScope os exclui sempre". Um dev futuro que ler isso e escrever
`return response.status(201).json(await PaymentModel.create({...provider_charge_id}))` num endpoint de
cobrança PIX vaza a credencial do webhook acreditando estar protegido pelo model.

**Regra violada:** CA-06.2.c (schema ≠ resposta real); Fail Fast / documentação que promete garantia que o
mecanismo não dá.

**Correção sugerida:** ou o `CreatePaymentController` passa a devolver um objeto explícito (allowlist de
campos), ou a descrição do schema `Payment` passa a dizer a verdade ("o defaultScope cobre leitura; em
`create()` a instância ainda traz os campos — não devolva o retorno de `create` cru"). A primeira opção é
melhor e resolve também o 🟡-3.

---

### 🟡 3 [contrato] `PUT /payments/{id}` devolve `amount` como number; `GET` devolve string — o mesmo `$ref` para os dois

**Onde:** `config/swagger.js:918` (PUT 200 → `$ref Payment`) vs `app/Controllers/PaymentApi/UpdatePaymentController.js:15-17`

**Cenário (medido):** `PUT /payments/{id}` com `{"amount":310}` responde `"amount":310` (number), porque
`payment.update()` deixa o valor cru do body na instância e o controller serializa a instância.
O `GET /payments/{id}` do mesmo registro responde `"amount":"310.00"` (string). O schema `Payment` declara
`string` — está errado para a resposta do PUT.

**Regra violada:** CA-06.2.c.

**Correção sugerida:** `await payment.reload()` antes de responder (corrige a API, não só a doc) — assim o
PUT e o GET passam a devolver o mesmo tipo e o `$ref` único fica correto.

---

### 🟡 4 [CA-06.2.b / DRY] Duplicação literal remanescente em `components.schemas`

**Onde:** `config/swagger.js:145-147` e `:168-170` — o objeto `user { id, name }` é escrito duas vezes,
idêntico, em `ReservationListItem` e `ReservationDetail`.

Outras duplicações da mesma natureza, todas verificadas no arquivo:
- `Room.category` inline (`:88-92`: `{id, name, price_per_night}`) duplica `RoomCategory` (`:67-75`) menos
  `capacity` — e é onde mora metade do 🔴-1.
- `Bill.payments[]` inline (`:215-220`) repete 6 propriedades de `Payment`; `Bill.consumptions[]` (`:211-214`)
  repete 4 de `Consumption`.
- `ReservationListPage` é específico de reserva; quando a T-06.10 paginar as outras listas, o envelope
  `{data,total,page,limit}` vai ser copiado n vezes se não virar um schema genérico agora.

**Regra violada:** CA-06.2.b ("sem duplicação literal"), DRY.

**Correção sugerida:** extrair `UserSummary` (`{id,name}`) e `CategorySummary`, e criar um envelope de
paginação reutilizável antes da T-06.10 começar (é o momento mais barato).

---

### 🟡 5 [teste] Nenhum teste protege o ganho — a próxima rota pode nascer sem `content` e nada falha

**Onde:** `services/core-service/tests/` (18 arquivos; `grep -rln "swagger\|openapi" tests/` → **0 resultados**)

**Cenário:** um dev adiciona `GET /reservations/{id}/invoice` sem `content` na 200. A suíte passa, o
`qa_checks.sh` no máximo emite **aviso** (`report_warn`, que não bloqueia — comprovei: exit 0 com 3 avisos),
o `pnpm gen:api` gera `content?: never` e o frontend volta ao `as unknown as`. A regressão de 79% de
respostas sem schema é reconstituível sem nenhum sinal vermelho.

**Regra violada:** checklist "feature nova sem teste"; a T-06.2 entrega um invariante e não o trava.

**Correção sugerida:** um teste de ~15 linhas importando `config/swagger.js` e iterando os paths:
`expect(resposta2xx.content).toBeDefined()` para todo código 2xx ≠ 204. É o mesmo script que já foi usado
para medir — falta só virar teste.

---

### 🟡 6 [escopo / contrato] 22 rotas de 3 routers B2B continuam 100% fora do Swagger — a métrica "54/54" não as conta

**Onde:** `routes/apis/corporateClientRouter.js` (5 rotas), `routes/apis/eventQuoteRouter.js` (8),
`routes/apis/contractRouter.js` (9) — confirmado pelo aviso do próprio `qa_checks.sh`.

**Cenário:** "54 respostas 2xx, 0 sem schema" mede só o que já estava **declarado** em `paths`. Quem ler a
métrica conclui que a API está documentada; na prática o módulo B2B inteiro (clientes corporativos,
orçamentos de evento, contratos — incluindo `GET /contracts/{id}/pdf`, que gera PDF com **CPF e RG de
representante legal**) não existe para o cliente tipado. O `roomCategoryRouter` no mesmo aviso é falso
positivo (o grep procura `room-category` no singular; `/room-categories` está documentado).

**Regra violada:** CLAUDE.md §7 "endpoint ausente do Swagger quebra o cliente tipado"; CA-06.2.a é atendido
só porque o frontend ainda não usa esses endpoints.

**Correção sugerida:** registrar como pendência explícita na SPEC-06 (T-06.2 "fase 2 — módulo B2B") em vez de
deixar a métrica sugerir cobertura total.

---

### 🟡 7 [contrato] Os schemas omitem campos que a API realmente manda — o cast volta por esse buraco

**Onde:** todos os schemas de entidade em `config/swagger.js`. Comparação automática schema × resposta real
(25 endpoints exercitados contra o banco):

| Resposta real contém, schema não documenta | Onde |
|---|---|
| `tenant_id`, `created_at`, `updated_at`, `deleted_at` | Guest, Room, RoomCategory, Reservation, User, Product, Payment, Consumption |
| `source` | Reservation (GET/POST/check-in/check-out) |
| `deleted_by` (UUID do usuário) | Consumption |
| `pix_expiration` | Payment (GET /payments e /payments/{id}) |

**Cenário:** a tela de detalhe do hóspede quer mostrar "cadastrado em"; `guest.created_at` **não existe** no
tipo gerado → erro de compilação → o dev resolve com cast. Mesmo buraco de antes, em campo diferente.
Secundariamente, `deleted_at`/`deleted_by` são mecânica interna de soft delete saindo na API sem estar no
contrato.

**Regra violada:** CA-06.2.c (schema fiel ao que o controller devolve).

**Correção sugerida:** incluir `created_at`/`updated_at` nos schemas de entidade (são úteis ao frontend) e
restringir `deleted_at`/`deleted_by` na query (`attributes`) em vez de deixá-los vazar sem contrato.

---

### 🟡 8 [LGPD art. 6º III — minimização] `GET /guests` devolve CPF de todos os hóspedes, e agora isso virou contrato

**Onde:** `app/Controllers/GuestApi/ListGuestController.js:6` (`findAll` sem `attributes`),
`config/swagger.js:101` (`Guest.cpf` no schema usado pela resposta 200 da lista)

**Cenário:** a listagem de hóspedes (usada pela tela de busca e pelo histórico de estadias) trafega o CPF de
toda a base do tenant para o navegador, embora a lista só exiba nome/e-mail/telefone. Qualquer XSS, extensão
de navegador ou log de proxy captura a base de CPFs inteira, não um por vez.

Chama atenção a assimetria: nesta mesma branch, ao documentar `/payments`, o autor **corrigiu** o vazamento
antes de documentá-lo (defaultScope); ao documentar `/guests`, **documentou** o excesso.

**Regra violada:** LGPD art. 6º, III (minimização); checklist "findAll sem `attributes` devolve o model inteiro".

**Correção sugerida:** `attributes: ['id','full_name','email','phone']` no `ListGuestController` (o CPF
continua em `GET /guests/{id}`), e tirar `cpf` do schema da lista. Como muda contrato, cabe tarefa própria.

---

### 🟡 9 [frontend / fail-open] O guard de `GuestDetailPage` transforma mudança de contrato em "nenhuma estadia"

**Onde:** `frontend/apps/pms/src/features/guests/GuestDetailPage.tsx:27`
`const all = Array.isArray(data) ? data : (data?.data ?? []);`

**Cenário:** compila e está correto para o contrato de hoje (verifiquei: o `oneOf` vira a união
`ReservationListItem[] | ReservationListPage`, e o `Array.isArray` estreita os dois lados). O problema é o
`?? []` no ramo else: a **T-06.10 desta mesma SPEC** vai padronizar paginação em todas as listagens e o
envelope ainda não está decidido. Se sair `{items, total}` em vez de `{data, total}`, `data.data` vira
`undefined`, o `?? []` engole, e a tela mostra "Nenhuma estadia registrada" para um hóspede com 4 estadias —
sem erro, sem log, sem sinal. Falha silenciosa em dado de histórico.

**Regra violada:** fail-safe em vez de fail-open (CLAUDE.md §7 é explícito sobre allowlist vs blocklist);
checklist "estado de erro ausente".

**Correção sugerida:**
`if (Array.isArray(data)) return ...; if (data && 'data' in data) return ...; throw new ApiError('Formato de resposta inesperado em /reservations', 500);`

---

### 🟢 10 [contrato] 41 das 107 respostas 4xx/5xx ainda não declaram `content`

Medido por script próprio sobre o `openapi.json`. Fora do CA-06.2.a (que fala em 2xx), mas é a metade do
problema original: no `openapi-fetch` o `error` dessas respostas é `never`, então ler `error.error` para
exibir a mensagem do backend exige cast. `/products` (11), `/analytics` (16) e `/address` (3) concentram o
grosso. Hoje o frontend contorna com mensagens genéricas no `ApiError`.

### 🟢 11 [doc] `ReservationDetail.room` e `.rooms[]` apontam para `Room`, que tem `category` — e o controller não inclui categoria

`config/swagger.js:167` e `:171` vs `GetReservationController.js:76-80`. Confirmei na resposta real:
`detail.room.category === undefined`. Não quebra tipo (a propriedade é opcional) e a própria descrição de
`Room.category` enumera onde ela aparece — mas quem lê o `ReservationDetail` vai supor
`reservation.room.category.price_per_night` disponível.

### 🟢 12 [segurança] O `defaultScope` é padrão seguro, não garantia — dois bypasses continuam abertos

Provei que ele protege o caso que importa (inclusive `include` **sem** `attributes`: o SQL sai sem as 3
colunas). Mas: (a) qualquer chamador que passe `attributes` explícito sobrescreve o scope — as opções da
query vencem o scope no merge do Sequelize; (b) SQL cru ignora o scope por completo — há 7 controllers de
analytics com `sequelize.query`, e eu li os 3 que tocam `payments`: nenhum seleciona `provider*`/`pix_qr_code`
(agregam `amount`/`method`), então **não há vazamento hoje**. Vale o registro para a próxima query crua.

### 🟢 13 [coordenação] A T-06.10 (paginação, trilha do Sirlande) **não começou** — confirmado, sem conflito

`git branch -a` não tem branch de paginação; `git log --all --grep="T-06.10"` só retorna a linha da própria
SPEC; `docs/specs/SPEC-06:181` mantém a T-06.10 como 🔲. Porém esta branch **fixa** o envelope
`{data,total,page,limit}` para `/reservations` — quem pegar a T-06.10 deve reusar esse formato e promovê-lo a
schema genérico (ver 🟡-4), não inventar um segundo.

### 🟢 14 [processo] Sem relatório de sessão e SPEC-06 ainda com T-06.2 em 🔲

CLAUDE.md §6 exige `docs/historico_sessao/<dev>/<titulo>_<ddMMyyyy>.md` por sessão; o diff tem 8 arquivos, nenhum
em `docs/`. Se a sessão ainda está aberta, é só pendência de fechamento — registro para não ser esquecido no merge.

---

## Achados pré-existentes, fora do diff (não pesam no veredito)

1. **`DELETE /payments/:id` sem `requireRole('ADMIN')` e sem trilha de auditoria** —
   `routes/apis/paymentRouter.js:19` só aplica `authMiddleware`. Qualquer papel autenticado do tenant
   (inclusive `WAITER`, que existe em `VALID_ROLES`) apaga um pagamento; `DeletePaymentController.js:13` faz
   `payment.destroy()` sem gravar quem apagou. Comparar com `DeleteConsumptionController.js:18`, que exige ADMIN
   **e** grava `deleted_by`. Efeito: o `balance_due` do `GET /bill` aumenta e não há como saber quem causou.
   Severidade real 🔴 se aberta como tarefa própria.
2. **`provider_charge_id` sem índice UNIQUE** — `db/schema.sql:165` e `PaymentModel` não declaram unicidade,
   mas `PixWebhookController.js:48` faz `findOne({where:{provider_charge_id}})` assumindo unicidade global
   ("A cobrança é única globalmente"). Com duas linhas de mesmo charge id, o webhook confirma uma arbitrária.
3. **`PublicBookingResponse` devolve `provider_charge_id` ao hóspede** (`config/swagger.js:328`) — o próprio
   schema documenta que é achado pré-existente (`redteam_public-booking-leak_16set2026.md`). Continua aberto:
   quem cria uma reserva recebe a credencial que o webhook aceita; a assinatura HMAC da T-06.9 é o que segura.

---

## O que foi verificado e está correto (prova de cobertura)

- **Webhook PIX sobrevive ao scope — verificado por SQL, não por "os testes passam".** Instrumentei o logger
  do Sequelize:
  `SELECT "id","tenant_id","reservation_id","amount","method","status","kind","pix_expiration","paid_at",... FROM "payments" WHERE ("deleted_at" IS NULL AND "provider_charge_id" = 'probe_...') LIMIT 1;`
  — a coluna sai do `SELECT` e continua no `WHERE`. Achou o registro certo.
- **`payment.save()` em instância parcialmente carregada não apaga nada.** SQL gerado:
  `UPDATE "payments" SET "status"=$1,"paid_at"=$2,"updated_at"=$3 WHERE "id"=$4` — só as colunas alteradas.
  Reli com `unscoped()`: `provider_charge_id`, `pix_qr_code` e `provider` intactos no banco.
- **Nenhum caminho de código lê os 3 campos de uma instância já carregada.** `grep` em `app/` retorna 4
  arquivos: `CreateBookingController` (usa o objeto `charge` do provider, não o model), `GetBookingStatus`
  e `GetBill` (ambos com `attributes` explícito que não pede os campos) e o webhook (só no `where`).
  Não falta nenhum `unscoped()`.
- **O `include` sem `attributes` fica protegido** — cenário do "dev que esquece": o SQL do join sai sem as 3
  colunas. A defesa por model realmente funciona.
- **O teste novo não é falso negativo.** Confirmei que `POST /payments` (recepção) grava `provider`,
  `provider_charge_id` e `pix_qr_code` como `null` — testar o vazamento com um pagamento manual passaria
  verde por ausência de dado. O teste usa `POST /public/:subdomain/bookings` (único fluxo que popula) e tem
  controle positivo com `unscoped()`. Desenho correto.
- **`oneOf` gerou união legível, não tipo degenerado.** `schema.d.ts:1576`:
  `components["schemas"]["ReservationListItem"][] | components["schemas"]["ReservationListPage"]`;
  o 400 de `/public/{subdomain}/bookings` (`:194`): `ValidationErrors | Error`. Sem `any`/`unknown`.
- **Schemas conferidos propriedade a propriedade contra a resposta real e exatos:** `Bill` (13/13,
  incluindo `payments[]` e `consumptions[]` com `amount` convertido para number pelo controller),
  `ReservationListPage`, os três objetos resumidos de `ReservationListItem` (`guest`/`room`/`user`),
  `LoginResponse`, `RegisterResponse`, `Tenant`, `PublicHotel`, `PublicAvailability`,
  `PublicBookingResponse`, `PublicBookingStatus`, e `Payment.reservation` (com `total_amount` presente só
  no `/payments/{id}`, exatamente como a descrição diz).
- **`Payment` pós-defaultScope bate:** `GET /payments` e `GET /payments/{id}` não devolvem
  `pix_qr_code`/`provider`/`provider_charge_id` (sobram só os campos do 🟡-7).
- **Sem drift no cliente gerado:** `pnpm gen:api` deixou o `git status` vazio.
- **ESM puro:** nenhum `require()` no diff. Nenhuma rota nova (ordem `/:id` × rota literal não foi afetada).
  Nenhuma escrita multi-tabela nova. Nenhuma query nova sem `tenant_id`.

## Não foi possível verificar

- **Comportamento com um PSP real.** O `PixProvider` real não existe (`app/services/pix/index.js` só
  registra `fake`); o efeito do `defaultScope` sobre um `RealPixProvider` que precise reler
  `provider_charge_id` do banco é inferência — ele vai precisar de `unscoped()` explícito.
- **Swagger UI renderizado.** Validei o objeto que o `swagger-jsdoc` produz e o `openapi.json`, não a página
  em `/api-docs` num browser.
- **Se a sessão da branch já foi encerrada** — o 🟢-14 (relatório de sessão / SPEC-06 em 🔲) pode ser só
  pendência de fechamento, não omissão.
- **Rodei a suíte num banco separado** (`gestao_hotel_test_qa3`, criado e destruído nesta auditoria) para não
  truncar o `gestao_hotel_test` que a outra worktree pode estar usando. `.env.test` foi restaurado ao valor
  original e o working tree está limpo.
