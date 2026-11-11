# QA Red Team — M5-c estorno visível (voided_consumptions no bill da reserva)
**Branch:** feature/m5c-estorno-visivel · **Dev:** Sirlande · **Base:** origin/develop@245bb82 · **Data:** 09/11/2026
**Arquivos auditados:** 7 (diff) + leitura de confirmação: GetBillController, pendingLegacyConsumption, migrateConsumptions, AccountItemModel, AccountModel/constraints, relations.js, DeleteAccountItem/DeleteConsumption, reservationRouter, roles.js, reservationLogic.ts, ReservationReceiptPage/DetailPage
**Achados no escopo:** 4 (🔴 0 · 🟡 1 · 🟢 3) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴. Isolamento entre tenants, minimização do autorizador e totais estão corretos. A
ressalva é o caso do legado: um estorno antigo que ainda não foi migrado some do histórico sem
nenhum aviso.

## Achados no escopo

### 🟡 [Legado] Estorno antigo não migrado some da lista sem aviso: o bill responde 200 com o histórico incompleto
**Onde:** `services/core-service/app/utils/itemAsConsumption.js:66-89` (só lê `account_items`) combinado com `services/core-service/app/utils/pendingLegacyConsumption.js:31-34` (`c.deleted_at IS NULL`), chamado em `GetBillController.js:48`
**Cenário:** a reserva R tem em `consumptions` um consumo **excluído** e ainda não migrado. Isso acontece em dois casos: (a) na janela entre os pods novos subirem e o `migrate` rodar; (b) quando a migração deixa R para trás (`migrateConsumptions.js:52-56`) porque **qualquer** linha de R é inválida, inclusive uma linha excluída (o filtro de `pendentes` não olha `deleted_at`). O `pendingLegacyConsumption` ignora o que foi excluído de propósito ("o excluído não muda valor nenhum"), então o `GET /reservations/R/bill` devolve 200 e `voided_consumptions` sai sem esse estorno. O 503 da D-31 existe para recusar em vez de mentir, mas aqui não dispara. A premissa "não muda valor" continua valendo para os totais, só que deixou de valer para a saída nova, que é um histórico de auditoria. A tela da linha do tempo vai mostrar "nenhum estorno" para uma reserva que teve estorno.
**Regra violada:** D-31 ("recusar, nunca mentir"), aplicada à saída nova do CA-05.2.j. Não há dano financeiro.
**Correção sugerida:** a menor é documentar a limitação no comentário de `reservationVoidedItems` e na `description` do Swagger, e registrar como pendência. Se for para fechar o caso de verdade, há duas saídas: um `pendingLegacyVoided` que olha também `deleted_at IS NOT NULL` e devolve a lista vazia mais um indicador, ou 503 só para a parte do histórico. Também vale um teste com consumo legado excluído e não migrado.

### 🟢 [Contrato] `deleted_by.id` e `deleted_by.name` ficam opcionais no cliente tipado
**Onde:** `services/core-service/config/swagger.js:352-356` → `frontend/packages/api-client/src/schema.d.ts:5060-5065` (`id?: string; name?: string`)
**Cenário:** o backend sempre devolve os dois campos quando `deleted_by` não é nulo, mas o schema não declara `required: ['id','name']`. A tela do Gabriel vai precisar tratar `name` como `undefined` (fallback para "—" ou `!`) sem que isso possa acontecer. Pela mesma razão, `voided_consumptions` sai opcional (`?`) no Bill, embora o servidor sempre mande `[]`. Isso segue o padrão já existente dos outros campos do Bill.
**Correção sugerida:** acrescentar `required: ['id', 'name']` ao objeto `deleted_by`. Opcionalmente, pôr `voided_consumptions` no `required` do Bill.

### 🟢 [Swagger] A descrição de `deleted_by: null` cobre só um dos dois casos
**Onde:** `services/core-service/config/swagger.js:353`
**Cenário:** o texto diz "Nulo em estorno antigo sem registro (consumo migrado)". `deleted_by` também sai nulo quando o usuário gravado é de outro tenant (`itemAsConsumption.js:80-81`, coberto pelo teste "dado corrompido"). Quem ler o contrato vai concluir que `null` sempre significa legado.
**Correção sugerida:** trocar por "Nulo quando não há registro confiável de quem autorizou (estorno antigo migrado)".

