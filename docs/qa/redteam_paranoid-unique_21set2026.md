# QA Red Team — paranoid + índice único parcial (T-06.3 / T-06.6)

**Branch:** `fix/paranoid-unique-constraints` (HEAD `ee09676`) · **Base:** `origin/develop@c4e2a91` (merge-base `9de17ac`) · **Data:** 21/09/2026
**Worktree auditado:** `/home/gabri/sistema_gestao_hotel-etapa3`
**Arquivos auditados:** 32 no diff (29 de código/script + 3 de doc) · **Achados:** 11 (🔴 0 no escopo · 🟡 4 · 🟢 7) + 1 🔴 pré-existente fora do escopo

## Veredito

**APROVADO COM RESSALVAS**

Nenhum achado 🔴 no escopo da branch. O 🔴 registrado abaixo (PII em log) é **pré-existente em
`develop`**, não foi introduzido por este trabalho e não bloqueia este merge — mas foi reproduzido
com evidência e precisa virar task.

Recomendação operacional: **corrigir o 🟡-1 antes de abrir o PR** (uma linha), porque ele é
literalmente o critério de aceitação CA-06.6 não atendido para a tabela que originou a T-06.6.
Os outros três 🟡 podem ir como ressalva declarada à Sirlande.

---

## Método — o que foi reproduzido de verdade

Nada nesta seção foi concluído por leitura de código. Reproduções próprias, nesta sessão:

| # | Reprodução | Comando/cenário | Resultado |
|---|---|---|---|
| R1 | Portão de QA verde | `bash scripts/qa_checks.sh` | `exit 0`, 3 avisos pré-existentes, 0 erros — **bate com o relatado** |
| R2 | Suíte completa | `npx vitest run --coverage` (services/core-service) | 19 arquivos, **261 passam, 1 skip**, 74,56% stmts / 70,84% branches / 85,71% funcs / 77,19% lines — **bate com o relatado** |
| R3 | Regra 8 pega o defeito clássico | removi `where: { deleted_at: null }` de `UserModel.js` | `exit 1`, erro correto |
| R4 | Regra 8 pega o bypass do 🟡-3 (índice em 1 linha) | reescrevi o índice de CPF de `GuestModel.js` como `{ unique: true, fields: [...], name: '...' }` numa linha só | `exit 1` — **🟡-3 fechado, confirmado por reprodução independente** |
| R5 | Regra 8 pega a forma string | `unique: 'rooms_number_tenant_unique'` sem `where` | `exit 1` |
| R6 | Regra do `schema.sql` (controle positivo) | reintroduzi `UNIQUE (tenant_id, email)` em `guests` | `exit 1`, mensagem correta |
| R7 | **Cura real de banco legado** | criei `audit_legacy`, provisionei com `git show origin/develop:services/core-service/db/schema.sql` (schema antigo, `UNIQUE` de tabela), rodei `node command.js migrate` | `sync({alter})` **falhou de verdade** (`default for column "status" cannot be cast automatically to type enum_event_quotes_status`) e **mesmo assim os 7 índices foram curados** — 🟡-1 fechado com evidência de produção, não de teste |
| R8 | Prova funcional pós-cura | no `audit_legacy` curado: insert → soft-delete → re-insert do mesmo CPF | re-cadastro **passa**; duplicata **viva** continua barrada (`duplicate key ... guests_cpf_tenant_unique`) — 🔴-1 e 🔴-2 de 31/08 fechados |
| R9 | Exit code do `migrate` | medido sem pipe | `EXITCODE_REAL=1` quando o sync falha — fail-fast correto, o `finally { process.exit(0) }` não mascara |
| R10 | **Teste portado é load-bearing** | mutei `CreateBookingController` de volta para find-or-create só por e-mail e rodei `public-booking.test.js` | os **2 testes portados falham** (`2 failed | 22 passed`) — a portagem manual está fiel e os testes passam pelo motivo certo |
| R11 | PII em log | forcei erro de banco num `GuestModel.create` e imprimi com `console.error(error)` | stdout contém `parameters: [..., 'Fulano Teste', '39053344705', 'fulano@example.com']` **3 vezes** |
| R12 | Bypass novo da regra 8 | `/* where: { deleted_at: null } — removido */` como comentário de **bloco**, índice sem predicado | `exit 0` — **defeito passa** |
| R13 | Lacuna da regra do schema.sql | `email TEXT UNIQUE` (unique de **coluna**) em tabela com `deleted_at` | `exit 0` — **defeito passa** |
| R14 | Cobertura da cura | no `audit_legacy` curado, troquei `products_name_tenant_unique` por versão TOTAL e rodei `migrate` de novo | índice **continua total**; re-cadastro de produto soft-deletado falha com `duplicate key` |

