# QA Red Team — T-04.1 Comanda (`/accounts`, Blocos B, C e D)

**Branch:** `feature/t04-1-accounts` (`86a7b8c`) · **Dev:** Sirlande · **Base:** develop@`1cbc4c0` · **Data:** 19/10/2026
**Recortes auditados:**
1. Diff da branch (`git diff develop...HEAD`): Blocos C e D. São 16 arquivos: 5 controllers `AccountApi/`, `accountRouter.js`,
   `router.js`, `accountRuleViolation.js`, `accountTotal.js`, `productValidation.js`, `config/swagger.js`,
   `tests/accounts.test.js`, `tests/account-items.test.js`, além da SPEC, do anexo e do relatório de sessão.
2. Bloco B, já em `develop` e ainda sem auditoria (`dd1a15e`, `e7ad820`, `34a20ca`, `8cce937`): `AccountModel.js`,
   `AccountItemModel.js`, `accountEnums.js`, `database/relations.js`, `applyAccountConstraints`, `db/schema.sql` §9d e
   `tests/accounts-db.test.js`.

Também li, para contexto, `auth.middleware.js`, `tenant.middleware.js`, `app/utils/roles.js`, `isUuid.js` e
`CheckOutController.js`.

**Método:** leitura do código e uma suíte de sondas temporária (`tests/zz_redteam_scratch.test.js`), executada contra o
banco de teste e **apagada depois**. A working tree está limpa. Os resultados citados como "reproduzido" saíram dela.

**Achados no escopo:** 9 (🔴 0 · 🟡 3 · 🟢 6) · **Repassados:** 0

## Veredito

**APROVADO COM RESSALVAS**

Procurei vazamento entre hotéis em todos os caminhos e não achei nenhum: `findOne` com `tenant_id`, `client_item_id`
indexado por tenant, include sem hóspede nem reserva e FKs validadas no controller. Nenhum caminho encontrado cobra
duas vezes. Disparei 6 reenvios **paralelos** do mesmo `client_item_id`: o resultado foi um 201 e cinco 200, com 1 linha
no banco. A corrida real da RN-005, com 5 aberturas paralelas, deu um 201 e quatro 422, sem nenhum 500. O garçom não
alcança o DELETE, não abre ROOM, DAY_USE nem INTERNAL e não lança cortesia.

As 3 ressalvas 🟡 não reprovam a branch, mas tocam dinheiro ou contrato e devem ser resolvidas antes da T-04.3:
1. `quantity` acima do limite de `INTEGER` responde **500**. Reproduzido.
2. Com lançamento avulso a `unit_price: 0`, o **garçom dá cortesia sem motivo** e fora do relatório de cortesia, o que
   contorna a intenção da CA-04.1.l. Reproduzido.
3. Conta ROOM **continua aceitando consumo depois do check-out**, e conta INTERNAL soma itens faturáveis no `total`.
   Reproduzido.

---

## Achados no escopo

### 🟡 1 [HTTP 500 / contrato] `quantity` acima de 2.147.483.647 vira 500
**Onde:** `services/core-service/app/Controllers/AccountApi/CreateAccountItemController.js:30` (só valida inteiro > 0),
`:121-125` (o teto só olha o total em centavos) · coluna `quantity INTEGER` (`AccountItemModel.js:157`, `schema.sql:302`)
**Cenário (reproduzido):**
- `POST /accounts/:id/items` com `{ description: 'x', unit_price: 0, quantity: 3000000000 }` → **500**.
- `{ unit_price: '0.01', quantity: 2147483648 }` → **500**. O total de 21,47 milhões fica abaixo de `MAX_TOTAL_CENTS`, a
  validação passa e o Postgres recusa com `22003 integer out of range`.

O cliente tipado também não é avisado: o Swagger declara `quantity: { type: 'integer', minimum: 1 }` sem `maximum`.
**Regra violada:** "código HTTP que vira 500". O próprio `productValidation.js:3` existe para evitar isso no preço.
**Correção sugerida:** em `validateInput`, aplicar `body.quantity <= 2147483647`. Um teto operacional (ex.: 9999) seria
ainda mais adequado a uma comanda. Espelhar o valor como `maximum` no Swagger e acrescentar um teste.