### 🟢 [Testes] Faltam duas situações do "qualquer conta da reserva"
**Onde:** `services/core-service/tests/bill-voided-consumptions.test.js:36-37` (todo estorno é feito em `accountId`, a primeira conta)
**Cenário:** não há teste de (a) item estornado na conta dividida de um acompanhante (segunda conta ROOM da mesma reserva), que o JSDoc promete; nem de (b) estorno feito pela rota antiga `DELETE /reservations/:id/consumptions/:id` (`DeleteConsumptionController.js:75-76`), que também grava `deleted_by`. Hoje os dois funcionam pelo join `account.reservation_id`, mas nenhum teste trava esse comportamento. Uma mudança futura que filtre por `account_id` ou por `charges_lodging` passaria com a suíte verde. O mutante `reservation_id` é morto pelo teste "lista vazia", então o risco é só de regressão futura, não de bug atual.
**Correção sugerida:** criar um teste com uma segunda conta ROOM da mesma reserva e outro com estorno pela rota antiga.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- **Tenant:** o item é filtrado por `tenant_id`, a conta por `reservation_id + tenant_id` e o usuário por `tenant_id` no `ON` (`required: false`), então o nome de outro tenant vira `null`. O bill de outro tenant devolve 404 antes de chegar à consulta (`GetBillController.js:44`).
- **Conta INTERNAL/TABLE:** o CHECK `type = 'ROOM' OR reservation_id IS NULL` (`applyDbConstraints.js:393`) impede que item de conta INTERNAL entre pelo join. Item de conta de outra reserva fica de fora pelo `reservation_id` (o teste "lista vazia" mata o mutante).
- **`paranoid: false`:** vale só para `account_items` e para `deleter`. A conta continua paranoid, com o mesmo critério de `reservationConsumptionItems`, e nada no código exclui conta (não há `AccountModel.destroy`).
- **Minimização (LGPD art. 6º, III):** só `id` e `name` do usuário (`attributes`), com teste. O WAITER não alcança `/reservations/:id/bill` (allowlist em `app/utils/roles.js:19-26`).
- **Totais:** `voided` não entra em nenhuma soma, porque os totais vêm do `ledger` (`reservationBill.js:41-48`). Há teste.
- **D-57:** a consulta nova recebe a `transaction` REPEATABLE READ READ ONLY e roda em sequência, sem pedir uma segunda conexão ao pool.
- **Todo caminho de exclusão grava `deleted_by`:** `DeleteAccountItemController.js:49` e `DeleteConsumptionController.js:75`, ambos atrás de `requireRole('ADMIN')`. Não há soft delete em massa de `account_items` no código, no seed ou no `migrate`.
- **Legado migrado:** `migrateConsumptions.js:91` preserva `deleted_by`/`deleted_at` e confere linha a linha (`:118-119`). Com `deleted_by` nulo, o bill não quebra (há teste).
- **Desempenho:** o plano usa `idx_accounts_reservation` e depois `idx_account_items_account`, que existem tanto em `db/schema.sql:535-536` quanto em `applyDbConstraints.js:465` (banco legado). O `paranoid: false` não muda o caminho de acesso. É uma consulta a mais por bill, em volume baixo.
- **Frontend:** `BillLike` (`reservationLogic.ts:138`) e `buildBillTimeline` leem só `consumptions` e `payments`. `ReservationReceiptPage` e `ReservationDetailPage` não iteram sobre as chaves do bill. Nenhum consumidor quebra ou passa a mostrar o estorno (o comprovante do hóspede continua igual).
- **Cliente gerado:** `openapi.json` e `schema.d.ts` foram regenerados, e o CI (`ci-frontend.yml:120`) barra divergência.
- **Guardião CA-04.5.b:** foi atualizado só com o acréscimo, e continua exigindo os tipos numéricos.
- ESM, sem `require()`. Nada sem commit na working tree.

## Não foi possível verificar
- Não rodei a suíte nem um `EXPLAIN` no banco real: a análise de índice veio da leitura do schema.
- Não testei o caminho (b) do achado 🟡 (reserva deixada para trás por linha excluída inválida) num banco legado real. A confirmação veio da leitura de `migrateConsumptions.js:44-56` e de `pendingLegacyConsumption.js:31-34`.
- A tela da linha do tempo (Gabriel) não está nesta branch.
