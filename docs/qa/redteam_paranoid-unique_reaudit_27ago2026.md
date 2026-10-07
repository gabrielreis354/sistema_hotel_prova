# QA Red Team — REAUDITORIA: paranoid + índice único parcial

**Branch:** `fix/paranoid-unique-constraints@cde4e5e` · **Base:** `develop@6c7d4bd` · **Data:** 09/09/2026
**Escopo:** verificação das 5 correções (`a76934c`..`cde4e5e`) contra os 8 achados de
`docs/qa/redteam_paranoid-unique_27ago2026.md`
**Achados remanescentes:** 9 (🔴 0 · 🟡 4 · 🟢 5)

## Veredito

**APROVADO COM RESSALVAS**

Os 3 🔴 estão fechados e verificados por reprodução independente, não por leitura do commit
message. Nenhum achado 🔴 novo. Sobram 4 🟡 — dois deles são consequência direta de conselhos
da rodada anterior que não foram executados, e um é um **bypass novo** da mesma regra 8 que a
branch declara ter fechado.

**Ação operacional obrigatória antes de considerar o defeito resolvido em campo:** o merge não
cura banco nenhum sozinho. O banco de desenvolvimento desta máquina (`gestao_hotel`) continua
com os **7 índices TOTAIS** neste momento — medido, não suposto. Alguém precisa rodar
`node command.js migrate` (ou reiniciar o deploy, que chama isso em `start.sh:92`) em cada
ambiente.

---

## Verificação achado a achado

### 🔴 1 — "a correção só vale para bancos novos" → **FECHADO** (com ressalva 🟡-1)

Reproduzi os dois caminhos legados em bancos descartáveis, provisionados a partir de um
worktree em `develop` (`reaudit_sync`, `reaudit_schema`, `reaudit_schema2` — todos dropados):

| Banco legado | Estado antes | Comando | Estado depois |
|---|---|---|---|
| `reaudit_sync` — `node command.js migrate` com os models de `develop` | 7 índices `TOTAL`, nomes canônicos | `node command.js migrate` (branch) | **7 `PARCIAL`** ✅ |
| `reaudit_schema` — `psql -f db/schema.sql` de `develop` | 7 `TOTAL`, nomes autogerados (`guests_tenant_id_cpf_key`…) | `applyDbConstraints()` | **7 `PARCIAL`** ✅ |

Prova funcional no `reaudit_schema`, no cenário exato que a auditoria anterior usou para
reprovar: hóspede inserido com CPF `39053344705` → `deleted_at = now()` → após a cura, o
`INSERT` do mesmo CPF **passa** (`INSERT 0 1`). Antes da cura esse mesmo INSERT batia em
`guests_tenant_id_cpf_key`.

**Os 3 testes novos não são guardas vazias.** Revertido `database/applyDbConstraints.js` para
`bfc2cba` e rodada só a suíte de db-constraints: **3 falharam, 14 passaram**, e falharam pelo
motivo certo:

```
× nome canônico já existe, mas TOTAL   → expected indexdef to contain 'deleted_at IS NULL'
× constraint com nome autogerado       → expected [{conname: users_tenant_id_email_key}] to equal []
× ciclo criar → deletar → recriar      → promise rejected SequelizeUniqueConstraintError
                                          ("guests_tenant_id_cpf_key")
```

Arquivo restaurado com `git checkout --` logo em seguida.

### 🔴 2 — "o 409 vira mentira convincente" → **FECHADO por consequência**, exceto no caso do 🟡-1

Com o banco realmente curado, o 409 volta a ser verdadeiro. Permanece falso apenas nas
instalações que o 🟡-1 descreve (provisionadas pelo `schema.sql` antigo), porque nelas a cura
não é alcançável por nenhum comando existente.

### 🔴 3 — "endpoint público 500 + CPF em log" → **FECHADO**

Medido com espiões em `console.error` **e** `console.log`, em dois cenários:

