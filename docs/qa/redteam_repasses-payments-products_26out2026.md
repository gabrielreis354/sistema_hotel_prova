# QA Red Team — repasses de payments.provider_charge_id e CHECKs de products
**Branch:** fix/repasses-payments-products · **Dev:** Sirlande · **Base:** develop@a89528b · **Commits:** e07c147, 5fa7a0f · **Data:** 26/10/2026
**Arquivos auditados:** 4 no diff (`app/Models/PaymentModel.js`, `database/applyDbConstraints.js`, `db/schema.sql`, `tests/db-constraints.test.js`). Para confrontar o índice, li também todos os caminhos que gravam ou leem `provider_charge_id`: `PixWebhookController`, `CreateBookingController`, `CreatePaymentController`, `VoidPaymentController`, os três providers em `app/services/pix/`, `uniqueConstraintConflict.js`, `command.js` (migrate), `sequelize/lib/model.js` (sync de índices) e os seeds.
**Achados no escopo:** 2 (🔴 0 · 🟡 1 · 🟢 1) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Não há 🔴. O índice fecha o repasse de 21/09: o lookup global do webhook passa a ser determinístico. Não achei caminho em que o mesmo charge id apareça de forma legítima em duas linhas vivas (detalhes em "verificado"). Os dois testes de CHECK de products agora têm asserção obrigatória e casam com o nome da constraint.

A ressalva é o 🟡-1. Pus o `indexes` no model e ensaiei o migrate num banco legado com duplicata viva. O `sync({ alter })` aborta em `payments` e deixa de alterar as 8 tabelas seguintes. A frase "aplica o resto", do ensaio do autor, vale para o `applyDbConstraints`, mas não vale para o sync. Reproduzi isso em banco descartável.

**Verificação real.** Rodei `npx vitest run tests/db-constraints.test.js`: 23 passed. Para o migrate usei o banco descartável `gestao_hotel_redteam_scratch` no Postgres local, removido ao fim.

## Achados no escopo

### 🟡-1 [Migração] Índice no model faz o `sync({ alter })` abortar em `payments` com duplicata legada, e as tabelas seguintes ficam sem alteração
**Onde:** `services/core-service/app/Models/PaymentModel.js:118-129`. O efeito aparece em `command.js:28-33` e em `node_modules/sequelize/lib/model.js:989-999`, que faz `addIndex` sem try.
**Cenário (reproduzido):**
1. Criei o banco com `migrate`.
2. Fiz `DROP INDEX payments_provider_charge_id_unique`, que simula um banco anterior à correção.
3. Inseri 2 pagamentos vivos com `provider_charge_id = 'dup-SEGREDO'`.
4. Removi `products.active` para marcar uma alteração pendente numa tabela posterior a `payments`.
5. Rodei `node command.js migrate`. O Sequelize tenta criar o índice do model, recebe 23505 e lança `UniqueConstraintError`. O laço de `sequelize.sync` para em `payments`.

A ordem do sync é `… accounts -> payments -> corporate_clients -> event_quotes -> quote_services -> contracts -> contract_installments -> products -> account_items -> outbox`. Por isso as 8 tabelas depois de `payments` não recebem o `alter` nessa rodada. Confirmado: `products.active` continuou ausente (count 0). Na saída, a linha final é `❌ Erro ao executar migrations: Validation error`. A mensagem útil (tabela, coluna e índice) só sai como linha secundária `⚠️ applyDbConstraints também falhou após o sync`. O valor duplicado não vazou.

Depois de apagar a duplicata, um novo `migrate` completou e recriou a coluna. Sem a entrada `indexes` no model, como estava no develop, o sync terminaria. A falha ficaria só no `applyDbConstraints`, que é Fail Safe por desenho.
**Regra violada:** o comentário de `applyDbConstraints.js:114-118` e o ensaio do autor dizem "o resto do banco sai curado". O índice duplicado no model reintroduz um ponto tudo-ou-nada antes dessa cura. A falha não é silenciosa, porque o migrate sai com exit 1. Também não perde dado. Mesmo assim, o schema fica parcialmente migrado até a limpeza, e a mensagem principal ("Validation error") não diz onde olhar.
**Correção sugerida:** escolher uma das três.
- (a) Tirar o `indexes` do `PaymentModel`. O índice já nasce no `globalSetup` e no `migrate` via `applyDbConstraints`, e no `schema.sql`. O teste "nenhum model paranoid ficou com índice único total" não depende dele.
- (b) Manter o `indexes` e documentar no runbook de migração que uma duplicata em `provider_charge_id` interrompe o sync das tabelas posteriores. Isso exige rodar antes `SELECT provider_charge_id FROM payments WHERE deleted_at IS NULL AND provider_charge_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1`.
- (c) No `migrate`, quando houver `erroSync`, imprimir primeiro a mensagem do `applyDbConstraints`.

O mesmo padrão já existe para os índices de `guests`, `products` etc. Esta branch acrescenta mais um ponto de falha a esse padrão, sem tê-lo criado.

