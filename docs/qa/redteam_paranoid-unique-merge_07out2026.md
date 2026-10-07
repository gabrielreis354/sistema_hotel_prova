# QA Red Team — paranoid-unique (merge de develop + fix de ordem de teste)
**Branch:** fix/paranoid-unique-constraints (PR #82) · **Dev:** Sirlande (T-06.3/T-06.6) · **Base:** develop@f66743e · **Data:** 07/10/2026
**Commits auditados:** `850005e` (merge de origin/develop) e `9b9d65c` (beforeAll(truncateAll) em db-constraints)
**Arquivos auditados:** 11 (swagger.js, CreateBookingController.js, command.js, schema.sql, seed_hotels.sql, applyDbConstraints.js, globalSetup.js, db-constraints.test.js, paranoid-unique-recreate.test.js, uniqueConstraintConflict.js, os 14 controllers que o chamam — lidos por grep)
**Achados no escopo:** 3 (🔴 1 · 🟡 2 · 🟢 1) · **Repassados:** 3

> Auditoria **incremental**. A branch inteira já foi auditada em 21/09
> (`docs/qa/redteam_paranoid-unique_21set2026.md`). Aqui só entra o que os dois commits de hoje
> mudam ou expõem — mas o 🔴 abaixo é da branch desde antes do merge e escapou da auditoria de 21/09.

## Veredito
**REPROVADO**

Um único motivo, com correção de 12 linhas e já validada: **os índices parciais da branch quebram
o seed** (`node command.js seed`, `./start.sh seed`, `scripts/setup_db.sh`, compose de contingência).
Em `develop@f66743e` o mesmo seed roda, e roda duas vezes seguidas sem erro. Na branch, falha na
primeira execução. Fora isso, o merge está correto: nenhum 409 da branch e nenhuma resposta do
develop se perderam, e o fix `9b9d65c` resolve de fato a dependência de ordem.

## Achados no escopo

### 🔴 [regressão / CA-06.4.c] Índice único parcial quebra todo `ON CONFLICT (tenant_id, …)` do seed
**Onde:** `services/core-service/seed/seed_hotels.sql:68, 88, 105, 119, 134, 165, 196, 308, 327, 342, 356, 387`
(causa: os índices `WHERE deleted_at IS NULL` em `app/Models/{RoomCategory,Room,User,Guest}Model.js`,
`db/schema.sql:55-128` e `database/applyDbConstraints.js:92-150`)

**Cenário (reproduzido):** banco novo → `node command.js migrate` → `node command.js seed`:
```
❌ Erro ao executar o seed: there is no unique or exclusion constraint matching the ON CONFLICT specification
```
No PostgreSQL, `ON CONFLICT (cols)` só usa um índice **parcial** quando a cláusula repete o
predicado (`ON CONFLICT (cols) WHERE deleted_at IS NULL`). A branch trocou os 4 índices totais
(`room_categories`, `rooms`, `users`, `guests.cpf`) por parciais e não atualizou os 12 consumidores
no seed. Mesmo procedimento em `develop@f66743e` (worktree descartável, banco descartável):
`✅ Seed executado com sucesso`, e de novo na segunda rodada (idempotente).

Pega todos os caminhos de seed documentados: `docker compose exec … node command.js seed`
(README:302, CA-06.4.c, entregue pelo develop em `84ca5e1`/`c9b692e`), `./start.sh seed` (psql
direto) e `scripts/setup_db.sh:28`. A banca e o ambiente de contingência ficam sem os dados de
demonstração no dia em que o PR #82 entrar em `develop`.

Não é efeito do merge: os `ON CONFLICT (tenant_id, …)` existiam antes de `c4e2a91`, então a branch
estava quebrada desde a T-06.3. O que o merge mudou é que agora o seed tem um critério de aceite
(CA-06.4.c) que diz que ele funciona. Nenhum teste nem regra do `qa_checks.sh` roda o seed, e foi
por isso que passou despercebido.

**Regra violada:** regressão de critério de aceite já entregue (SPEC-06 CA-06.4.c). Também
CLAUDE.md §4 R.3, "qual o impacto nos outros módulos", porque a mudança de índice não procurou
os consumidores por `ON CONFLICT`.

**Correção sugerida (validada):** repetir o predicado nas 12 cláusulas:
```sql
ON CONFLICT (tenant_id, name) WHERE deleted_at IS NULL DO NOTHING;
```
Testei com `sed -E 's/ON CONFLICT \((tenant_id, (name|number|email|cpf))\) DO NOTHING/ON CONFLICT (\1) WHERE deleted_at IS NULL DO NOTHING/'`
aplicado a uma cópia (scratchpad) sobre o banco migrado pela branch. Resultado: 2 execuções seguidas
com exit 0 e as mesmas contagens do develop (60 guests, 25 rooms, 5 users).
Para o erro não voltar, vale um teste que rode `seed_hotels.sql` duas vezes sobre o banco de teste,
ou uma regra no `qa_checks.sh` que procure `ON CONFLICT (` com coluna de índice parcial sem `WHERE`.

### 🟡 [contrato de API] Cliente tipado não foi regenerado depois dos 409 novos
**Onde:** `services/core-service/config/swagger.js:593, 609, 627, 647, 680, 699, 717` vs
`frontend/packages/api-client/openapi.json` e `frontend/packages/api-client/src/schema.d.ts`

**Cenário:** comparei programaticamente o spec exportado por `swagger.js` com o `openapi.json`
versionado. As diferenças são exatamente as 7 da resolução do conflito:
```
PUT /users/{id}           code:[200,400,404,409] json:[200,400,404]
POST /room-categories     code:[201,400,409]     json:[201,400]
PUT /room-categories/{id} code:[200,404,409]     json:[200,404]
POST /rooms               code:[201,400,404,409] json:[201,400,404]
PUT /rooms/{id}           code:[200,400,404,409] json:[200,400,404]
POST /guests              409 desc differs
PUT /guests/{id}          code:[200,404,409]     json:[200,404]
```
O frontend tipado não conhece o 409 nesses endpoints. Exemplo: o formulário de quarto não tem o
ramo de erro "Já existe um quarto com esse número" no tipo e cai no tratamento genérico.

**Regra violada:** `docs/DIVISAO_TRABALHO_TIME_09set2026.md` §4.4, "`packages/api-client` —
Regenera, nunca edita à mão"; SPEC-06 CA-06.2.c.

**Correção sugerida:** `cd frontend && pnpm gen:api` e commitar `openapi.json` + `schema.d.ts`
na própria branch.

### 🟡 [contrato de API] 🟡-4 de 21/09 continua aberto: 409 do booking público com dois significados
**Onde:** `services/core-service/app/Controllers/PublicBookingApi/CreateBookingController.js:191`
vs `services/core-service/config/swagger.js:421`

**Cenário:** duas reservas diretas simultâneas com o mesmo CPF novo. A segunda devolve
`409 {"error":"CPF já cadastrado para outro hóspede"}`, mas o único 409 documentado no path é
"Sem disponibilidade na categoria para o período". O merge reaplicou os 409 dos endpoints
autenticados e deixou este de fora. Não é achado novo: registro aqui porque a resolução do conflito
era a oportunidade de fechar e não fechou.

**Regra violada:** CLAUDE.md §7 (Swagger é contrato do cliente tipado).
**Correção sugerida:** a que já estava em 21/09. Passar mensagem genérica no `uniqueConstraintConflict`
desse endpoint (como faz `RegisterController.js:56`, que também evita oráculo de enumeração) e
descrever o segundo significado no 409 do path.

### 🟢 [consistência] POST /users documenta "neste tenant"; o caminho de corrida devolve "neste hotel"
**Onde:** `services/core-service/config/swagger.js:574` e `app/Controllers/UserApi/CreateUserController.js:21`
("E-mail já cadastrado neste tenant") vs `app/utils/uniqueConstraintConflict.js:20` ("E-mail já
cadastrado neste hotel"), usado em `CreateUserController.js:37` e no PUT (`swagger.js:593`)
**Cenário:** o mesmo conflito devolve texto diferente conforme o pré-check ou o índice tenha
barrado. O status 409 está correto e o frontend não depende do texto. É só cosmético.
**Correção sugerida:** alinhar o pré-check ao mapa (`'E-mail já cadastrado neste hotel'`).

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | Fallback de unicidade roda 2º INSERT em transação já abortada (25P02 → 500, assinatura do contrato trava) | `app/Controllers/ContractApi/SignContractController.js:26-29` | DONO INDEFINIDO | `docs/qa/repasses/para_indefinido_07102026.md` |
| 🟡 | 2 testes de CHECK de products passam vazios (`if (!tenant) return`): db-constraints é o 1º arquivo da suíte e o banco está sem tenant | `tests/db-constraints.test.js:23-41` | Sirlande (área schema/Models, §7) | `docs/qa/repasses/para_sirlande_07102026.md` |
| 🟢 | 409/400 de `/products` sem `content`/schema `Error` (T-06.2) | `config/swagger.js:1188-1191, 1231` | Gabriel (T-06.2) | `docs/qa/repasses/para_gabriel_07102026.md` |

Nenhum é 🔴 de segurança, vazamento ou dinheiro, por isso não há alerta no topo.

## O que foi verificado e está correto

**a) Resolução do conflito do swagger.js**
- `git diff f66743e 850005e -- config/swagger.js` tem **apenas adições**: 6 linhas de 409 novas
  e 1 descrição trocada. Nenhuma resposta do develop (T-06.2) foi removida ou alterada.
- Os 9 409 que a branch tinha antes (`git diff c4e2a91 f74c444`) estão todos no resultado:
  POST /users já vinha do develop, e os outros 8 foram reaplicados.
- As mensagens batem com `MENSAGEM_POR_INDICE`: users "neste hotel" (PUT), categoria, quarto.
  Guests "CPF ou e-mail" é correto, porque o pré-check só cobre CPF (`CreateGuestController.js:13`)
  e o e-mail sai pelo índice.
- Cobertura dos chamadores de `uniqueConstraintConflict` (14 controllers): users, categorias,
  quartos e hóspedes têm 409 documentado. Products já estava documentado pelo develop
  (`swagger.js:1191, 1231`) e register também (`:481`). Ficam de fora o booking público (🟡 acima)
  e corporate-clients, que continua sem Swagger nenhum. Isso é pré-existente, está no aviso do
  `qa_checks.sh` e já foi registrado em 21/09.

**b) Interação semântica com os 70 commits**
- `CreateBookingController.js`: o develop **não** alterou este arquivo desde o ponto de fork
  (`c4e2a91..f66743e`). O merge só traz o diff da branch. O `defaultScope` novo do `PaymentModel`
  só afeta leitura. Aqui `PaymentModel.create` devolve a instância construída, e a resposta usa
  `charge.*`, não os campos excluídos. Sem interação.