1. **Caminho normal** (hóspede com CPF já cadastrado reserva pelo site com e-mail novo):
   `201`, hóspede reaproveitado, `console.error` **não chamado**.
2. **Race real** (mock em `GuestModel.findOne → null`, o `create` colide de verdade):
   `409 {"error":"CPF já cadastrado para outro hóspede"}`, `console.error` **não chamado**,
   `console.log` vazio. Busca literal pelo CPF em tudo que foi logado: `false`.

O `console.error('CreateBookingController:', error.message)` (`:186`) também está correto para
os outros erros: `error.message` de um erro Sequelize é `"Validation error"` — o `parent.detail`
e o `sql` do INSERT, que era onde o CPF vazava, ficam de fora.

### 🟡 regra 8 — **os 5 cenários fecharam; um 6º abriu** (ver 🟡-3)

Rodei A–E eu mesmo, num worktree descartável no tip da branch, um por vez com
`git checkout --` entre eles:

| Cenário do relatório anterior | Antes | Agora |
|---|---|---|
| A — `where` removido de `RoomModel` | `exit 1` | `exit 1` ✅ |
| B — `unique: 'rooms_number_tenant_v2'` (forma string) na coluna | `exit 0` ❌ | `exit 1` ✅ |
| C — `where` removido + `defaultScope: { where: { deleted_at: null } }` | `exit 0` ❌ | `exit 1` ✅ |
| D — `where` removido + comentário `// TODO: avaliar where: { deleted_at: null }` | `exit 0` ❌ | `exit 1` ✅ |
| E — `UNIQUE (tenant_id, phone)` em `guests` no `db/schema.sql` | `exit 0` ❌ | `exit 1` ✅ |
| base atual, sem mutação | `exit 0` | `exit 0` ✅ |

### 🟡 Swagger 409 — **fechado nos 8 declarados**

`/users`, `/users/{id}`, `/room-categories`, `/room-categories/{id}`, `/rooms`, `/rooms/{id}`,
`/guests`, `/guests/{id}` documentam 409. Os 2 de `/corporate-clients` continuam fora porque o
recurso inteiro não existe no Swagger — pré-existente e já sinalizado pela regra 7 como AVISO.
Mesma situação de `POST /public/:subdomain/bookings`, que passou a poder devolver 409 nesta
branch e cujo router também está fora do Swagger.

### 🟡 LGPD art. 18, VI — **continua aberto e ainda não registrado em lugar nenhum**

A decisão de não corrigir nesta branch está certa (foi a recomendação da rodada anterior). Mas a
pendência foi declarada como "vai para o relatório de sessão" e **o relatório de sessão não foi
escrito**: o único da branch é `divella…/divida_tecnica_26ago2026.md`, de 26/08, anterior às
correções — e ele não foi tocado pelos 5 commits. `grep` por `art. 18`, `permanent` ou
`eliminação definitiva` em `docs/specs/` e `docs/PRODUCT_ROADMAP.md`: **nada**. Enquanto isso
não for escrito, a pendência não existe para o próximo dev.

### 🟢 fallback morto e 🟢 `RegisterController` — **ambos fechados**

`errors[0].path` removido (`uniqueConstraintConflict.js:43`). `RegisterController:53` usa o
helper com o 3º parâmetro e o comentário justificando a mensagem vaga está agora no código, que
era exatamente o pedido.

---

## Achados remanescentes

### 🟡-1 [migração] Banco provisionado pelo `schema.sql` antigo não tem caminho de cura executável

**Onde:** `command.js:20` (`sequelize.sync({ alter: true })`, roda **antes** de
`applyDbConstraints` em `:26-27`) · `db/schema.sql` (nenhum `DROP CONSTRAINT` para as UNIQUE de
tabela que a branch removeu)

**Cenário — medido.** Provisionei `reaudit_schema2` com o `db/schema.sql` de `develop` e rodei o
`node command.js migrate` **desta branch**:

```
✅ Conexão com o banco de dados estabelecida.
❌ Erro ao executar migrations: default for column "status" cannot be cast automatically
   to type enum_event_quotes_status
```

