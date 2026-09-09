# QA Red Team — paranoid + índice único parcial

**Branch:** `fix/paranoid-unique-constraints` · **Base:** `develop@6c7d4bd` · **Data:** 31/08/2026
**Arquivos auditados:** 23 (diff completo) + 12 lidos por contexto · **Achados:** 8 (🔴 3 · 🟡 3 · 🟢 2)

## Veredito

**REPROVADO**

A correção está certa no código e **não chega a nenhum banco que já existe** — nem ao
`gestao_hotel` de desenvolvimento da própria máquina. Verificado no Postgres, não por leitura.
Como o mesmo commit troca o sintoma de 500 para um 409 plausível, o defeito continua vivo em
produção e agora fica **mais difícil de diagnosticar** do que antes da branch.

---

## Achados

### 🔴 [migração/db] A correção só vale para bancos criados do zero

**Onde:** `db/schema.sql:55,78,101,124,128,273,277` (todos `CREATE UNIQUE INDEX IF NOT EXISTS`) ·
`command.js:20` (`sequelize.sync({ alter: true })`) · `database/applyDbConstraints.js` (não tocado pelo diff)

**Cenário — medido, não suposto.** O banco de desenvolvimento desta máquina, agora:

```
$ psql -d gestao_hotel -c "SELECT indexname, indexdef LIKE '%deleted_at IS NULL%' FROM pg_indexes ..."
corporate_clients_cnpj_tenant_unique | f
corporate_clients_cpf_tenant_unique  | f
guests_cpf_tenant_unique             | f
guests_email_tenant_unique           | f
room_categories_name_tenant_unique   | f
rooms_number_tenant_unique           | f
users_email_tenant_unique            | f
```

Sete índices, sete **totais**. Os dois caminhos de provisionamento foram reproduzidos em
bancos descartáveis (`qa_audit_sync`, `qa_audit_upgrade`, ambos já dropados):

