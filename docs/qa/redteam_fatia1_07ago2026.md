# QA Red Team — Fatia 1: catálogo de produtos (cardápio)

**Branch:** `feature/product-catalog` · **Base:** `develop@3f00ea1` · **Data:** 07/08/2026
**Rodadas:** 2 (auditoria em `6c31c5b` · reauditoria em `0ffee68`)

---

# Reauditoria — commit `0ffee68`

**Data:** 07/08/2026 (mesmo dia) · **Arquivos reauditados:** 11 do commit de correção + 3 bancos temporários

## Veredito da reauditoria

**APROVADO COM RESSALVAS** — o 🔴 está fechado, verificado, não acreditado.

Placar: **13 dos 15 achados originais resolvidos**, 2 aceitos como decisão de produto,
**4 ressalvas novas** (🟡 3 · 🟢 1) que nasceram do próprio commit de correção ou que ele
deixou de fora. Nenhuma bloqueia merge; três são baratas e a de `description` é a mesma
classe de bug que o commit acabou de eliminar em todos os outros campos.

Método desta rodada: novo arquivo de sondagem descartável (`tests/zzprobe2.test.js`, removido),
inspeção direta de `pg_indexes` e `pg_constraint`, três bancos temporários
(`qa_probe_db`, `qa_probe2`, `qa_p3` — todos dropados) para exercitar migrate limpo,
migrate idempotente e **caminho de upgrade**. Working tree devolvido limpo.

## Placar dos achados da primeira rodada