- `command.js`: `seed()` do develop e a separação `erroSync`/`applyDbConstraints` da branch
  convivem sem sobreposição. `migrate` real rodado num banco descartável: ✅.
- `db/schema.sql` e `scripts/qa_checks.sh`: o develop não mexeu em nenhum dos dois. Sem conflito
  semântico. `qa_checks.sh`: 0 erros e 3 avisos, todos pré-existentes. O aviso
  "room-category não aparece" é falso positivo, porque o path é `/room-categories`.
- `tests/setup/globalSetup.js`: as chaves RS256 são geradas antes do `sync`/`applyDbConstraints`
  e são independentes deles. A suíte autentica normalmente.
- `seed_hotels.sql`: o develop só acrescentou `NOT EXISTS` e casts de enum. O defeito é a
  interação com os índices da branch (🔴 acima).

**c) Fix de teste `9b9d65c`**
- Reproduzi a falha original. Em worktree descartável do `850005e`, rodei `--sequence.shuffle.files
  --sequence.seed=3` (paranoid-unique-recreate **antes** de db-constraints): **3 failed**
  com `23505 could not create unique index` (rooms 777, users readmitido@, guests 39053344705).
- Com `9b9d65c`, as 6 seeds de shuffle, incluindo a 3 (ordem inversa), deram 29/29 verdes.
  A dependência de ordem foi resolvida.