### 🟡 2 [dinheiro / papéis] Garçom dá cortesia disfarçada: item avulso faturável a preço zero (ou abaixo do cardápio)
**Onde:** `CreateAccountItemController.js:39-49` (avulso aceita qualquer `unit_price >= 0` de qualquer papel) e `:99-102`
(a trava de cortesia só olha `billable`)
**Cenário (reproduzido com token WAITER):**
- `POST /accounts/:id/items` com `{ description: 'Cerveja', unit_price: 0, quantity: 10 }` → **201**, `billable: true`,
  `reason: null`, `account_total: '0.00'`.
- Com `unit_price: '0.01'` → 201 e 10 cervejas por R$ 0,10. O cardápio cobra R$ 18,50.

O efeito é o mesmo de uma cortesia. A diferença é que o lançamento escapa da regra "garçom não dá cortesia sozinho"
(CA-04.1.l, D-8) e não aparece no relatório "quanto demos de cortesia?" (RN-007, T-04.7), porque está gravado como
item faturável.
**Regra violada:** intenção da CA-04.1.l e da RN-007. A CA-04.1.b autoriza o avulso, mas não diz quem pode fixar o preço.
Por isso a severidade é 🟡 e o ponto pede **decisão do dono**, não é defeito de implementação.
**Correção sugerida:** escolher uma destas opções:
- (a) `WAITER` só lança com `product_id`, e o avulso fica restrito a ADMIN e RECEPTIONIST;
- (b) avulso do garçom com `unit_price > 0`.

Registrar a escolha como decisão no anexo e cobrir com teste.

### 🟡 3 [dinheiro / regra de negócio] Conta ROOM aceita consumo depois do check-out; conta INTERNAL soma itens faturáveis
**Onde:** `CreateAccountItemController.js:137` (só confere `status === 'OPEN'` da conta) ·
`CreateAccountController.js:107-108` (o comentário supõe que "depois do check-out a conta da suíte já deveria estar
fechada", mas nada a fecha) · `CheckOutController.js` (não conhece `accounts`) · `app/utils/accountTotal.js:24` (soma
`billable: true` sem considerar o tipo da conta)
**Cenário A (reproduzido):** o fluxo foi reserva, check-in, abertura da conta ROOM e `PUT /reservations/:id/check-out`
(200). Em seguida o garçom fez `POST /accounts/:id/items` → **201**, e a conta continua `OPEN`. O hóspede já foi embora,
então o consumo lançado depois disso fica sem ninguém para pagar, ou vira cobrança posterior sem respaldo.
**Cenário B:** a recepção abre conta `INTERNAL` (refeição de funcionário) e o garçom lança `{ product_id }` com o
`billable` padrão `true`. O `GET /accounts/:id` devolve `total` > 0 numa conta que, pela RN-006, nunca é receita, e a
CA-04.3.f exige que ela feche com `total: 0`. Hoje o banco aceita, e a API produz esse dado.
**Regra violada:** RN-006; CA-04.3.f, que é herdada; máquina de estados da reserva × conta.
**Correção sugerida:**
- (A) Ao lançar em conta ROOM, recusar com 422 se `reservation.status !== 'CHECKED_IN'`. É uma consulta, e ela pode ficar
  sob o mesmo lock.
- (A, alternativa) Registrar na T-04.3 que o check-out precisa fechar ou bloquear as contas ROOM abertas.
- (B) Decidir já: em conta `INTERNAL`, ou o item é forçado a `billable: false` com `reason` (`STAFF`/`INTERNAL_USE`), ou
  `accountTotal` devolve 0 para INTERNAL. Registrar no anexo.

### 🟢 4 [idempotência] Reenvio na corrida com `:id` em maiúsculas devolve 409 em vez de 200
**Onde:** `CreateAccountItemController.js:170` passa o `accountId` **da URL** para `replay`, que compara com `!==` em
`:65`. O caminho normal (`:96`) usa `account.id`, que vem do banco.
**Cenário (reproduzido com o mesmo mock da suíte):** `POST /accounts/<ID-EM-MAIÚSCULAS>/items` reenviando um
`client_item_id` existente, com a busca prévia perdendo a corrida → **409** "client_item_id já usado em outra conta".
A conta é a mesma, e o esperado seria 200. O `isUuid` aceita maiúsculas e o Postgres acha a conta.
O impacto é baixo, porque o app monta a URL com o id devolvido pelo servidor, já em minúsculas.
**Correção sugerida:** em `:170`, passar `account?.id ?? accountId`, ou normalizar com `toLowerCase()`.