Banco de trabalho `audit_legacy` foi **dropado** ao final. `git status` do worktree: limpo.

---

## Achados

### 🟡-1 [migração / CA-06.6] A cura cobre 7 dos 8 índices — falta justamente `products`, a tabela que originou a T-06.6

**Onde:** `services/core-service/database/applyDbConstraints.js:90-98` (array `indicesParciais`)

**Cenário reproduzido (R14):** banco legado com `products_name_tenant_unique` criado TOTAL (antes
da correção do `ProductModel`). Roda `node command.js migrate` → os 7 índices de users, rooms,
room_categories, guests×2 e corporate_clients×2 são curados; `products_name_tenant_unique`
**permanece total**. Efeito operacional: o hotel exclui "Cerveja 600ml" do cardápio, tenta
recadastrar → `duplicate key value violates unique constraint "products_name_tenant_unique"` →
hoje isso vira **409 "Já existe um produto com esse nome"** enquanto a listagem do cardápio não
mostra produto nenhum com esse nome. O nome fica queimado e o recepcionista não tem como saber
por quê.

**Regra violada:** SPEC-06, **CA-06.6.a** ("`applyDbConstraints.js` detecta índice sem o predicado
e o recria") e **CA-06.6.c** ("padrão aplicável aos demais índices parciais"). O enunciado da
T-06.6 é literalmente *"um banco que já tem a tabela `products` não recebe o índice parcial"* — a
implementação cobre todo mundo menos ela. Agrava: `uniqueConstraintConflict.js:490` já mapeia
`products_name_tenant_unique`, e a mensagem de erro da regra 8 do `qa_checks.sh` aponta
`ProductModel.js` como **o exemplo do padrão correto**.

**Correção sugerida:** uma linha em `indicesParciais`:
`{ tabela: 'products', colunas: ['tenant_id', 'name'], nome: 'products_name_tenant_unique' }`,
e uma linha no `it.each` de `db-constraints.test.js`.

---

### 🟡-2 [portão de QA] Bypass novo da regra 8: comentário de **bloco** com `deleted_at` derruba a detecção

**Onde:** `scripts/qa_checks.sh:204` (`sed 's|//.*$||'`) e o comentário `qa_checks.sh:193-196`

**Cenário reproduzido (R12):** em `RoomModel.js`, troquei
`where: { deleted_at: null }` por `/* where: { deleted_at: null } — removido temporariamente */`.
O índice passa a ser **TOTAL** e `bash scripts/qa_checks.sh` devolve **`exit 0`**, sem erro.

**Regra violada:** o próprio comentário do script afirma *"Comentários são removidos antes de
escanear, então (c) não cola mais"* — verdade só para `//`. `/* ... */` não é removido, e o texto
`deleted_at` dentro dele satisfaz o `content !~ /deleted_at/`. É exatamente o bypass (c) da
auditoria de 31/08, sobrevivendo numa sintaxe diferente. Como a regra 8 é a **única** barreira
estrutural contra a quinta reincidência do defeito, um bypass conhecido e não documentado é dívida
que vai doer.

**Correção sugerida:** remover comentários de bloco antes do `awk` (ex.:
`perl -0pe 's{/\*.*?\*/}{}gs'` no lugar/antes do `sed`), e ajustar o comentário do script para não
afirmar cobertura que não existe. Se não for corrigir agora, **trocar a afirmação por uma limitação
declarada** — o pior cenário é o próximo dev confiar no comentário.

---

### 🟡-3 [portão de QA] A regra do `schema.sql` só vê `UNIQUE (...)` de tabela; `UNIQUE` de coluna passa

**Onde:** `scripts/qa_checks.sh:254` (`buf ~ /UNIQUE[ \t]*\(/`)

**Cenário reproduzido (R13):** em `db/schema.sql`, `email TEXT,` → `email TEXT UNIQUE,` dentro do
`CREATE TABLE guests` (que tem `deleted_at`). Isso cria uma constraint única **total e global**
(pior que a anterior: nem por tenant é). `bash scripts/qa_checks.sh` → **`exit 0`**.

**Regra violada:** a mesma que a regra pretende cobrir — "UNIQUE de tabela em tabela soft-delete".
O `awk` exige o parêntese, então a forma de coluna escapa. Controle positivo (R6) confirma que a
regra funciona para a forma que ela prevê: não é regra morta, é regra incompleta.

**Correção sugerida:** ampliar o casamento para
`/(UNIQUE[ \t]*\()|([[:alnum:]_]+[ \t]+[A-Z]+[ \t]+UNIQUE)/` ou, mais simples e mais seguro,
qualquer `\bUNIQUE\b` dentro de um `CREATE TABLE` que contenha `deleted_at` — dentro de `CREATE
TABLE` não existe `UNIQUE` legítimo em tabela soft-delete.

---

### 🟡-4 [contrato de API] O 409 novo no endpoint público colide com um 409 já documentado com outro significado; o 409 de corporate-client não está em lugar nenhum

**Onde:** `services/core-service/app/Controllers/PublicBookingApi/CreateBookingController.js:191`
vs `services/core-service/config/swagger.js:167` (`409: { description: 'Sem disponibilidade na
categoria para o período' }`) · `CreateCorporateClientController.js:31` e
`UpdateCorporateClientController.js:16` (recurso ausente do Swagger — aviso pré-existente do
`qa_checks.sh`)

**Cenário:** duas reservas diretas simultâneas com o mesmo CPF novo. A segunda cai no
`uniqueConstraintConflict` e devolve **409 `{"error":"CPF já cadastrado para outro hóspede"}`**.
O cliente tipado gerado do OpenAPI só conhece um 409 nesse path, descrito como *sem
disponibilidade* — o site de reserva direta pode exibir "não há quartos no período" para um erro
que não tem nada a ver. Mesmo problema, sem mitigação, nos dois controllers de cliente corporativo:
o recurso inteiro está fora do Swagger, então o 409 novo é invisível para o frontend.

**Regra violada:** CLAUDE.md §7 — "endpoint ausente do Swagger quebra o cliente tipado"; a
auditoria de 31/08 já tinha levantado isso e a reauditoria registrou "fechado **nos 8
declarados**" — estes três não estavam entre os 8.

**Correção sugerida:** declarar o segundo significado do 409 na descrição do path público
(`'Sem disponibilidade no período, ou conflito de cadastro do hóspede'`) — ou, melhor, passar
mensagem genérica no endpoint público (ver 🟢-1) e descrevê-la. Corporate-client entra no Swagger
junto com a task que já existe para o aviso.

---

### 🟢-1 [LGPD / anti-enumeração] O endpoint público devolve mensagem específica de índice; o `RegisterController` faz o contrário e explica por quê

**Onde:** `CreateBookingController.js:191` (`uniqueConstraintConflict(error, response)` — sem
mensagem genérica) vs `RegisterController.js:56` (passa `'E-mail ou subdomain já em uso'` com 6
linhas de justificativa anti-enumeração)

**Cenário:** o único endpoint **sem autenticação** que grava hóspede pode responder a um anônimo
"CPF já cadastrado para outro hóspede". Na prática só é alcançável por corrida (o find-or-create
por CPF resolve o caso comum antes), então **não é um oráculo de enumeração explorável hoje** — por
isso 🟢 e não 🟡. Mas é inconsistente com a política que o próprio branch documenta 3 arquivos
adiante.

**Correção sugerida:** `uniqueConstraintConflict(error, response, 'Não foi possível concluir a reserva com esses dados')`.

---

### 🟢-2 [robustez SQL] `applyDbConstraints` detecta índice sem filtrar schema, mas cria filtrando `public`

**Onde:** `applyDbConstraints.js:117` (`information_schema.tables WHERE table_name = '${tabela}'`,
sem `table_schema`), `:124-126` (`pg_class t ... WHERE t.relname = '${tabela}'`, sem
`relnamespace`) vs `:143-144` (`pg_indexes WHERE schemaname = 'public'`)

**Cenário (SUSPEITA — não reproduzido, exige banco multi-schema, que o projeto não tem hoje):** se
alguém adotar schema-por-tenant ou um schema de staging no mesmo banco, o `FOR ... LOOP` encontra e
**dropa** índices únicos de tabelas homônimas em **qualquer** schema, enquanto o `CREATE` só
verifica/recria no `public`. Resultado: schema secundário fica sem unicidade e ninguém percebe.
Hoje o risco é nulo (um schema só) — o que falta para confirmar é um banco com dois schemas.

**Correção sugerida:** `JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'` e
`table_schema = 'public'` no `information_schema`. Bônus: `idx.indexname` vem de
`indexrelid::regclass::text`, que **pode** vir qualificado (`public.x`) fora do `search_path`, e aí
`format('DROP INDEX %I', ...)` quota o nome inteiro e falha.

---

### 🟢-3 [operação] `DROP INDEX` / `CREATE UNIQUE INDEX` sem `CONCURRENTLY` no caminho de migrate

**Onde:** `applyDbConstraints.js:136-146`

**Cenário:** `migrate` em produção toma `ACCESS EXCLUSIVE` em `users`, `guests`, `rooms`,
`room_categories` e `corporate_clients` enquanto recria os índices. Em base de pousada isso são
milissegundos; vale registrar porque o custo cresce com a tabela e o deploy não avisa.

**Correção sugerida:** nenhuma agora. Registrar na SPEC de operação quando houver volume.

---

### 🟢-4 [LGPD / portão de QA] A regra 5 não enxerga `console.error(error)`

**Onde:** `scripts/qa_checks.sh:135` — casa só `console.*(... request|req ...)`

**Cenário:** o padrão que realmente vaza PII neste projeto (R11) é `console.error(error)` com erro
do Sequelize, não `console.log(request)`. A regra 5 passa verde sobre ele. Complementa o
🔴-P1 abaixo: enquanto a regra não cobrir, a correção não tem como ser garantida.

**Correção sugerida:** acrescentar um aviso para `console\.(log|error)\((error|erro|e)\)` em
`$CORE/app/Controllers`, sugerindo `error.message`.

---

### 🟢-5 [processo] SPEC-06 não foi atualizada pela branch

**Onde:** `docs/specs/SPEC-06-qualidade-divida-tecnica.md:59,111` — T-06.3 e T-06.6 seguem 🔲 e os
`CA-06.3.a-d` / `CA-06.6.a-c` seguem com os checkboxes vazios.

**Cenário:** a T-06.9 (mergeada) foi marcada ✅ em commit próprio (`69f0b89`). Esta branch entrega
T-06.3 e T-06.6 e não marca nada — quem revisa não tem o estado no documento de origem. (A seção
"Para o Sirlande revisar" abaixo supre isso, mas não substitui o commit.)

---

### 🟢-6 [processo] Sem relatório de sessão para o trabalho de hoje

**Onde:** `docs/historico_sessao/gabriel/` — há relatório de 26/08 e de 09/09; o merge de
`origin/develop`, a resolução dos 5 conflitos e a portagem manual dos 2 testes de regressão (21/09)
não estão documentados.

**Regra violada:** CLAUDE.md §6 — contrato de output da sessão.

---

### 🟢-7 [git] A branch está 2 commits atrás de `origin/develop`

**Onde:** `git log HEAD..origin/develop` → `c64b1ad`, `c4e2a91` (docs de sugestões, Documento 03 —
sem sobreposição com o código desta branch).

**Correção sugerida:** `git merge origin/develop` antes de abrir o PR, para o PR não nascer
desatualizado. Risco de conflito: nulo (docs em pasta não tocada).

---

## 🔴 Fora do escopo desta branch — pré-existente em `develop`

### 🔴-P1 [LGPD art. 6º] Nome, CPF e e-mail de hóspede impressos no stdout do container

**Onde:** `CreateGuestController.js:29`, `UpdateGuestController.js:25`, `CreateUserController.js:39`,
`UpdateUserController.js:34`, `CreateRoomController.js:35`, `UpdateRoomController.js:33`,
`CreateRoomCategoryController.js:26`, `UpdateRoomCategoryController.js:24`,
`RegisterController.js:59` (`console.error(error)`) e `CreateCorporateClientController.js:35`,
`UpdateCorporateClientController.js:20` (`console.error('...:', error)`)

**Cenário reproduzido (R11):** qualquer erro de banco num `GuestModel.create` — FK inválida,
timeout, constraint — faz o `console.error(error)` imprimir o objeto inteiro do Sequelize, que
carrega `sql` e `parameters`. Saída real capturada:

```
sql: 'INSERT INTO "guests" ("id","tenant_id","full_name","cpf","email",...) VALUES ($1,...)'
parameters: [ ..., 'Fulano Teste', '39053344705', 'fulano@example.com', ... ]
```

Repetido **3 vezes** por erro (erro, `parent`, `original`). Em `corporate_clients` o mesmo caminho
imprime CPF e RG do representante legal.

**Por que não bloqueia ESTA branch:** as 11 linhas são contexto no diff, não linhas adicionadas —
o padrão já está em `develop`. Mais: a branch **reduz** a frequência (violação de unicidade agora
retorna 409 antes do `console.error`) e **corrige** o único endpoint público
(`CreateBookingController.js:194` usa `error.message`), com comentário explicando exatamente este
risco. Era o 🟢-3 da reauditoria de 09/09 — ainda aberto, agora com reprodução.

**Correção sugerida:** trocar `console.error(error)` por
`console.error('XController:', error.message)` nos 10 controllers (padrão que o próprio branch já
usa), e a regra do 🟢-4 para impedir a volta. Cabe numa T-06.12 junto com a pendência de OTP.

---

## Para o Sirlande revisar

### Critérios de aceitação da SPEC-06 — estado com evidência

| Critério | Estado | Evidência |
|---|---|---|
| **CA-06.3.a** — índice parcial `WHERE deleted_at IS NULL` no model **e** no `schema.sql` | ✅ **Atendido** | Models: `UserModel.js:454`, `RoomCategoryModel.js:418`, `RoomModel.js:436`, `GuestModel.js:392,400`, `CorporateClientModel.js:370-371`. `schema.sql`: os 7 `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL` (linhas 759, 777, 794, 814, 818, 837, 841); os `UNIQUE (...)` de tabela foram removidos. Verificado no banco por R2 (`it.each` de 7 índices em `db-constraints.test.js`) e por R7 (banco legado real). |
| **CA-06.3.b** — `UniqueConstraintError` → 409 | ✅ **Atendido** | `app/utils/uniqueConstraintConflict.js` (novo) aplicado em 11 controllers; 4 testes unitários próprios (`unique-constraint-conflict.test.js`) cobrindo inclusive o ramo genérico; 5 testes de integração em `paranoid-unique-recreate.test.js` provando 409 (não 500) para duplicata **viva**. |
| **CA-06.3.c** — teste do ciclo criar → deletar → recriar | ✅ **Atendido** | `paranoid-unique-recreate.test.js` — 5 ciclos (categoria, quarto, hóspede/CPF, usuário/e-mail, corporate/CNPJ), todos verdes em R2. |
| **CA-06.3.d** — auditar os demais models paranoid e aplicar o padrão | ✅ **Atendido** | 13 models `paranoid`; os 8 com índice único têm o predicado (7 + `products`, já corrigido antes). Guarda contra regressão em dois níveis: regra 8 do `qa_checks.sh` (código — R3/R4/R5) e `it('nenhum model paranoid ficou com índice único total')` (banco). Ressalvas: 🟡-2 e 🟡-3 (dois bypasses da regra 8 reproduzidos). |
| **CA-06.6.a** — `applyDbConstraints` detecta índice sem predicado e recria | ⚠️ **Atendido para 7 de 8** | R7: banco legado provisionado com o `schema.sql` de `develop` foi curado por `node command.js migrate`, **inclusive com `sync({alter})` falhando**. R14: `products` **não** é curado — ver 🟡-1. |
| **CA-06.6.b** — teste validando o predicado após migrar banco com índice antigo | ✅ **Atendido** | `db-constraints.test.js` → `describe('applyDbConstraints cura índice único total em banco legado')`: 3 testes cobrindo (1) nome canônico já existente porém total, (2) constraint de nome autogerado (`users_tenant_id_email_key`), (3) prova funcional criar→deletar→recriar. Confirmado por R2 e, fora do harness, por R7/R8. |
| **CA-06.6.c** — padrão aplicável aos demais índices parciais | ⚠️ **Parcial** | A tabela `indicesParciais` generaliza o padrão para 7 índices, mas deixa de fora justamente `products` — a tabela citada no enunciado da T-06.6. Ver 🟡-1 (correção de 1 linha). |

### Estado dos 3 achados 🔴 da auditoria de 31/08

| Achado 🔴 (31/08) | Estado | Evidência desta auditoria |
|---|---|---|
| **🔴-1** "A correção só vale para bancos criados do zero" (`db/schema.sql` + `sync({alter})` não substituem índice existente) | ✅ **FECHADO** — confirmado por reprodução própria | **R7**: banco `audit_legacy` provisionado com o `schema.sql` antigo (`UNIQUE (tenant_id, email)` etc.). Antes do migrate: 7 índices totais com nomes autogerados (`users_tenant_id_email_key`, `guests_tenant_id_cpf_key`, ...). Depois de `node command.js migrate`: **os 7 viraram parciais com o nome canônico**, e isso aconteceu **mesmo com o `sync({alter})` falhando** por motivo alheio (enum de `event_quotes`) — que era a ressalva 🟡-1 da reauditoria. **R8**: prova funcional no banco curado — insert + soft-delete + re-insert do mesmo CPF **passa**. |
| **🔴-2** "O 409 transforma o bug em mentira convincente" (409 mascarando índice total) | ✅ **FECHADO** | Consequência do 🔴-1: com o índice parcial em vigor, o 409 só aparece para duplicata **viva** — **R8** confirma que a duplicata viva continua barrada (`duplicate key ... guests_cpf_tenant_unique`) e **R2** confirma os 5 testes de "duplicata viva continua 409". O caso residual em que o 409 ainda mente é o `products` em banco legado — ver 🟡-1. |
| **🔴-3** "Endpoint público continua 500 e grava CPF em log" | ✅ **FECHADO** — confirmado por teste de mutação | `CreateBookingController.js:94-105` faz find-or-create por CPF e depois por e-mail, em ordem explícita; `:191` devolve 409; `:194` loga só `error.message`. **R10**: revertendo o controller para o find-or-create só por e-mail, os **2 testes portados falham** — ou seja, os testes de regressão são load-bearing e a portagem manual do arquivo em conflito ficou fiel. |

### Sobre o merge de hoje (`ee09676`) — o que eu verifiquei

- `git diff origin/develop...HEAD -- scripts/qa_checks.sh` é **inserção pura** (+100/-0): a regra 9 do frontend e as regras 1-7 vindas de `develop` estão intactas, byte a byte. Estrutura conferida: 9 seções numeradas, uma de cada, sem duplicata; `bash -n` OK; `$CORE` usado nos dois caminhos novos.
- `public-booking.test.js`: o diff contra `develop` é **só adição** — todo o trabalho das etapas 1 (vazamento de pagamento público) e 2 (HMAC do webhook PIX) continua no arquivo, e os 2 testes portados foram validados por mutação (R10). `24 testes` no arquivo, todos verdes.
- Os 3 arquivos que só mudaram de lugar (`uniqueConstraintConflict.js`, `paranoid-unique-recreate.test.js`, `unique-constraint-conflict.test.js`) aparecem como **novos** no diff, sem marcador de conflito em lugar nenhum do repo (`grep -rn '<<<<<<<|>>>>>>>'` → vazio) e com imports resolvendo (a suíte importa e executa os três).
- Nenhum commit de `develop` foi perdido no merge, exceto os 2 de doc que entraram **depois** (🟢-7).

### Pendências a registrar (não são achados desta branch)

1. **Reserva de terceiro sem verificação de identidade** (🟡-4b da reauditoria): `POST /public/:subdomain/bookings` anexa a reserva ao cadastro de quem tem aquele CPF, sem OTP nem confirmação de e-mail. Decisão de produto, deliberadamente fora do escopo. **Não está registrado em nenhum lugar** — SPEC-06 vai até T-06.11. Sugestão: abrir **T-06.12**.
2. **🔴-P1 (PII em log)** acima — mesma T-06.12 ou uma própria.
3. `sync({alter})` não consegue migrar banco legado por causa do enum de `event_quotes` (visto em R7). Não afeta a cura dos índices, mas significa que `migrate` **sempre sai com exit 1** num banco provisionado pelo `schema.sql` antigo. É defeito pré-existente e independente desta branch; precisa de task própria antes de qualquer migração real de banco legado.

---

## O que foi verificado e está correto

- **Multi-tenancy:** nenhuma query nova sem `tenant_id`. As duas consultas do find-or-create em `CreateBookingController.js:96,102` filtram por `tenant_id`; os 7 índices parciais são todos compostos com `tenant_id` (unicidade por tenant, não global). `tenant-isolation.test.js:99` já cobre "CPF usado no Tenant A pode ser cadastrado no Tenant B". Nenhum `findByPk` novo.
- **ESM:** nenhum `require()` no diff.
- **Transações:** nenhuma gravação nova em 2+ tabelas; a do `CreateBookingController` continua dentro da transação existente, e o `rollback` precede o `uniqueConstraintConflict`.
- **DRY/SRP:** `uniqueConstraintConflict.js` centraliza o mapa nome-de-índice → mensagem num lugar só, em vez de espalhar por 11 controllers — mesmo padrão de `roles.js`/`productCategories.js`. O helper devolve `null` quando não é violação de unicidade, preservando o caminho de 500 do controller.
- **Atomicidade da cura:** o `DROP` e o `CREATE` ficam no mesmo `DO $$`, então uma falha no `CREATE` (duplicata viva) desfaz o `DROP` — o banco nunca fica **menos** protegido do que estava. Verificado por leitura e coerente com R7/R8.
- **Fail-safe do `migrate`:** R9 — sai com código 1 quando o sync falha, mesmo tendo aplicado as constraints; a mensagem do erro de sync não é mascarada pela falha secundária.
- **Cobertura:** 74,56% stmts contra portão de 60% — folga confortável; `uniqueConstraintConflict.js` a 100% stmts.
- **Sem PII nova em URL, sem `include` novo sem `attributes`, sem endpoint novo** (portanto sem risco novo de ordem de rota).

## Não foi possível verificar

- **Comportamento sob concorrência real** (duas requisições simultâneas batendo no índice): os testes simulam o 409 em série, não em paralelo. O caminho do `catch` é o mesmo, então a evidência é indireta.
- **Multi-schema** (🟢-2): o banco de teste e o legado que provisionei têm só o schema `public`. Para confirmar, faltaria um banco com dois schemas contendo tabelas homônimas.
- **Volume/locking em produção** (🟢-3): sem base grande para medir a janela de `ACCESS EXCLUSIVE`.
- **Frontend:** nenhuma alteração de frontend no diff desta branch — os 2 avisos de UI do `qa_checks.sh` vêm de `develop`.

## Estado do ambiente ao encerrar

- `git status` no worktree: **limpo** (todas as mutações de reprodução foram revertidas com `git checkout`).
- Banco de trabalho `audit_legacy`: **dropado**.
- Banco de teste `gestao_hotel_test`: no estado normal deixado pela suíte.
- Nenhum recurso de cloud envolvido nesta auditoria.