1. **`node command.js migrate`** → `sync({ alter: true })`. Provisionei um banco com os models
   de `develop` (índices totais, **mesmos nomes**) e rodei `sync({ alter: true })` com os models
   desta branch. Resultado: os 7 índices continuam `TOTAL`. O Sequelize compara **nome** de
   índice, não definição — nome que já existe é pulado. O próprio comentário de
   `tests/db-constraints.test.js:55` afirma isso ("`sync({alter})` não substitui índice de
   mesmo nome"), mas a conclusão não foi puxada para o caminho de deploy.

2. **`npm run setup:db`** → `psql -f db/schema.sql`. Apliquei o `schema.sql` de `develop`
   (que usava `UNIQUE (tenant_id, cpf)` **de tabela**) e depois o desta branch. O `IF NOT EXISTS`
   cria o índice parcial **ao lado** da constraint antiga, que sobrevive com o nome
   autogerado `guests_tenant_id_cpf_key`. Prova funcional no mesmo banco:

   ```sql
   INSERT INTO guests (...) VALUES (..., '39053344705');
   UPDATE guests SET deleted_at = now() WHERE cpf = '39053344705';
   INSERT INTO guests (...) VALUES (..., '39053344705');
   -- ERROR: duplicate key value violates unique constraint "guests_tenant_id_cpf_key"
   ```

   O CPF continua **queimado**, exatamente o defeito que a branch declara corrigido.

**Regra violada:** critério de aceite "índice parcial no model **E** no `db/schema.sql`" —
cumprido na letra, não no efeito. `docs/historico_sessao/gabriel/divida_tecnica_26ago2026.md:112`
afirma impacto operacional resolvido ("um hóspede antigo removido não conseguiria se recadastrar")
sem qualificar que isso só vale para bancos novos.

**Correção sugerida (a menor que resolve):** o repositório **já tem o mecanismo certo** e ele
foi usado no defeito irmão. `database/applyDbConstraints.js:29-47` recria a EXCLUDE de
`reservations` quando o predicado está ausente (`IF def IS NULL OR def NOT LIKE '%WHERE%'`).
Basta um bloco análogo para os 7 índices: `DROP CONSTRAINT IF EXISTS <tabela>_<cols>_key` +
`DROP INDEX IF EXISTS <nome>` quando `indexdef NOT LIKE '%deleted_at IS NULL%'`, seguido do
`CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`. Roda pelos dois caminhos
(`command.js migrate` e `globalSetup`) e é idempotente. Atenção: o `DROP` pode falhar se já
houver duplicata viva no banco legado — tratar antes de promover.

---

### 🔴 [regressão de diagnóstico] O 409 transforma o bug em mentira convincente

**Onde:** `app/utils/uniqueConstraintConflict.js:41-45` + os 10 controllers migrados
(ex.: `app/Controllers/GuestApi/CreateGuestController.js:25-28`)

**Cenário.** Rodei a suíte com os 5 models revertidos para `develop` (simulando o que é hoje
o estado real de qualquer banco já provisionado — ver 🔴 anterior). Os 5 testes de ciclo
falham assim:

```
× hóspede: CPF reutilizável após exclusão (hóspede que volta ao hotel)
  → expected 409 to be 201
```

Não é 500: é **409 com a mensagem `"CPF já cadastrado para outro hóspede"`**. Numa instalação
não migrada, a recepcionista que tenta recadastrar a Maria — hóspede excluída há um ano —
recebe uma afirmação **falsa e verossímil**: nenhum hóspede vivo tem aquele CPF. Antes da
branch ela recebia 500, que ninguém confunde com regra de negócio e vira chamado de suporte.
Agora ela vai procurar um cadastro que não existe, ou concluir que o CPF é de outro hotel.

**Regra violada:** Fail Fast / observabilidade. Um mapeamento de erro que descreve a causa
errada é pior que o erro cru.

**Correção sugerida:** ou fecha o 🔴 anterior (o 409 passa a ser sempre verdadeiro), ou o
handler distingue os dois casos antes de responder — consultar com `paranoid: false` e, se a
colisão for contra linha soft-deletada, devolver 409 com mensagem diferente ("registro
excluído ainda ocupa este valor — contate o administrador") em vez de acusar duplicata viva.

---

### 🔴 [LGPD art. 6º/incompletude] O endpoint público continua 500 e grava CPF em log

**Onde:** `app/Controllers/PublicBookingApi/CreateBookingController.js:82-96` (find-or-create
só por e-mail) e `:169` (`console.error('CreateBookingController:', error)`)

**Cenário — reproduzido no banco de teste.** Hotel tem a hóspede Maria cadastrada na recepção
com CPF `39053344705` e e-mail `maria.antiga@`. Maria reserva pelo site com
`maria.nova@` e o **mesmo CPF**:

```
POST /public/hotel-probe/bookings
  { guest: { full_name:'Maria', email:'maria.nova@probe.com', cpf:'39053344705' } }

>>> STATUS: 500 {"error":"Erro interno do servidor"}
>>> log do servidor contém o CPF? true
    CreateBookingController: { detail: 'Key (cpf, tenant_id)=(39053344705, 3d7b5f60-…) already exists.',
                               sql: 'INSERT INTO "guests" ("id","tenant_id","full_name","cpf",…' }
```

O `findOne` procura **só por e-mail**; o CPF passa direto para o `create` e quem barra é o
índice. São dois defeitos num só ponto:

- **Contrato:** é o único endpoint **público e sem autenticação** do sistema e é justamente o
  que ficou de fora do "UniqueConstraintError → 409, nunca 500". A reserva direta simplesmente
  falha, e o hóspede não tem o que fazer com "Erro interno do servidor".
- **LGPD:** `console.error(error)` de um erro Sequelize imprime `parent.detail` e o `sql` do
  INSERT — CPF, nome e e-mail do titular vão para o stdout do container, que no k8s vai para o
  agregador de logs sem retenção definida. Os 10 controllers migrados **deixaram de ter esse
  problema** (o helper responde antes do `console.error`); este ficou.

**Regra violada:** critério de aceite "UniqueConstraintError → 409, nunca 500" · LGPD art. 6º
(necessidade) e art. 46 (segurança).

**Correção sugerida:** o find-or-create passa a procurar por e-mail **ou** CPF dentro do
tenant, e o `catch` externo chama `uniqueConstraintConflict` antes do `console.error`.

---

### 🟡 [portão de QA] A regra 8 tem 3 falsos negativos comprovados

**Onde:** `scripts/qa_checks.sh:186-193` (a heurística `n_unique > n_parcial`)

A regra é o entregável que a delegação chama de mais valioso — "a única forma de impedir que
volte pela quinta vez". Ela pega a regressão óbvia (verifiquei: removendo o `where` de
`RoomModel`, `exit 1` e aponta o arquivo). Mas ela é burlável por três caminhos, todos
executados contra o script real, num worktree descartável:

| Mutação aplicada | Defeito real? | Regra 8 detecta |
|---|---|---|
| `where: { deleted_at: null }` removido de `RoomModel` | sim | ✅ `exit 1` |
| `unique: 'rooms_number_tenant_v2'` (forma **string**) na coluna `number` | sim — gera constraint UNIQUE total, sem predicado possível | ❌ passa |
| `where` removido **+** `defaultScope: { where: { deleted_at: null } }` no mesmo arquivo | sim | ❌ passa |
| `where` removido **+** comentário `// TODO: avaliar where: { deleted_at: null }` | sim | ❌ passa |
| `UNIQUE (tenant_id, phone)` acrescentado à tabela `guests` **no `db/schema.sql`** | sim | ❌ passa (`exit 0`) |

Causas: (a) o `grep` conta `unique:[[:space:]]*true` e ignora a forma
`unique: '<nome>'`, que o Sequelize aceita e que é o jeito idiomático de declarar unique
composto na coluna; (b) a contagem de `deleted_at: null` é **por arquivo**, então qualquer
ocorrência não relacionada — `defaultScope`, índice não-único, ou **texto de comentário** —
compensa um índice defeituoso. O próprio script já tem o helper `strip_comments()`
(`scripts/qa_checks.sh:56`) usado por outras regras; a 8 não o usa; (c) o laço varre só
`app/Models/*.js`, e o `db/schema.sql` é fonte de verdade paralela do provisionamento.

**Regra violada:** o critério "a regra REPROVA o padrão no build" — reprova o caso já
conhecido, não a classe.

**Correção sugerida:** trocar contagem por **casamento estrutural**: para cada bloco de índice
que contenha `unique:`, exigir `deleted_at` no mesmo bloco (delimitado por `{`/`}`), depois de
passar por `strip_comments`; incluir `unique:[[:space:]]*['\"]` na detecção; e um segundo laço
sobre `db/schema.sql` procurando `UNIQUE (` dentro de `CREATE TABLE` que contenha `deleted_at`.
A contraparte no banco (`tests/db-constraints.test.js:69-88`) já é estrutural e correta — só
não cobre o `schema.sql`, porque o banco de teste nasce de `sync({force:true})`
(`tests/setup/globalSetup.js:40`), nunca do arquivo.

---

### 🟡 [contrato de API] 409 novo em 10 endpoints, zero linhas de Swagger

**Onde:** `config/swagger.js:260-313` (`/users`, `/users/{id}`, `/room-categories`,
`/room-categories/{id}`, `/rooms`, `/rooms/{id}`, `/guests`, `/guests/{id}`) — nenhum documenta 409.
`/corporate-clients` não existe no Swagger (já avisado pela regra 7 do `qa_checks.sh`).

**Cenário.** `POST /guests` com CPF repetido passou a responder **409**, status que a
especificação OpenAPI não lista. O cliente tipado gerado do OpenAPI trata 409 como resposta
inesperada e cai no ramo de erro genérico — a tela de cadastro de hóspede da Fase 1 do
frontend, já entregue, mostra "erro inesperado" em vez de "CPF já cadastrado". Só `/products`
(`:671`, `:711`) e `/auth/register` (`:204`) documentam o 409.

**Regra violada:** CLAUDE.md §7 / checklist "endpoint fora do Swagger não existe para o frontend".

**Correção sugerida:** acrescentar `409: { description: '...' }` nos 10 pares
`post`/`put` afetados. É a mesma linha 8 vezes.

---

### 🟡 [LGPD art. 18, VI] O índice parcial multiplica cópias de PII sem caminho de eliminação

**Onde:** `app/Models/GuestModel.js:41` (`paranoid: true`) · `app/Controllers/GuestApi/DeleteGuestController.js:10`
(`guest.destroy()` sem `force`) · nenhum endpoint de eliminação definitiva em todo o repo
(`grep -rn "force: true" app/Controllers/` devolve **1** ocorrência, em `UpdateContractController.js:45`, para parcelas)

**Cenário.** Antes desta branch, o índice total impedia o recadastro e, na prática, limitava a
**uma** a quantidade de linhas com o CPF de uma pessoa. Depois dela, cada ciclo
excluir → recadastrar deixa mais uma linha completa e permanente — `full_name`, `cpf`,
`phone`, `email` — no banco. Um hóspede que se hospeda todo ano e é "limpado" da base entre
temporadas acumula N cópias do próprio CPF, nenhuma delas alcançável por endpoint algum.

Isto **não é motivo para reverter a correção** (o defeito anterior era pior), mas é uma
pendência que a branch agrava e o relatório de sessão não registra.

**Regra violada:** LGPD art. 18, VI (eliminação a pedido do titular) e art. 16 (eliminação
após o fim do tratamento).

**Correção sugerida:** registrar como pendência explícita no roadmap —
`DELETE /guests/:id/permanent` com `requireRole('ADMIN')`, `destroy({ force: true })` e trilha
de auditoria (`deleted_by`). Não é escopo desta branch; é escopo de quem aprovar o produto.

---

### 🟢 [KISS] O fallback `errors[0].path` do helper é código morto

**Onde:** `app/utils/uniqueConstraintConflict.js:41`

`error.parent?.constraint ?? error.errors?.[0]?.path` — quando o `??` cai para o segundo termo,
o valor é um **nome de campo** (`'cpf'`, `'email'`), e as chaves de `MENSAGEM_POR_INDICE`
(`:19-27`) são **nomes de índice**. O lookup nunca acerta: o fallback só consegue chegar em
`'Registro já existe'`, que é o mesmo destino de `indice === undefined`. A cobertura confirma
que o ramo nunca executa — `uniqueConstraintConflict.js` fica com **branches 50%**, linhas
37-45 apontadas como não cobertas no `npm run test:coverage`. O comentário `:39-40` explica
uma situação (validação `unique` do Sequelize antes do banco) que nenhum model do projeto usa.

**Correção sugerida:** remover o fallback e o comentário, ou — se a intenção for defensiva —
mapear também por nome de campo. Manter os dois caminhos sem teste é a pior das três opções.

---

### 🟢 [DRY] `RegisterController` é o 11º controller com a mesma lógica, copiada

**Onde:** `app/Controllers/AuthApi/RegisterController.js:2,52-54`

Mantém `import { UniqueConstraintError }` e o `if (error instanceof …) return 409` próprios,
enquanto os outros 10 (incluindo os 2 de `Product`, que **tinham** a cópia e foram migrados)
passaram a usar o utilitário. `divida_tecnica_26ago2026.md:200` justifica: a mensagem
"E-mail ou subdomain já em uso" é vaga de propósito, para não revelar qual dos dois colidiu num
cadastro público. A justificativa é boa e a decisão está certa — o que falta é o helper aceitar
uma mensagem de sobreposição opcional, para que a exceção fique explícita no código em vez de
sobreviver como cópia esquecida. Enquanto isso, o comentário devia estar no
`RegisterController`, não só no relatório de sessão.

---

## O que foi verificado e está correto

- **Cobertura dos models.** Os 13 models `paranoid: true` foram conferidos um a um. Os 6 com
  índice único (`Guest`, `RoomCategory`, `Room`, `User`, `CorporateClient`, `Product`) têm
  predicado; os outros 7 não têm unique nenhum. Nenhum model paranoid ficou de fora.
- **Model × `schema.sql` sem divergência.** Construí dois bancos limpos — um por
  `sync({force:true})` a partir dos models, outro por `psql -f db/schema.sql` — e diferenciei
  `pg_indexes` e `pg_constraint` (contype `u`/`x`). **`diff` vazio nos dois.** Ordem de colunas,
  nomes e predicados batem. Bancos dropados.
- **Os testes não são guardas vazias.** Revertidos os 5 models para o estado de `develop`,
  **13 de 24** testes ficam vermelhos: os 5 ciclos de recriação e os 8 estruturais. Confere com
  o que o relatório de sessão declara. Cada um dos 5 ciclos falha por conta do próprio model.
- **A unicidade entre registros vivos não foi afrouxada.** Os 5 casos do bloco "Duplicata entre
  registros VIVOS" continuam verdes com e sem a correção — é o controle correto para provar que
  não se trocou "queima o nome" por "aceita duplicata".
- **`error.parent.constraint` traz mesmo o nome do índice.** Medido:
  `PARENT.DETAIL >>> Key (cpf, tenant_id)=(39053344705, …) already exists.` com
  `parent.constraint = 'guests_cpf_tenant_unique'`. O mapa de mensagens funciona.
- **Ganho de LGPD não declarado.** Ao responder antes do `console.error`, o helper **impediu**
  que os 10 controllers migrados gravassem CPF/e-mail em log a cada colisão. Isso é uma melhoria
  real que o relatório de sessão não menciona.
- **Regra 8 sem falso positivo na base atual:** `bash scripts/qa_checks.sh` → `exit 0`,
  2 avisos pré-existentes (include sem `attributes`, routers fora do Swagger), 0 erros.
- **Suíte completa verde:** 17 arquivos, 238 passam, 1 skip, `exit 0`. Cobertura
  73,6% stmts / 69,64% branches / 76,26% lines — acima do portão de 60/55.
- **Integridade dos 3 arquivos editados por script** (`UpdateGuestController`,
  `Create/UpdateRoomCategoryController`): estão CRLF no working tree, mas `.gitattributes`
  força `eol=lf` e os blobs em `HEAD` são LF. Sem ruído de diff, sem regressão.
- **Isolamento entre tenants preservado:** os 7 índices continuam compostos com `tenant_id`,
  e `tests/tenant-isolation.test.js:98` cobre "CPF do tenant A pode ser cadastrado no tenant B".

## Não foi possível verificar

- **Se algum banco legado já tem duplicata viva** que impediria o `CREATE UNIQUE INDEX` da
  migração sugerida no 🔴 1. Depende de dados reais de produção, aos quais não tenho acesso.
- **Comportamento sob concorrência real** (dois `POST /guests` simultâneos). O 409 por race foi
  verificado por caminho de código e pelo teste sequencial, não com requisições paralelas de verdade.
- **Retenção dos logs no cluster.** Para dimensionar o 🔴 3 seria preciso saber por quanto tempo
  o agregador de logs do k8s guarda o stdout dos pods — não está em `docs/infra/KUBERNETES.md`.

## Estado do ambiente ao encerrar

- Bancos descartáveis criados por esta auditoria (`qa_audit_upgrade`, `qa_audit_sync`,
  `qa_audit_models`, `qa_audit_schema`) e os 2 worktrees temporários: **todos removidos**.
- `gestao_hotel_test` reconstruído pela última execução da suíte, com os 7 índices **parciais**.
- **Não são meus e ficaram intocados:** o arquivo não rastreado `scripts/estado.sh` (criado às
  19:42, durante esta auditoria, por outra sessão) e o banco `gestao_hotel_migqa`.
- Observação colhida de passagem em `gestao_hotel`: existem `tenants_subdomain_key`,
  `tenants_subdomain_key1` e `tenants_subdomain_key2` — três índices únicos idênticos sobre a
  mesma coluna, acumulados a cada `sync({ alter: true })`. É defeito pré-existente, fora do
  diff, e mais uma evidência de que `sync({alter})` não é ferramenta de migração.