- O truncate está no `beforeAll` do `describe` aninhado. O Vitest executa em ordem de declaração,
  então os testes das linhas 12-91 rodam **antes** do truncate e os das linhas 247-268 só leem
  `pg_constraint`. Nenhum teste fica sem dados por causa dele. Os testes vazios das linhas 23-41
  já eram vazios antes e não têm relação com este commit (repassado).
- `afterEach` de cura: continua correto. Ele roda depois do truncate, e com tabela vazia nenhum
  `CREATE UNIQUE INDEX` falha. O teste "ciclo" cria e apaga o próprio tenant.
- `truncateAll` (`TRUNCATE tenants CASCADE`) alcança as 4 tabelas que o bloco usa. Conferi no
  banco: `rooms`, `users`, `guests` e `products` têm FK para `tenants`.
- Todos os outros arquivos de teste com banco fazem `truncateAll` no próprio `beforeAll`. Os dois
  sem truncate (`jwt-keys`, `unique-constraint-conflict`) não tocam o banco. Esvaziar o banco no
  meio de db-constraints não afeta os arquivos seguintes.
- Suíte completa: **20 arquivos, 281 passed + 1 skipped**.

**d) Multi-tenancy dos índices**
- `pg_indexes` do banco de teste: os 8 índices únicos de models paranoid são compostos com
  `tenant_id` e parciais. O teste "nenhum model paranoid ficou com índice único total" está verde.
  Restam duas exceções, ambas legítimas: `tenants_subdomain_key`, que é global por design porque
  o subdomínio é a chave pública, e `reservation_rooms (reservation_id, room_id)`, que é pivô
  isolado pela reserva.
- `seed_hotels.sql` e `schema.sql` usam os mesmos pares (`tenant_id`, coluna).

## Não foi possível verificar
- **Frontend consumindo os 409:** confirmei que o tipo está desatualizado, mas não rodei
  `pnpm gen:api` nem `tsc`, porque isso alteraria arquivos versionados. O impacto real nas telas
  não foi medido.
- **Corrida real no booking público (409 de CPF):** não reproduzi com requisições concorrentes.
  O raciocínio vem da leitura do código e da auditoria de 21/09.
- **`SignContractController`:** confirmei no Postgres que, depois de um erro, a transação aborta
  (`25P02 current transaction is aborted`). Não montei o cenário HTTP completo de assinatura de
  contrato.

## Estado do ambiente ao encerrar
- Nenhum arquivo de código alterado. Os 2 worktrees descartáveis (`850005e`, `f66743e`) foram
  removidos, e os bancos `qa_probe_seed_07out` e `qa_probe_seed_dev` foram dropados. A cópia
  corrigida do seed ficou só no scratchpad.
- Escritos: este relatório e 3 arquivos em `docs/qa/repasses/`. Nada foi commitado.