### 🟢-1 [Testes] O teste do índice não distingue a origem: tirar a entrada do `applyDbConstraints` mantém a suíte verde
**Onde:** `services/core-service/tests/db-constraints.test.js:338-343` e `database/applyDbConstraints.js:112`
**Cenário:** o `globalSetup` faz `sync({ force: true })` e o model já cria `payments_provider_charge_id_unique` com o mesmo DDL. Se alguém apagar a linha de `payments` em `indicesParciais`, os quatro testes novos continuam passando. Eles também passariam se apagasse o índice do `schema.sql`. O caminho de cura de banco legado para `payments`, que é o que o comentário do model chama de "o índice de verdade", não tem teste próprio. O bloco "applyDbConstraints cura índice único total em banco legado" não inclui `payments`, e o `it.each` de índices parciais (linhas ~60-75) também não.
**Regra violada:** "teste que passaria mesmo com a regra quebrada" (checklist §8). Aqui o efeito é menor, porque o model cobre o caminho principal.
**Correção sugerida:** acrescentar `payments_provider_charge_id_unique` à lista parametrizada de índices parciais. E incluir um caso no bloco de cura legado: `DROP INDEX` → `applyDbConstraints` → índice recriado com `deleted_at IS NULL`. Se o 🟡-1 for resolvido pela opção (a), esse teste vira obrigatório, porque o model deixa de cobrir.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- **Nenhum caminho legítimo gera duas linhas vivas com o mesmo charge id.**
  - O único escritor é `CreateBookingController.js:168-180`, com `create` numa transação. Não existe update de `provider_charge_id` em lugar nenhum.
  - `CreatePaymentController.js:79-86` não aceita o campo.
  - `VoidPaymentController.js:54-56` recusa pagamento de PSP e só faz `UPDATE` de status, sem duplicar linha. Não existe destroy/restore de pagamento em `app/`.
  - Os seeds não gravam o campo.
  - O webhook (`PixWebhookController.js:62`) só lê, então um reenvio não cria linha.
  - Os providers dão id único por cobrança: Fake `fake_<uuid>`, MP `data.id`, Asaas `payment.id`. A chave de idempotência do MP é `reservationId = crypto.randomUUID()`, nova a cada requisição (`CreateBookingController.js:92`), então o MP não devolve o mesmo id para duas reservas.
  - Se um PSP devolvesse id repetido, o erro cairia em `uniqueConstraintConflict` e viraria 409 "Registro já existe", não 500. A cobrança órfã fica logada só pelo id, sem PII.
- **DDL do model é igual ao do `applyDbConstraints`:** mesmo nome e mesmo predicado `WHERE (deleted_at IS NULL)`. O `sync({alter})` compara por nome e não recria. O `applyDbConstraints` vê o nome e o predicado parcial e não derruba. Confirmei com um migrate idempotente em banco limpo.
- **`schema.sql`:** a coluna `deleted_at` existe em `payments` (linha 209) antes do `CREATE UNIQUE INDEX IF NOT EXISTS` (linha 340). Nome canônico igual.
- **Testes de CHECK de products:** `expect.assertions(1)` mais regex com o nome da constraint (`products_category_allowlist`, `products_price_non_negative`). Não passam vazios, nem com a INSERT falhando por outro motivo (FK, NOT NULL).
- **Teste de duplicata:** `expect.assertions(1)` e `original.constraint` com o nome exato do índice. Não passa se a recusa vier de outra constraint.
- **Teste de excluído:** se o índice fosse total, a segunda INSERT rejeitaria e o `resolves` falharia, então o teste discrimina total de parcial.
- **Limpeza:** o tenant é apagado em `finally` e no `afterAll`, com `payments` apagado antes. As FKs de `room_categories`, `rooms`, `guests` e `reservations` saem por `ON DELETE CASCADE`. As linhas que o trigger grava em `outbox` (sem FK) ficam até o `truncateAll` do próximo arquivo, que limpa `outbox`. Os arquivos rodam em sequência (`fileParallelism: false`). Não sobra resíduo que afete outro arquivo.
- **ESM, sem `require()`. Não há endpoint novo, então o Swagger não muda.**
- **LGPD:** a mensagem de falha do `applyDbConstraints` usa `erro.original.message` e não `.detail`. Confirmei no ensaio que `dup-SEGREDO` não aparece na saída.

## Não foi possível verificar
- A suíte completa (987) não foi rodada nesta auditoria. Só rodei `db-constraints.test.js`, com 23 verdes. Os números da suíte completa vêm do autor.
- Não verifiquei se o pipeline de deploy (job de migrate no K8s/Swarm) bloqueia o rollout com exit 1. Disso depende a gravidade prática do 🟡-1.
- Não verifiquei se ids do Asaas e do Mercado Pago são globalmente únicos entre contas diferentes do mesmo PSP. Isso só importaria se um dia houver credencial por tenant, o que a D-3 hoje exclui.

## Resolução (autor, 26/10/2026)

| Achado | Resolução | Commit |
|---|---|---|
| 🟡-1 duplicata legada parava o `sync({ alter })` no meio | Opção (a): o índice saiu do `PaymentModel` e fica só em `applyDbConstraints.js` (`indicesParciais`) e `schema.sql`, mesmo precedente do `account_items` (D-6). Comentário no campo explica o porquê. Cenário do achado reproduzido de novo (duplicata viva + `products.active` removido): o sync agora vai até o fim e recria `products.active`. O erro do `migrate` nomeia tabela, coluna e índice sem expor o valor, sai com exit 1, e depois de limpar a duplicata o índice é criado | ver `git log` da branch |
| 🟢-1 teste não distinguia de onde o índice veio | Dois testes no bloco "cura legado": banco sem o índice e banco com índice TOTAL de outro nome. Ambos falham se a entrada de `payments` sair do `indicesParciais` | idem |

Sem 🔴, então não houve reauditoria delta. A suíte inteira passa (989).