O `sync({ alter: true })` morre em `event_quotes` e o processo sai com `exit 1` **antes** de
`applyDbConstraints` ser importado. A cura, que funciona (provei no mesmo banco chamando a
função direto), nunca é alcançada por esse caminho. E a outra rota, `npm run setup:db`, também
não cura: `CREATE TABLE IF NOT EXISTS` não recria a tabela existente, então a
`guests_tenant_id_cpf_key` legada sobrevive e o `CREATE UNIQUE INDEX IF NOT EXISTS` novo nasce
ao lado dela — que é literalmente o defeito descrito no 🔴 1 da rodada anterior.

O crash do `sync({alter})` é **pré-existente**: confirmei que o `migrate` de `develop` falha
igual no mesmo banco. Não foi introduzido aqui. O que é desta rodada é a afirmação do commit de
que "os dois caminhos legados foram verificados e curados" — o caminho `schema.sql` foi
verificado chamando `applyDbConstraints()` diretamente, o que nenhum script do repo faz.

**Regra violada:** critério de aceite implícito do 🔴 1 ("roda pelos dois caminhos:
`command.js migrate` e `globalSetup`").

**Correção sugerida (menor que resolve):** mover a chamada de `applyDbConstraints` para **antes**
do `sync({ alter: true })` em `command.js`, ou envolvê-la em `finally`. A cura não depende do
sync e é idempotente. Alternativa igualmente pequena: um script `npm run db:constraints` que só
chama `applyDbConstraints`, documentado no runbook.

---

### 🟡-2 [robustez] Um índice que falha aborta a cura dos seguintes, com mensagem opaca

**Onde:** `database/applyDbConstraints.js:88-140` (o `for` sequencial, sem tratamento por item)

**Cenário — reproduzido.** Banco legado sem o índice de CPF e com **duas linhas vivas com o
mesmo CPF** (`reaudit_schema2`, 2 hóspedes com `cpf='111'` no mesmo tenant). Rodando a cura:

```
CURA FALHOU: Validation error
```

Estado do `guests` depois: `guests_email_tenant_unique | TOTAL`. Como `guests/cpf` é o 4º item
do array e explodiu, os 3 seguintes (`guests/email`, `corporate_clients` ×2) **nunca rodaram** —
e os índices compostos de performance do fim do arquivo (`idx_reservations_tenant_checkin`,
`idx_rooms_tenant_status`) também não. O operador recebe `❌ Erro ao executar migrations:
Validation error`: nenhuma tabela, nenhuma coluna, nenhum CPF conflitante.

Ponto positivo confirmado: **não fica menos protegido**. O `DO $$` é uma statement só, atômica,
e o único jeito de o `CREATE` falhar é quando não havia índice para dropar (se havia um TOTAL
sobre as mesmas colunas, a unicidade das linhas vivas já estava garantida por ele).

A rodada anterior avisou exatamente isto: *"Atenção: o `DROP` pode falhar se já houver duplicata
viva no banco legado — tratar antes de promover."* Não foi tratado.

**Regra violada:** Fail Fast com diagnóstico útil / CLAUDE.md §7 (observabilidade).

**Correção sugerida:** `try/catch` por item, acumulando falhas e relançando no fim com
`tabela + colunas + error.parent.detail`, ou um `SELECT` prévio de duplicatas vivas que já
aponte as linhas conflitantes ao operador. Não precisa resolver a duplicata — precisa dizer
qual é.

---

### 🟡-3 [portão de QA] Bypass NOVO na regra 8: índice defeituoso escrito em uma linha passa

**Onde:** `scripts/qa_checks.sh:203-224` (a pilha de chaves em `awk`)

**Cenário — executado.** No tip da branch, troquei o bloco de índice de `RoomModel` por:

```js
indexes: [
    { unique: true, fields: ['tenant_id', 'number'], name: 'rooms_number_tenant_unique' }
]
```

Índice único **total** num model `paranoid: true` — exatamente a classe de defeito que a regra
existe para pegar. Resultado: `bash scripts/qa_checks.sh` → **`exit 0`**, sem erro nenhum.

**Causa raiz.** No `awk`, a linha corrente só é anexada aos blocos abertos **depois** do
`for` que varre os caracteres:

```awk
for (i = 1; i <= n; i++) { ... if (c == "}") { content = stack[depth] ... } }
for (d = 1; d <= depth; d++) { stack[d] = stack[d] "\n" line }   # ← só aqui
```

Logo, todo bloco que abre e fecha na **mesma linha** tem `content == ""`, nunca casa
`unique:` e nunca é avaliado. Não é um caso exótico: é o formato que qualquer formatador
produz para um índice curto, e o próprio `ProductModel` tem índices de 4 propriedades que
caberiam numa linha.

**Suspeita relacionada (não confirmada, não é achado):** o `sed 's|//.*$||'` que roda antes do
`awk` remove tudo depois de `//` — se algum dia um model tiver `'https://…'` numa linha com
chave, o `}` some junto e a pilha desalinha. Nenhum model tem isso hoje; a base dá `exit 0` sem
falso positivo.

**Regra violada:** o critério que a própria delegação chama de mais valioso — "a regra REPROVA
o padrão no build", e não só as instâncias já conhecidas.

**Correção sugerida:** mover o append da linha para **antes** do laço de caracteres, ou
acumular caractere a caractere em vez de linha a linha. É uma reordenação de duas instruções.

---

### 🟡-4 [segurança / integridade] O `find-or-create` por CPF resolve identidade sem precedência e sem verificação

**Onde:** `app/Controllers/PublicBookingApi/CreateBookingController.js:88-97`

Dois problemas no mesmo `Op.or`, ambos **medidos** via endpoint real:

**(a) Ambiguidade não-determinística.** Se o e-mail casa com o hóspede A e o CPF casa com o
hóspede B — dois cadastros diferentes, situação normal em base de hotel — o `findOne` não tem
`ORDER BY` nem precedência. Medido: hóspede A (`compartilhado@x.com`, sem CPF) e hóspede B
(`outro@x.com`, cpf `52998224725`); requisição com **os dois** valores →
`201`, reserva anexada ao **hóspede A**. O comentário `:86-87` afirma o contrário
("CPF é identidade mais forte que e-mail"); o código não implementa isso. Numa base grande a
escolha muda com o plano de execução do Postgres — a mesma requisição pode cair em cadastros
diferentes em momentos diferentes.

**(b) A reserva de terceiro anexa a um cadastro alheio, sem verificação nenhuma.** Endpoint
público, sem auth, sem captcha, sem confirmação de e-mail. Medido: hóspede `Maria Vitima`
(cpf `39053344705`) cadastrada na recepção; requisição
`{ full_name:'Atacante', email:'atacante@evil.com', cpf:'39053344705' }` → `201`, e no banco
`reserva.guest_id === id da Maria` (`true`). CPF no Brasil é dado amplamente vazado, então isso
é acionável por qualquer um.

Fui atrás do dano e ele é **limitado, não nulo**:
- a resposta não devolve PII nenhuma (`reservation`/`payment`/`pix`, verificado no corpo cru);
- `GET /public/:subdomain/bookings/:id/status` também não devolve dado do hóspede;
- o cadastro da vítima **não é sobrescrito** (`full_name`/`email`/`phone` inalterados após a
  requisição — verificado).

O que resta é **imputação de identidade no PMS**: o hotel passa a ter uma reserva registrada em
nome da Maria que a Maria não fez, com quarto bloqueado e cobrança de sinal associada ao
cadastro dela. É integridade de dado e atendimento, não vazamento.

Honestidade sobre o escopo: a mesma classe já existia por e-mail antes desta branch. A branch
**amplia** o vetor para CPF, que é o identificador mais fácil de obter de terceiros — e por isso
entra aqui, não como pré-existente puro.

**Regra violada:** LGPD art. 6º, IV (exatidão do dado) · Fail Fast na resolução de identidade.

**Correção sugerida (menor que resolve o (a), que é o defeito objetivo):** duas consultas em
ordem explícita em vez do `Op.or` — `findOne({ cpf })` e, só se não achar, `findOne({ email })`
— para que o código faça o que o comentário promete. O (b) é decisão de produto: exige
confirmação de e-mail/OTP antes de vincular a cadastro existente, ou criar sempre um cadastro
novo na reserva pública e deixar a deduplicação para a recepção. Registre como pendência se não
for escopo agora.

---

### 🟢-1 Três testes novos mutam schema compartilhado sem cleanup

**Onde:** `tests/db-constraints.test.js:105-187`

Os testes fazem `DROP INDEX` / `ADD CONSTRAINT` em `rooms`, `users` e `guests` e dependem de a
própria `applyDbConstraints` desfazer a bagunça. Se ela falhar no meio (é justamente o cenário
do 🟡-2), a constraint legada sobrevive para os 12 arquivos de teste que rodam depois
(`fileParallelism: false`, banco único) e as falhas subsequentes apontam para o lugar errado.
Um `afterEach` restaurando o índice canônico custa 3 linhas. O teste 3 também deixa 1 tenant e
2 hóspedes órfãos.

### 🟢-2 `expect(...).resolves.not.toThrow()` é uma asserção frouxa

**Onde:** `tests/db-constraints.test.js:183-186`

Funciona pelo motivo certo — `.resolves` falha se a promise rejeitar, e foi o que observei no
teste de reversão. Mas `.not.toThrow()` sobre um valor que não é função é ruído: `resolves.toBeDefined()`
diz a mesma coisa sem ambiguidade.

### 🟢-3 Log inconsistente: o padrão seguro foi aplicado em 1 dos 11 controllers

**Onde:** `CreateBookingController.js:186` usa `error.message`; os outros 10 (ex.:
`GuestApi/CreateGuestController.js:29`, `AuthApi/RegisterController.js:56`) seguem com
`console.error(error)` do objeto inteiro.

Nos 10, o guard do helper responde antes e o caso de unicidade já não vaza — foi o ganho de LGPD
da rodada anterior. O que sobra é o erro **não-unique**, cujo `parent.detail` carrega valores de
coluna. Fui verificar o dano concreto e ele é pequeno hoje: `GuestModel` não tem `CHECK` nem
`allowNull: false` em campo de PII, então na prática não há classe de erro de banco alcançável
que imprima CPF ali. É consistência, não vazamento comprovado — por isso 🟢 e não 🟡.

### 🟢-4 O fallback genérico do helper continua sem teste

**Onde:** `app/utils/uniqueConstraintConflict.js:47`

`uniqueConstraintConflict.js` fica em 60% de branches na cobertura (`80% stmts`, uncovered
`40-47`). O ramo `'Registro já existe'` — índice fora do mapa — nunca é exercitado. Não há teste
unitário do helper; ele é coberto só de lado, pelos controllers. Um `describe` de 3 casos
(sem mapa / com mapa / com `mensagemGenerica`) fecharia isso.

### 🟢-5 A justificativa anti-enumeração do `RegisterController` é contrariada 20 linhas acima

**Onde:** `app/Controllers/AuthApi/RegisterController.js:50-53` vs `:31-32`

O comentário novo diz que a mensagem é vaga para "não ajudar alguém a enumerar
tenants/e-mails". Mas o pré-check da linha 32 já responde
`409 'Subdomain já em uso. Escolha um nome diferente para o hotel.'` — específico, e
`GET /public/:subdomain/hotel` confirma a existência de qualquer subdomínio de graça. A decisão
de manter a mensagem vaga continua defensável para o **e-mail**; o texto do comentário é que
está mais forte do que o código sustenta.

---

## O que foi verificado e está correto

- **Suíte completa verde:** 17 arquivos, **242 passam**, 1 skip, `exit 0`. Eram 238 — os 4 testes
  novos entraram e passam. Cobertura **74,14% stmts / 69,93% branches / 76,82% lines / 86,54% funcs**,
  acima do portão 60/55 do CI.
- **`npm run qa:checks` → `exit 0`**, 2 avisos pré-existentes (include sem `attributes` em
  `GetBookingStatusController:21`, 5 routers fora do Swagger), 0 erros.
- **`qa_checks.sh` está no CI** (`.github/workflows/ci.yml:29-30`, job próprio "Checagens
  determinísticas") — o portão da regra 8 realmente reprova o build, não é só script local.
- **Regra 8 sem falso positivo** na base atual, com o casamento estrutural novo.
- **Nenhum `require()` introduzido**, nenhuma query nova sem `tenant_id`: o `findOne` novo do
  find-or-create tem `tenant_id: tenant.id` no `where` junto do `Op.or`, então o `Op.or` não
  escapa o isolamento (`AND tenant_id = … AND (email = … OR cpf = …)`).
- **A transação do booking continua íntegra:** o guard 409 novo está no `catch` **externo**; o
  `catch` interno (`:173-176`) faz `rollback` e relança antes. Verificado no teste de race — o
  409 saiu e nenhuma linha parcial ficou no banco.
- **A cura é idempotente:** rodei `applyDbConstraints` duas vezes seguidas no mesmo banco já
  correto, sem erro e sem recriar nada.
- **A cura não afrouxa unicidade entre vivos:** o bloco "Duplicata entre registros VIVOS" de
  `paranoid-unique-recreate.test.js` continua verde depois de tudo.
- **O 409 do endpoint público não vira oráculo de enumeração:** o caminho de mensagem específica
  ("CPF já cadastrado…") só é alcançável sob race — no fluxo normal o CPF existente é
  reaproveitado e a resposta é 201 nos dois casos.

## Não foi possível verificar

- **Se existe algum banco em campo provisionado pelo `schema.sql` antigo.** O único banco real
  ao meu alcance (`gestao_hotel`) está no caminho `sync` — nomes canônicos, 7 índices TOTAL —,
  que é o que o 🟡-1 **não** afeta. Se todos os ambientes forem assim, o 🟡-1 é teórico. Não
  tenho como saber como o banco de staging/produção foi criado.
- **Se algum banco em campo tem duplicata viva** que dispararia o 🟡-2. Depende de dados reais.
- **Comportamento sob concorrência real** no `find-or-create` novo: simulei a race com mock em
  `GuestModel.findOne`, não com duas requisições paralelas de verdade. O caminho de código está
  coberto; a janela temporal, não.
- **Não rodei `node command.js migrate` no `gestao_hotel`** — é o banco de desenvolvimento do
  usuário, mutação não solicitada. Ele continua com os 7 índices TOTAIS; a cura foi provada em
  cópia descartável equivalente.

## Estado do ambiente ao encerrar

- Bancos descartáveis criados por esta reauditoria (`reaudit_sync`, `reaudit_schema`,
  `reaudit_schema2`) e os 2 worktrees temporários: **todos removidos** (`git worktree list`
  confirma só os 3 permanentes).
- `database/applyDbConstraints.js` foi revertido temporariamente para o teste de mutação e
  **restaurado** com `git checkout --`. 2 arquivos de teste temporários criados e **apagados**.
- `gestao_hotel_test` reconstruído pela última execução da suíte, com os 7 índices parciais.
- **Não são meus e ficaram intocados:** `.gitignore` (modificado), `.claude/commands/`,
  `docs/PROMPT_ORQUESTRADOR.md`, `scripts/estado.sh` e
  `docs/specs/SPEC-06-qualidade-divida-tecnica.md` (este último foi modificado por outra sessão
  às 20:35, durante esta auditoria — acrescenta T-06.9/T-06.10). O banco `gestao_hotel_migqa`
  também não é meu.