### 🟢 5 [dinheiro] Preço avulso com mais de 2 casas é arredondado em silêncio
**Onde:** `CreateAccountItemController.js:117` (`Math.round(parsePrice(...) * 100)`)
**Cenário (reproduzido):**
- `unit_price: '10.005'` grava `10.01`.
- `unit_price: '1.999', quantity: 3` grava `2.00` e total `6.00`, quando o cliente esperava 5,997.

Não há perda relevante, mas o valor gravado difere do enviado sem aviso.
**Correção sugerida:** responder 400 quando houver mais de 2 casas decimais, com regex `^\d+(\.\d{1,2})?$` só para o
item. Outra saída é documentar o arredondamento no Swagger.

### 🟢 6 [defesa em profundidade] `accountTotal` soma por `account_id` sem `tenant_id`
**Onde:** `app/utils/accountTotal.js:24`
**Cenário:** hoje todos os chamadores já validaram a conta por tenant, então não há vazamento. A T-04.3 (`/bill`) vai
reusar o utilitário, e um chamador futuro que passe um `account_id` não validado somaria itens de outro hotel. Para
dinheiro, o filtro custa uma linha.
**Correção sugerida:** assinatura `accountTotal(accountId, tenantId, transaction)` com `where: { tenant_id, account_id, billable: true }`.

### 🟢 7 [LGPD / KISS] Listagem sem paginação expõe todo o histórico de `label` ao garçom
**Onde:** `ListAccountController.js:36` (`findAll` sem `limit`)
**Cenário:** o garçom chama `GET /accounts` sem filtro e recebe todas as contas da história do hotel, inclusive `PAID`.
Pela D-15, a recepção decide o `label`, e os próprios exemplos do projeto (`AccountModel.js:66`, testes) usam
"Suíte 101 — João". Na prática, o garçom acumula nome de hóspede de estadias encerradas, e a lista cresce sem limite.
**Correção sugerida:** paginar como `/reservations` (`page` e `limit`, com máximo de 100) ou, para o WAITER, aplicar
`status=OPEN` como padrão. Trocar os exemplos do model e do Swagger por rótulos sem nome ("Suíte 101", "Mesa 5").

### 🟢 8 [validação] `label` e `description` sem tamanho máximo
**Onde:** `CreateAccountController.js:35`, `CreateAccountItemController.js:40` · colunas `TEXT`
**Cenário (reproduzido):** `label` com 50.000 caracteres → 201, e o valor vai para a tela do celular do garçom. Não
gera 500, porque a coluna é `TEXT` e o limite do body é o do `express.json`, mas é dado sem uso operacional.
**Correção sugerida:** limite de 100 a 120 caracteres no controller, com o 400 já existente.