| # | Achado | Status | Como verifiquei |
|---|---|---|---|
| 🔴 1 | Nome queimado após DELETE (unique total em model paranoid) | ✅ **Resolvido** | `pg_indexes` mostra `... WHERE (deleted_at IS NULL)` no banco de teste e no migrado; ciclo criar→deletar→recriar devolve 201/204/**201** |
| 🟡 2 | `price`/`active` sem tipo → 500 | ✅ **Resolvido** | matriz de 15 entradas, todas 400 com mensagem acionável |
| 🟡 3 | `:id` não-UUID → 500 | ✅ **Resolvido** | GET/PUT/DELETE com `nao-e-uuid` → 404; UUID quase-válido (`...G`) → 404 |
| 🟡 4 | CHECKs só existiam no `schema.sql` | ⚠️ **Parcial** | migrate agora cria os dois; **o banco de teste continua sem eles** → ressalva R1 |
| 🟡 5 | Allowlist copiada 4× no `config/swagger.js` | ✅ **Resolvido** (com efeito colateral) | `grep "'FOOD'"` não retorna mais nada em `config/`; mas apareceu uma cópia nova em `command.js` → ressalva R2 |
| 🟡 6 | Lacunas de teste (delete→recriar, DELETE cross-tenant, `?active=false`, RECEPTIONIST) | ✅ **Resolvido** parcialmente | 36 testes passam; RECEPTIONIST continua sem teste, mas verifiquei manualmente de novo (GET 200 / POST 403) |
| 🟡 7 | Check-then-act sem tratamento de unique violation | ✅ **Resolvido e agora provado** | 3 POSTs simultâneos com o mesmo nome → `201,409,409`, exatamente **1** linha criada. Na primeira rodada isto era SUSPEITA; agora é fato nos dois sentidos |
| 🟢 8 | `.every()` vacuamente verdadeiro | ✅ Resolvido | `length > 0` adicionado nos dois pontos |
| 🟢 9 | "WAITER lê o cardápio" só assere status | ✅ Resolvido | passou a conferir conteúdo (`length > 0`, `name`, `price`) |
| 🟢 10 | `DELETE` sem `deleted_by` | 🔲 Aberto | inalterado — segue como pendência de baixa prioridade |
| 🟢 11 | `price: 10.999` arredonda em silêncio | ✅ **Aceito, sem ação** | concordo com a decisão (ver abaixo) |
| 🟢 12 | `RECEPTIONIST` não mantém o cardápio | ✅ **Aceito, sem ação** | concordo com a decisão (ver abaixo) |
| 🟢 13 | Swagger `Product` omite timestamps | 🔲 Aberto | inalterado; dívida consistente com os outros schemas |
| 🟢 14 | `?category=` vazio → 400 | 🔲 Aberto | inalterado |
| 🟢 15 | `name` aceita array / sem limite de tamanho | ⚠️ **Metade** | array/número/objeto agora → 400 ✅; 500 caracteres continuam passando com 201 |

## Sobre os dois pontos que você decidiu não mudar

**`RECEPTIONIST` sem escrita no cardápio — concordo, sem ressalva.** "Mais restritivo que a
spec é defensável, mais permissivo não seria" é exatamente o critério certo, e alinhar ao
`roomCategoryRouter` mantém o modelo mental do sistema em uma regra só ("configuração é ADMIN").
Único pedido: quando a Fase 2 do frontend desenhar a tela de cardápio, isso volta como pergunta
de UX — vale uma linha no relatório de sessão para o J3 não descobrir na tela.

**Arredondamento de `DECIMAL(10,2)` — concordo, sem ressalva.** Era 🟢 de UX, não defeito.
Rejeitar 3 casas seria mais atrito do que valor. Fechado.

## Ressalvas novas

### 🟡 R1 — O banco onde os testes rodam continua **sem** os CHECKs; a premissa da correção está errada

**Onde:** `command.js:44-59` (correção aplicada) versus `tests/setup/globalSetup.js:38`

A mensagem do commit diz: *"O banco de testes, criado por migrate, não os tinha."*
O banco de testes **não é criado por migrate**. É criado por `globalSetup.js` com
`sequelize.sync({ force: true })`, que nunca passa por `command.js`. A correção, portanto,
não alcança o ambiente onde toda a verificação automatizada acontece.

**Cenário (reproduzido dentro da suíte, contra o banco de teste real):**

```sql
SELECT conname FROM pg_constraint WHERE conrelid='products'::regclass;
→ products_pkey, products_tenant_id_fkey     -- nenhum CHECK

INSERT INTO products (..., category, ...) VALUES (..., 'SOBREMESA', ...);   → PASSOU
INSERT INTO products (..., price, ...)    VALUES (..., -5, ...);            → PASSOU
```

Em contrapartida, o caminho do migrate **ficou correto** — verifiquei em banco limpo:

```
products_price_non_negative | CHECK ((price >= (0)::numeric))
products_category_allowlist | CHECK ((category = ANY (ARRAY['FOOD','DRINK','SERVICE','OTHER'])))
```

Ou seja, o drift diminuiu (schema.sql ✅, migrate ✅) mas mudou de lugar: agora é
**produção ✅ × teste ❌**. Consequência prática: nenhum teste pode exercitar a barreira de
banco, e um teste futuro que tente ("o banco rejeita categoria inválida") passaria por engano —
ele estaria provando a validação de aplicação, não o CHECK.

**Regra violada:** o ambiente de teste deve refletir o de produção; fail-safe em camada única
onde se acredita haver duas.

**Correção sugerida:** `globalSetup.js` roda as mesmas duas queries idempotentes depois do
`sync({ force: true })` — ou, melhor, extrair o bloco de "objetos que o Sequelize não gerencia"
de `command.js` para `database/applyDbConstraints.js` e chamá-lo dos dois lugares. Isso também
resolve a EXCLUDE constraint de anti-double-booking, que hoje o `globalSetup` documenta como
ausente nos testes.

---

### 🟡 R2 — A correção de DRY tirou 4 cópias do Swagger e criou 1 nova em `command.js`, e essa é congelada

**Onde:** `command.js:53-56`

```js
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_category_allowlist') THEN
    ALTER TABLE products ADD CONSTRAINT products_category_allowlist
        CHECK (category IN ('FOOD', 'DRINK', 'SERVICE', 'OTHER'));
```

Dois problemas somados:

1. **É cópia literal em arquivo JS.** `config/swagger.js` acabou de provar que dá para importar
   `PRODUCT_CATEGORIES` — `command.js` também pode e não o fez. O repo saiu de 5 cópias
   literais para 2 (`db/schema.sql`, que é aceitável porque SQL não importa JS, e esta, que não é).
2. **A guarda por nome congela a constraint.** `IF NOT EXISTS (conname = ...)` significa que,
   uma vez criada, ela **nunca mais é atualizada**.

**Cenário concreto:** a Fatia 2 acrescenta `LAUNDRY` em `app/utils/productCategories.js`.
Model, controllers e Swagger acompanham sozinhos (é o ganho da correção #5). O CHECK no banco
não: `products_category_allowlist` já existe, o `IF NOT EXISTS` pula, e `migrate` imprime
"✅ Migrations executadas com sucesso". Aí `POST /products {"category":"LAUNDRY"}` passa em toda
a validação de aplicação e **morre no banco com 500** — o mesmo tipo de 500 que esta rodada
inteira serviu para eliminar. E o único lugar onde isso apareceria é produção.

**Correção sugerida:** importar `PRODUCT_CATEGORIES` em `command.js` e gerar o CHECK a partir
dela, trocando o `IF NOT EXISTS` por drop-and-recreate (`ALTER TABLE ... DROP CONSTRAINT IF
EXISTS products_category_allowlist;` seguido do `ADD CONSTRAINT`). Continua idempotente e passa
a acompanhar a constante.

---

### 🟡 R3 — `description` é o único campo que a nova validação não cobre, e ainda devolve 500

**Onde:** `app/utils/productValidation.js:26-56` (assinatura recebe `{ name, price, category, active }`),
`CreateProductController.js:31`, `UpdateProductController.js:37`

**Cenário (reproduzido):**

| Requisição | Real |
|---|---|
| `POST /products {"name":"x","price":1,"description":{"a":1}}` | **500** `Erro interno do servidor` |
| `POST /products {"name":"x","price":1,"description":[1,2]}` | **500** |
| `POST /products {"name":"x","price":1,"description":42}` | 201, gravado como `"42"` |
| `POST /products {"name":"x","price":1,"description":true}` | 201, gravado como `"true"` |

O commit fechou o buraco de 500-por-tipo-errado em `name`, `price`, `active` e `category` e
deixou passar exatamente o campo que sobrou. O Swagger promete 400 para entrada inválida no
POST — continua havendo um 5xx alcançável pelo corpo da requisição.

**Correção sugerida:** duas linhas no mesmo util —
`if (description !== undefined && description !== null && typeof description !== 'string')`
→ `errors.push('description deve ser texto')`.

---

### 🟡 R4 — Banco que já tem `products` **não** recebe o índice parcial, e os dois comandos dizem que deu certo

**Onde:** `db/schema.sql:213-215` (`CREATE UNIQUE INDEX IF NOT EXISTS`), `command.js` (`sync({ alter: true })`)

**Cenário (reproduzido):** regredi o índice de um banco para o formato antigo (total), simulando
um ambiente provisionado pela versão pré-correção, e rodei o migrate novo:

```
antes:   CREATE UNIQUE INDEX products_name_tenant_unique ON products USING btree (tenant_id, name)
$ node command.js migrate
✅ Migrations executadas com sucesso. Todas as tabelas estão atualizadas.
depois:  CREATE UNIQUE INDEX products_name_tenant_unique ON products USING btree (tenant_id, name)
```

Inalterado. `sync({ alter: true })` não substitui índice existente de mesmo nome, e o
`IF NOT EXISTS` do `schema.sql` também é no-op por nome. O ambiente continuaria com o 🔴 —
e as duas ferramentas reportam sucesso.

**Risco real hoje: baixo.** Verifiquei o banco de dev do cluster (`gestao_hotel`): a tabela
`products` **não existe** ainda, e `origin/develop` não tem a feature. Nenhum ambiente conhecido
está afetado. Registro porque é silencioso e porque o projeto não tem mecanismo de migração para
mudança de índice — o próximo que mudar um índice vai cair no mesmo lugar.

**Correção sugerida:** em `command.js`, antes do sync ou no bloco idempotente,
`DROP INDEX IF EXISTS products_name_tenant_unique` quando `indexdef` não contiver
`deleted_at IS NULL` (dá para consultar `pg_indexes` e decidir). Alternativa mais barata:
uma linha no relatório de sessão instruindo quem já tiver `products` provisionado a recriar
o índice à mão.

---

### 🟢 R5 — `price: "0x10"` vira R$ 16,00

**Onde:** `app/utils/productValidation.js:12-21`

`parsePrice` foi escrita para ser estritamente mais rígida que `Number()`, e é — rejeita `''`,
`[]`, `true`, `'12,50'`, objeto e overflow, todos confirmados. Mas ainda delega a `Number()`
o que sobra, e `Number()` aceita notação hexadecimal e exponencial:

```
POST /products {"price":"0x10"}  → 201, price "16.00"
POST /products {"price":"1e3"}   → 201, price "1000.00"
POST /products {"price":" 12.5 "} → 201, price "12.50"   (esse é desejável)
```

Impacto quase nulo — nenhum formulário produz `0x10`. Registro como 🟢 só porque o util foi
escrito com a intenção explícita de ser exaustivo. Se quiser fechar: validar a string com
`/^\d+(\.\d{1,2})?$/` antes do `Number()`.

---

### 🟢 R6 — Mensagem do PUT regrediu para "name obrigatório"

**Onde:** `app/utils/productValidation.js:31-33` com `partial: true`

`PUT /products/:id {"name":""}` → `400 {"errors":["name obrigatório"]}`. Antes era
`"name não pode ser vazio"`, e o Swagger do PUT documenta *"name vazio"*. Em update, dizer
"obrigatório" para um campo que o usuário está justamente tentando limpar confunde.
Correção: usar a flag `partial` também na escolha da mensagem.

## O que foi verificado nesta rodada e está correto

- **Índice parcial existe de verdade** nos dois caminhos: banco de teste
  (`... WHERE (deleted_at IS NULL)`) e banco recém-migrado. Não confiei no diff.
- **Ciclo completo de reciclagem de nome:** criar → deletar → recriar (201) → deletar de novo →
  criar uma terceira vez (201). Dois mortos e um vivo com o mesmo nome convivem sem erro.
- **Renomear para o nome de um produto morto:** 200. Era 500.
- **Duplicidade entre vivos continua barrada:** 409 com mensagem, não 500.
- **Corrida real de concorrência:** 3 POSTs simultâneos → `201,409,409`, uma linha só no banco.
  O `UniqueConstraintError → 409` funciona sob concorrência de verdade.
- **Matriz de `price`:** `'abc'`, `'12,50'`, `{}`, `true`, `''`, `[]`, `[10]`, `null`, `-1`,
  `999999999999` → todos 400, com mensagem que diz o que fazer ("use ponto como separador
  decimal"). `active: 'sim'` → 400. `name` array/número/objeto → 400.
- **`:id` não-UUID:** 404 nos três endpoints, incluindo um UUID quase-válido.
- **`migrate` em banco limpo:** cria índice parcial + os dois CHECKs, e é idempotente
  (rodei duas vezes).
- **Swagger:** `grep "'FOOD'"` não encontra mais nenhuma cópia literal em `config/`;
  `PRODUCT_CATEGORIES` e `VALID_ROLES` importados.
- **Suíte de products:** 36/36 passando. O teste novo do ciclo delete→recriar é legítimo —
  ele falharia com o código anterior, que é o critério que importa.
- **Nada regrediu no que já estava certo:** isolamento de tenant nos 5 controllers,
  `tenant_id` só do JWT, serialização de `price` como string em POST/GET/PUT/LIST,
  ordem de rotas, ESM puro, ausência de PII.

## Não foi possível verificar nesta rodada

- **Suíte completa (208/1)** — rodei só `tests/products.test.js` (36/36) e o arquivo de sondagem.
  Confio no resultado informado.
- **`qa:checks`** — não executei `scripts/qa_checks.sh`.
- **`node command.js migrate` sobre banco criado por `db/schema.sql`** — continua falhando antes
  de products, no drift pré-existente do B2B (`enum_event_quotes_status`). Segue como pendência
  do projeto, fora da Fatia 1.
- **Geração do cliente tipado a partir do Swagger** — auditei a definição, não o artefato.

## Pendências que saem desta fatia (registradas, não corrigidas)

1. `RoomCategoryModel` tem o mesmo defeito paranoid + unique total que o 🔴 desta fatia.
   Reproduzível pelo mesmo caminho: deletar uma categoria queima o nome.
2. Drift do enum `event_quotes.status` impede `migrate` sobre banco de `schema.sql`.
3. Ambiente que já tenha `products` provisionado não ganha o índice parcial (R4).
4. `deleted_by` no catálogo (achado 🟢 10 da primeira rodada).
5. Alinhar `globalSetup` com os objetos de banco que o Sequelize não gerencia (R1) — vale também
   para a EXCLUDE constraint de anti-double-booking.

---
---

# Histórico — primeira auditoria, commit `6c31c5b`

> Mantido na íntegra para rastreabilidade. Os status estão na tabela de placar acima.

**Arquivos auditados:** 14 do diff + 12 de contexto (middlewares, RoomCategory*, command.js, vitest.config, schema.sql, tests/helpers)
**Achados:** 15 (🔴 1 · 🟡 6 · 🟢 8)

Método: leitura do diff completo (`git diff origin/develop...HEAD`), leitura dos arquivos
inteiros onde o contexto era necessário, e **execução de um arquivo de sondagem descartável**
(`tests/zzprobe.test.js`, já removido) contra o banco real do cluster para confirmar
comportamento em vez de supor. Também provisionei dois bancos temporários
(`qa_probe_db`, `qa_probe2`, ambos dropados) para comparar `db/schema.sql` com
`node command.js migrate`.

## Veredito da primeira rodada

**REPROVADO** — um achado 🔴.

O achado 🔴 não é teórico: reproduzi em 3 linhas de HTTP. Depois que um admin usa o
`DELETE` que esta própria fatia expõe, o nome do produto fica queimado para sempre naquele
tenant, e a API responde `500` opaco em vez do `409` que o Swagger promete. Os demais são
tratáveis, mas quatro deles (🟡) são 5xx em entrada de usuário — o frontend não consegue
mostrar erro de campo para nenhum.

## Achados da primeira rodada

### 🔴 [regra de projeto / contrato de API] Nome de produto fica permanentemente bloqueado depois do DELETE — ✅ RESOLVIDO em `0ffee68`

**Onde:** `app/Models/ProductModel.js:58-66` (paranoid + unique sem filtro),
`db/schema.sql` (`CREATE UNIQUE INDEX products_name_tenant_unique ON products (tenant_id, name)`),
`app/Controllers/ProductApi/CreateProductController.js:24-29`,
`app/Controllers/ProductApi/UpdateProductController.js:27-34`

**Cenário (reproduzido):**

```
POST   /products {"name":"Probe Del","price":10}   → 201
DELETE /products/<id>                              → 204   (soft delete: deleted_at preenchido)
POST   /products {"name":"Probe Del","price":11}   → 500 {"error":"Erro interno do servidor"}
                                                     log: CreateProductController: Validation error
```

E a variante por renomeação:

```
POST /products {"name":"Probe Ghost"} → DELETE → POST {"name":"Probe Vivo"}
PUT  /products/<vivo> {"name":"Probe Ghost"}       → 500
```

**Causa raiz:** o modelo é `paranoid: true`, mas o índice único `(tenant_id, name)` é total —
não tem `WHERE deleted_at IS NULL`. A linha soft-deletada continua ocupando o nome no índice.
O guard-rail de aplicação usa o escopo paranoid padrão, então **não enxerga** a linha morta,
deixa passar, e quem barra é o Postgres — virando `SequelizeUniqueConstraintError`, que cai no
`catch` genérico e vira 500.

Consequência operacional: o hotel tira "Cerveja 600ml" do cardápio no fim da temporada e nunca
mais consegue recadastrar esse nome pela API. Não há endpoint de restore.

**Regra violada:** CLAUDE.md §7 (contrato de API — Swagger documenta 409, a API devolve 500).

**Correção sugerida:** índice parcial no model e no `schema.sql`; checar com `paranoid: false`;
traduzir `SequelizeUniqueConstraintError` em 409.

---

### 🟡 [validação] `price` e `active` sem validação de tipo — 500 onde o Swagger promete 400 — ✅ RESOLVIDO

| Requisição | Esperado | Real |
|---|---|---|
| `price: "abc"` | 400 | **500** `invalid input syntax for type numeric` |
| `price: "12,50"` | 400 | **500** |
| `price: {"a":1}` | 400 | **500** |
| `price: 99999999999` | 400 | **500** `numeric field overflow` |
| `active: "sim"` | 400 | **500** `invalid input syntax for type boolean` |

`Number('abc') < 0` é `false` — NaN passa por qualquer comparação.

---

### 🟡 [validação] `:id` que não é UUID derruba os três endpoints com 500 — ✅ RESOLVIDO

`GET|PUT|DELETE /products/nao-e-uuid` → **500** (`invalid input syntax for type uuid`).

---

### 🟡 [schema drift] CHECK de categoria e `price >= 0` ausentes no banco criado por `command.js migrate` — ⚠️ PARCIAL (ver R1)

Banco vazio → `migrate` → `\d products` não mostrava nenhum `Check constraints:`.
O projeto tem dois caminhos de provisionamento (`npm run setup:db` e `migrate`) que produziam
tabelas diferentes. O comentário de `productCategories.js:2` afirmava que a allowlist estava
"espelhada no CHECK" — verdade em só um dos bancos possíveis.

---

### 🟡 [DRY] Allowlist de categoria copiada 4× em `config/swagger.js` — ✅ RESOLVIDO (ver R2 para o efeito colateral)

Julgamento das cópias, pedido explicitamente:

| Cópia | Veredito |
|---|---|
| `app/utils/productCategories.js` | fonte única — correto |
| `ProductModel` (`validate.isIn`) | importa — não é duplicação |
| Controllers | importam — não é duplicação |
| `db/schema.sql` (CHECK) | aceitável — SQL não importa JS |
| `config/swagger.js` (4×) | **problemática** — é JS e não importava |

---

### 🟡 [testes] Lacunas que deixavam passar exatamente o achado 🔴 — ✅ RESOLVIDO

Faltavam: ciclo delete→recriar, DELETE cross-tenant, teste com `RECEPTIONIST`, `?active=false`,
e products fora de `tests/tenant-isolation.test.js`.

---

### 🟡 [robustez] `findOne` + `create` é check-then-act sem tratamento da violação de unicidade — ✅ RESOLVIDO E PROVADO

Na primeira rodada era SUSPEITA (não consegui forçar a corrida). Na reauditoria reproduzi:
3 POSTs simultâneos → `201,409,409`, uma linha criada.

---

### 🟢 `.every()` vacuamente verdadeiro em lista vazia — ✅ RESOLVIDO
### 🟢 "WAITER lê o cardápio" só assere o status — ✅ RESOLVIDO
### 🟢 `DELETE /products/:id` não grava quem removeu — 🔲 ABERTO

Precedente do projeto: `ConsumptionModel.js:38` e `DeleteConsumptionController.js:18`.

### 🟢 `price` arredondado em silêncio (`10.999` → `11.00`) — ✅ ACEITO, SEM AÇÃO
### 🟢 `RECEPTIONIST` não mantém o cardápio — ✅ ACEITO, SEM AÇÃO
### 🟢 Swagger `Product` omite `created_at`/`updated_at`/`deleted_at` — 🔲 ABERTO
### 🟢 `?category=` vazio devolve 400 — 🔲 ABERTO

Assimetria com o filtro `active` do mesmo endpoint, que é tolerante.

### 🟢 `name` aceita array e não tem limite de tamanho — ⚠️ METADE

Array/número/objeto agora dão 400. 500 caracteres continuam passando.

## O que foi verificado na primeira rodada e estava correto

- Isolamento multi-tenant nos 5 controllers; nenhum `findByPk`.
- `tenant_id` só do JWT — testei injeção via body em POST e PUT: ignorada.
- Unique composto funciona (mesmo nome nos dois tenants).
- Serialização de `price` consistente: POST `"5.00"`, GET `"5.00"`, PUT `"7.50"`, LIST `"7.50"`.
- Allowlist fail-safe nos três pontos de entrada; `?category[]=DRINK` rejeitado.
- Ordem de rotas correta (alerta para a Fatia 2: `/products/categories` teria que vir antes de `/:id`).
- RBAC do WAITER; 401 sem token; `requireRole` é allowlist variádica.
- ESM puro; escrita em tabela única (transação desnecessária).
- `migrate` em banco limpo cria `products` e é idempotente; `relations.js` acrescenta ao final.
- LGPD: cardápio sem PII; `console.error` só com `error.message`; nada de PII em query string;
  `paranoid: true` aqui não cria pendência de art. 18, VI. Ressalva para a Fatia 2a: as mensagens
  do driver ecoam a entrada do usuário no log — inócuo em produto, não pode se repetir no
  lançamento de item.
- SOLID/KISS: controllers finos, sem `if/else` por tipo, sem abstração especulativa. A decisão
  de não criar campo de estoque foi respeitada.
