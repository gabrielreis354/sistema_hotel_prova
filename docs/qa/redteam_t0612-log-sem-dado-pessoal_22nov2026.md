# QA Red Team — T-06.12, log de erro sem dado pessoal
**Branch:** `fix/t0612-log-sem-dado-pessoal` · **Dev:** Gabriel (agente executor) · **Base:** `fix/spec11-cpf-hospede@d2554e7` (PR #205) · **Data:** 22/11/2026
**Commits auditados:** ead7330, 1a95a4b, 745d6e9, 6e7cc21 (`git diff d2554e7..HEAD`)
**Arquivos auditados:** 74 (70 pontos de log em `app/`, `app/utils/logError.js`, `tests/log-error.test.js`, `scripts/qa_checks.sh`, SPEC-06)
**Achados no escopo:** 5 (🔴 0 · 🟡 2 · 🟢 3) · **Repassados:** 2

## Veredito
**APROVADO COM RESSALVAS**

A branch cumpre os CA-06.12.a a d. O `safeError` não deixa sair `sql`, `parameters`, `errors[].value` nem `parent.detail`, e isso foi conferido contra o Postgres de teste. A mutação que devolve o erro cru é derrubada pelos testes. Mesmo assim há duas ressalvas. A `message` do Postgres **traz o valor** nos erros de conversão de tipo (classe 22), e o comentário do utilitário afirma o contrário. Esse caminho foi reproduzido com o CPF num endpoint real. Além disso, a regra 5b deixa passar a maioria das variações.

## Achados no escopo

### 🟡-1 [LGPD] A `message` do erro de conversão de tipo leva o valor, e o comentário diz que não
**Onde:** `services/core-service/app/utils/logError.js:10` (a afirmação) e `:15` (`message` copiada sem filtro). A mesma premissa aparece em `scripts/qa_checks.sh:149` ("`.message` sozinho é seguro").
**Cenário:** reproduzido contra o `gesway-ensaio-pgtest`, com estes passos:
- `POST /reservations` com `guest_id: "52998224725"` (um CPF no lugar do UUID).
- O `CreateReservationController.js:40` faz `GuestModel.findOne({ where: { id: guest_id } })` sem `isUuid`.
- O Postgres devolve 22P02 e a resposta é 500.
- O log grava `CreateReservationController: {"name":"SequelizeDatabaseError","message":"invalid input syntax for type uuid: \"52998224725\"","code":"22P02",...}`.

**O CPF vai para o stdout.** Pelo mesmo mecanismo, também reproduzido:
- `22007` `invalid input syntax for type date: "Maria Sigilo"`;
- `22003` `value "52998224725x" is out of range for type integer`.

CHECK (23514), FK (23503), unicidade (23505) e notNull saem limpos.
**Contexto:** não é regressão, porque antes da branch o mesmo valor saía, e ainda junto com `sql` e `parameters`. Hoje as colunas de dado pessoal são todas `TEXT`, então o vazamento depende de o cliente mandar o dado num campo de tipo errado. Isso acontece: um integrador ou um front que manda CPF em `guest_id`. O dano é real, mas restrito. Por isso o achado fica em 🟡, e não em 🔴.
**Regra violada:** LGPD art. 46 e art. 6º, III. O comentário também passa uma garantia falsa a quem for reaproveitar `error.message` em outro lugar. Há 30 pontos em `app/` que fazem isso.
**Correção sugerida:** no `safeError`, quando `code` começar com `22`, trocar o literal entre aspas da mensagem por `"…"`, algo como `message.replace(/"[^"]*"/g, '"…"')`. O código e o tipo continuam no log, e só o valor sai. Corrigir também o comentário da linha 10 e o do `qa_checks.sh:149`. Acrescentar ao `tests/log-error.test.js` um caso 22P02 com o CPF.

### 🟡-2 [CA-06.12.d / qa] A regra 5b só pega a forma exata que a branch removeu
**Onde:** `scripts/qa_checks.sh:151`
**Cenário:** coloquei um arquivo temporário em `app/` com 17 variações e rodei o `qa_checks.sh`. Depois o arquivo foi apagado. A regra **pegou 4**: `console.error(error)`, `console.error('A:', error)`, `console.warn('A:', err)` e `console.error('A:', e)`. **Deixou passar**:
- `console.log('A:', error)` e `console.info('A:', error)`;
- nomes `err2`, `cause`, `txError` e `ex`, que são nomes reais do código (`txError`, `verifyError` e `statusError` existem em controllers);
- o erro no meio dos argumentos: `console.error('A:', error, 'extra')`;
- parênteses no rótulo: `console.error('A (b):', error)`, porque o `[^()]*` não casa;
- o erro embrulhado: `console.error('A:', { error })`;
- a chamada em várias linhas;
- os campos crus `error.parent`, `error.errors` e `error.sql`.

Não achei falso positivo no código atual: a regra sai limpa na branch.
**Regra violada:** o CA-06.12.d está cumprido ao pé da letra. O objetivo, que é impedir a volta do log cru, fica frágil: basta um `console.log(error)` ou um `catch (err2)` para passar pelo portão.
**Correção sugerida:** ampliar para `console\.(log|info|warn|error|debug)\(` e casar qualquer argumento identificador que não seja seguido de `.message`, `.name` ou `.code`, mais `error.(parent|original|errors|sql|parameters)`. Uma alternativa mais simples é barrar **todo** `console.*` cujo último argumento termine num identificador que case com `/err|error|e|ex|cause/i`, com allowlist explícita. A forma multilinha precisa de `grep -Pzo` ou de uma checagem por `node`. Se não der, registre a limitação no comentário da regra.

### 🟢-1 [Diagnóstico] `cause` e `AggregateError.errors` são descartados
**Onde:** `services/core-service/app/utils/logError.js:12-24`
**Cenário:** `new Error('wrapper', { cause: rootError })` vira só `"wrapper"` mais a pilha do wrapper, e a causa raiz some. Um `AggregateError([...])` sai com `message: ""` e sem os erros internos. Na conexão recusada do Sequelize, que é o caso real testado, o erro sai bem: `SequelizeConnectionRefusedError`, `ECONNREFUSED 127.0.0.1:1` e o código. Não há vazamento, só perda de diagnóstico. Hoje nenhum código do core usa `{ cause }`.
**Correção sugerida:** quando houver `cause` ou `errors`, aplicar o `safeError` recursivamente com profundidade 1, para não abrir mão da redução.

### 🟢-2 [Teste] Faltam os erros de conversão de tipo no teste
**Onde:** `services/core-service/tests/log-error.test.js`
**Cenário:** os 4 casos cobrem 23505, 23503, um valor que não é `Error` e um 500 simulado. Nenhum cobre a classe 22, que é justamente onde a `message` vaza (ver 🟡-1). Por isso o teste passaria com o 🟡-1 aberto.
**Correção sugerida:** acrescentar `GuestModel.findOne({ where: { id: CPF } })` e esperar o CPF fora do log. Esse caso fica RED até a correção do 🟡-1.

### 🟢-3 [Escopo] Um log cru continua no analytics-service
**Onde:** `services/analytics-service/app/Controllers/MetricsApi/GetMetricsController.js:30`, `console.error('GetMetricsController:', error)`
**Cenário:** o erro vem do `prom-client`, que não carrega dado de hóspede. O risco é baixo, e a T-06.12 cobre o core. Fica registrado porque o enunciado pediu varredura no analytics. O resto do analytics, inclusive o consumer, loga só `error.message`.
**Correção sugerida:** trocar por `error.message` agora, ou incluir o analytics na regra 5b quando ele ganhar um `logError` próprio.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | `guest_id` sem `isUuid` vira 500 (22P02) em vez de 404/422, e é esse 500 que leva o CPF ao log no 🟡-1 | `services/core-service/app/Controllers/ReservationApi/CreateReservationController.js:40` | Gabriel (trilha de reservas) | `docs/qa/repasses/para_gabriel_22112026.md` |
| 🟡 | Sem error handler no Express: JSON malformado faz o `finalhandler` imprimir `err.stack` com um trecho do corpo. Reproduzido com NODE_ENV=production: `Unexpected token 'M', ..."ll_name": Maria Sigi"... is not valid JSON`. Inclui as rotas públicas | `services/core-service/routes/router.js:41` (nenhum `app.use((err, req, res, next) => …)`) | DONO INDEFINIDO | `docs/qa/repasses/para_dono-indefinido_22112026.md` |

## O que foi verificado e está correto
- **`safeError` contra o Postgres real.** Unicidade de CPF, FK com tenant inexistente, CHECK, notNull e o validador de model não deixam sair CPF, nome nem e-mail. A pilha do `UniqueConstraintError` começa em `Error: \n at Query.run` e não repete a mensagem nem os valores.
- **Erros do Asaas, do Mercado Pago e do ViaCEP.** As mensagens são fixas, e o corpo da resposta do PSP nunca é logado (`AsaasPixProvider.js:115-117`). O `storeDocumentPdf.js:32` loga só `error.message` do MinIO e do pdfkit, e a chave do objeto é `<tenant>/<tipo>/<uuid>.pdf`, sem nome.
- **Diagnóstico.** Continuam no log `name`, `message`, `code` (23505, 23503, 22P02, ECONNREFUSED), `constraint`, `table` e a pilha. A pilha assíncrona chega ao controller: `at CreateReservationController (...CreateReservationController.js:40:23)` e `at deadlockRetryingController`.
- **Troca mecânica.** Nos 70 pontos o rótulo bate com o nome do arquivo, inclusive nos 31 que antes não tinham rótulo. Os 70 módulos importam sem erro. O import do `deadlockRetry.js:12` está depois do JSDoc do módulo e antes das exportações, então está no lugar certo. O `withDeadlockRetry` mantém o rótulo `name`.
- **Logs restantes.** Em `app/services`, `bootstrap`, `routes`, `middlewares`, `database`, `_web.js`, `command.js` e no consumer do analytics, todos logam `.message`, um id ou um texto fixo. Não sobrou objeto de erro cru no core.
- **Mutações, todas derrubadas pelo `tests/log-error.test.js`:**
  - (M1) devolver o erro cru: 4 testes falham;
  - (M2) incluir `parent.detail`;
  - (M3) incluir `sql`;
  - (M4) tirar `constraint` e `table`;
  - (M5) tirar `code`;
  - (M6) `logError` chamar o `console.error` sem o `safeError`: 3 falham.
- **Sem mudança de contrato.** As respostas 500 seguem `{ error: 'Erro interno do servidor' }`.
- **`qa_checks.sh` na branch.** Sai sem erro bloqueante e com 4 avisos, todos anteriores à branch.

## Não foi possível verificar
- **O que o agregador de logs realmente recebe.** O teste serializa com `JSON.stringify`, e o `console.error` em produção usa `util.inspect`. Para o objeto reduzido do `safeError` os dois formatos são equivalentes, mas não conferi a saída do container no K8s.
- **Erro real do pdfkit e do MinIO.** Não provoquei a falha. A avaliação vem da leitura do código, onde as chaves são UUID e só `.message` é logado.
- **Erro real do Asaas.** Não fiz chamada ao sandbox. A análise é estática.

Os arquivos temporários da auditoria (`tests/zz_redteam_probe.test.js` e `app/zz_redteam_probe.js`) foram apagados, e a tabela `zz_probe` foi removida. `git status` ficou limpo, sem commit e com o container intacto.

## Tratamento (Gabriel com Claude, 22/11)

| Achado | Tratamento |
|---|---|
| 🟡-1 message da classe 22 | ✅ `safeError` troca o literal entre aspas por `"…"` na mensagem **e na pilha** em todo erro vindo do banco (Sequelize com `parent` ou driver com `severity`), não só na classe 22: fail-safe, e constraint e tabela seguem nos campos próprios. Comentários do `logError.js` e do `qa_checks.sh` corrigidos. Os 19 `console.error('X:', error.message)` dos controllers e os 2 do webhook PIX passaram ao `logError` |
| 🟡-2 regra 5b estreita | ✅ Regra ampliada: qualquer `console.*`, o erro como argumento (`e`, `ex`, `err*`, `*Error`, `cause`, inclusive em `{ }`), os campos crus (`.parent`, `.original`, `.errors`, `.sql`, `.parameters`) e o `.message` de erro nos controllers. Conferida com 16 variações ruins (16 barradas) e uma legítima (passou). A chamada em várias linhas segue pega só na 1ª linha, registrado no comentário |
| 🟢-1 `cause` e `AggregateError` | ✅ Saem reduzidos por `safeError`, um nível |
| 🟢-2 teste sem classe 22 | ✅ Casos 22P02, 22007, causa encadeada e `POST /reservations` com CPF no `guest_id` (RED em 6bc033f) |
| 🟢-3 analytics | ⏸ Fica registrado: o erro vem do `prom-client`, sem dado de hóspede; entra quando o analytics tiver o seu `logError` |
| Repasse: sem error handler no Express | ✅ Tratado aqui (é o mesmo vazamento): middleware de erro no fim do `router.js`, JSON malformado responde `400 {"error":"JSON inválido"}` sem logar o corpo, com teste na rota interna e na pública |
| Repasse: `guest_id` sem `isUuid` | ⏸ Segue com o Gabriel (trilha de reservas): o 500 continua, mas o log já sai sem o valor |

Core: 69 arquivos de teste verdes; `qa_checks.sh` sem erro bloqueante.