### 🟢 9 [documentação] O anexo de decisões está atrás do código
**Onde:** `docs/specs/anexos/SPEC-04-decisoes-T-04.1.md:4` (Bloco D 🔲), `:65` (reenvio de item excluído "ainda está em
aberto"), `:131` (ponto em aberto 1)
**Cenário:** o código já decidiu o reenvio de item excluído (200 com `deleted_at`), além de "reason em faturável → 422",
"excluir em CLOSED/PAID → 422" e "preço com `product_id` ignorado". O anexo ainda trata isso como aberto. O dono
já sabe; registro aqui para não fechar a T-04.1 sem esse registro. Os 🟡 2 e 3 também pedem entrada como decisão.

---

## Repassados a outro dev

Nenhum. O único ponto que toca código fora do diff é o `CheckOutController.js`, que não fecha as contas ROOM. Ele está
no 🟡 3, porque a integração é da própria trilha (T-04.3), e não foi repassado.

---

## O que foi verificado e está correto

**Multi-tenancy**
- Os 5 controllers usam `tenantId` do JWT e `findOne` com `tenant_id` (conta, produto, reserva, quarto, hóspede, item),
  sem nenhum `findByPk`. `ReservationRoomModel.findOne` (`CreateAccountController.js:117`) não filtra tenant, mas os dois
  ids já foram validados por tenant logo antes.
- `client_item_id` é buscado e indexado por `(tenant_id, client_item_id)`. O mesmo id em outro hotel gera item
  independente, e o 409 "outra conta" só ocorre dentro do mesmo hotel, então não serve de oráculo entre hotéis.
- Conta, item e produto de outro hotel → 404. Na DELETE, o item é buscado por `id + account_id + tenant_id`.

**Papéis**
- A allowlist do WAITER (`roles.js:19-26`) cobre exatamente GET lista, GET `/:id`, POST conta e POST item. DELETE fica
  fora, e a rota ainda tem `requireRole('ADMIN')`. Maiúsculas, `//` e sufixos (`/bill`, `/close`) caem no negado.
- A trava de papel para tipo de conta (`CreateAccountController.js:77`) e para cortesia (`CreateAccountItemController.js:100`)
  é feita no servidor, não pelo cliente.

**Dinheiro**
- O cálculo é feito em centavos inteiros. `total` e `unit_price` nunca vêm do cliente, e o preço do cardápio prevalece
  sobre o enviado. A soma é feita no Postgres como `numeric(14,2)::text`.
- Cortesia continua gravada e fica fora da soma, e item excluído também fica fora (testado).
- Concorrência real, com sondas paralelas e não só mock:
  - 6 reenvios simultâneos dão 1 linha.
  - O mesmo `client_item_id` em 2 contas simultâneas dá 201 + 409.
  - DELETE + POST simultâneos dão 204 + 201 com total correto.
  - RN-005 com 5 aberturas paralelas dá um 201 e quatro 422.
- `FOR UPDATE` na conta é feito antes de checar o status, tanto no lançamento quanto na exclusão.
- `deleted_by` e `deleted_at` saem no mesmo UPDATE (D-7).

**LGPD**
- As respostas não incluem guest nem reservation (D-18), e o include de itens só traz ids de usuário.
- `console.error` registra só `error.message`. As mensagens do pg para CHECK, unique e out-of-range não carregam
  valores da linha.

**Bloco B (dados)**
- Paridade model × `schema.sql` × `applyAccountConstraints` conferida nos nomes de constraint: 6 CHECKs de `accounts`,
  5 de `account_items`, `accounts_lodging_unique` parcial com o mesmo predicado e
  `account_items_client_item_tenant_unique` total, fora do model, conforme D-6 e D-11.
- Os enums vêm de `accountEnums.js` nos três lugares, menos no `schema.sql`, onde estão literais idênticos.
- FKs: `tenant_id` CASCADE; reserva, quarto, hóspede, produto e usuários RESTRICT; `account_id` CASCADE. Tudo coberto
  por teste de `confdeltype`.
- Sonda: `DELETE FROM tenants` com conta e itens funciona, porque a cascata não trava no RESTRICT.
- Índices `(tenant_id, status)`, `reservation_id` e `account_id` presentes nos dois caminhos de provisionamento.

**Projeto**
- ESM puro, sem `require()`.
- Rotas literais não são capturadas por `/:id`, porque `/:id/items` é mais longa e não colide.
- Allowlists (`ACCOUNT_TYPES`, `ACCOUNT_STATUSES`, `ITEM_REASONS`) também nos filtros da listagem. Filtro em array
  (`?status=A&status=B`) → 400.
- `accountRuleViolation` só traduz constraints conhecidas, e o resto segue para 500 (D-17).

**Swagger**
- Os 4 paths e os 4 schemas batem com as respostas reais: chaves de `Account` e `AccountItem` conferidas contra a
  resposta do GET, `AccountItemResult` com `item` e `account_total`, DECIMAL como string e códigos
  200/201/400/403/404/409/422.
- A única divergência é o `maximum` ausente em `quantity` (🟡 1).

## Não foi possível verificar

- **Cobertura de linhas** da branch: não rodei `test:coverage` porque a sonda priorizou cenários. A suíte do dono cobre
  todos os controllers, inclusive os ramos de erro principais.
- **Fluxo offline real do app do garçom:** o frontend não está no diff. A idempotência foi provada só do lado da API.
- **Revisão humana de regra de hotel:** se o garçom deve ou não lançar avulso (🟡 2) e o que o check-out faz com a
  conta da suíte (🟡 3) são decisões de produto, fora do alcance do auditor automático (§11.2 da divisão de trabalho).
