### 2026-10-19 — Sirlande (orquestrando Claude Code)

- **Branch:** `feature/t04-2-consumption-migration` (sai de `develop` em `754d278`) · **Tarefa:** T-04.2 (SPEC-04 §5)
- **Objetivo:** levar o consumo antigo (`consumptions`, ligado à reserva) para itens de conta (`account_items`), sem perda de valor e sem quebrar o contrato das rotas antigas nem do bill

#### Contexto de abertura

- Mesma sessão da T-04.1 (relatórios `t041_bloco_c_*` e `t041_bloco_d_*`), mergeada em `develop` logo antes.
- Research: só o backend usa o consumo antigo (3 rotas e o bill); o frontend e o seed não. O `tests/bill-consumptions.test.js` (protegido pelo CA-04.2.e) lança consumo em reserva **PENDING**, em conflito com a regra de check-in da T-04.1. `consumptions` não registra autor e tem `consumed_at` separado de `created_at`.

#### Decisões desta sessão

Todas aprovadas pelo Sirlande. Justificativa completa em `docs/specs/anexos/SPEC-04-decisoes-T-04.2.md`.

| # | Decisão | Escolha |
|---|---|---|
| D-25 | Autor do consumo migrado | `origin` LEGACY_CONSUMPTION e `created_by` nulo só nesse caso (CHECK); autoria não é inventada |
| D-26 | Horário do consumo | Coluna `consumed_at`, separada de `created_at`; consumo é passado |
| D-27 | Tabela antiga | Model sai, tabela fica (sem DROP) como trilha |
| D-28 | Rotas antigas | Mesmo contrato, gravando na conta da suíte; aceitam reserva sem check-in (exceção registrada) |
| D-29 | Lista e bill antigos | Itens faturáveis vivos de todas as contas da reserva |
| D-30 | Estadia encerrada | Conta migrada nasce CLOSED; rota antiga recusa consumo (422) |
| D-31 | Falha da migração | Por reserva; a inválida fica para trás inteira, `migrate` sai com 1; bill e lista dela respondem 503 |
| D-32 | Troca de quarto | A conta da diária acompanha o quarto principal, nas rotas antigas e no `POST /accounts` |

#### O que foi feito

1. **TDD:** `tests/consumption-migration.test.js` (rotas antigas e migração) e acréscimos em `tests/accounts-db.test.js`. O `bill-consumptions.test.js` **não foi alterado** (`git diff develop` vazio).
2. **Schema:** `origin` e `consumed_at` em `account_items`, com CHECKs; `created_by` nulável só para o migrado.
3. **Rotas antigas e bill** sobre contas (`reservationRoomAccount`, `itemAsConsumption`, `pendingLegacyConsumption`); `ConsumptionModel` removido.
4. **Migração** (`database/migrateConsumptions.js`), chamada no fim do `node command.js migrate`.
5. **Ensaio num banco real no estado do `develop`, com dados** (worktree do `develop` + `migrate` desta branch). Achou dois defeitos invisíveis no banco de teste, que nasce vazio:
   - com FK na coluna, o `sync({ alter })` do Sequelize não tira o NOT NULL de `created_by`, e a migração morria;
   - itens anteriores à coluna ganhavam o horário do `migrate` como `consumed_at`.
6. **qa-redteam, 1ª rodada: REPROVADO** (🔴: migração que falhava deixava o bill de todos os hotéis sem os consumos antigos). Corrigidos o 🔴, 3 🟡 e 3 🟢; o 🔴 foi ensaiado de novo num banco real (hotel A migra, a reserva do hotel B com R$ 150 mi fica para trás inteira, `migrate` sai 1; corrigido o dado, sai 0).
7. **Reauditoria: APROVADO COM RESSALVAS**, sem 🔴. Corrigidos N-1, N-2, N-3 e N-6.
8. **Erros meus no caminho, todos pegos antes do commit:**
   - um utilitário (`pendingLegacyConsumption`) chamava uma função SQL que não existe; reescrito com duas consultas;
   - um comentário justificava um import tardio com um ciclo de módulos que não existia; trocado por import normal;
   - um teste de "hotel diferente" passava em falso porque a regex `/hotel/i` casava com o caminho `sistema_hotel_prova` na mensagem de erro do import;
   - datas de teste em 2028 (consumo no futuro) que a regra nova recusou com razão;
   - o teste de DELETEs simultâneos passava com o defeito numa rodada só; passou a fazer 8 rodadas.

#### Verificação

- `npm test`: **714 passed + 1 skip**, em 36 arquivos.
- Mutações: todas as correções do qa-redteam e da reauditoria derrubam pelo menos um teste. Sobrevivem só guardas que dependem de a cópia estar errada (verificação de `deleted_by` e de `created_at`, mortas quando a cópia é quebrada) e um caminho equivalente (o POST antigo sem a busca prévia cai no `catch` da RN-005 e devolve a mesma conta).
- Swagger validado com `swagger-parser` e conferido campo a campo contra os models.
- `qa_checks.sh`: sem erro; os 3 avisos são de outras áreas.
- Ensaios em banco real: dois, ambos com bancos e worktrees apagados ao final.

#### Commits

| Hash | Mensagem |
|------|----------|
| `0eb828b` | `test(consumptions): migracao para contas e rotas antigas via Account (RED)` |
| `a2a97bc` | `feat(db): origin e consumed_at em account_items` |
| `075eb7f` | `feat(accounts): conta da suite da reserva e formato de consumo antigo` |
| `a8d8db4` | `refactor(consumptions): rotas antigas e bill leem e gravam via Account` |
| `b91e32e` | `feat(db): migra consumptions para account_items no migrate` |
| `cd738e2` | `fix(db): achados do ensaio de migracao num banco no estado do develop` |
| `08fe278` | `docs(api): rotas antigas de consumo e campos novos do item no Swagger` |
| `e1ec5e3` | `test(consumptions): achados do qa-redteam da T-04.2 (RED)` |
| `66fca6c` | `fix(consumptions): achados do qa-redteam da T-04.2` |
| `a8afe26` | `docs(qa): reauditoria delta da T-04.2 e repasses para Gabriel e Weslley` |
| `461ef13` | `test(consumptions): achados N-1, N-3 e N-6 da reauditoria (RED)` |
| `d96c0d1` | `fix(consumptions): achados N-1, N-3 e N-6 da reauditoria da T-04.2` |
| `8674ba4` | `docs(api): 503 de migracao e regras novas das rotas antigas no Swagger` |
| (este) | `docs(consumptions): relatorio e decisoes D-25 a D-32 da T-04.2` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | **Deploy da T-04.2:** rodar o `migrate` antes **e depois** do rollout; código 1 = reservas com dado inválido, listadas no log | 🔴 Alta (no deploy) | Repasse ao Weslley (`docs/qa/repasses/para_weslley_19102026.md`). Até o `migrate`, bill e lista das reservas afetadas dão 503 — nunca valor errado |
| 2 | **T-04.3:** só cobra diária a conta cujo quarto ainda pertence à reserva; fechar a conta no check-out e no cancelamento (inclusive as abertas antes); caminho para consumo descoberto depois do check-out; conta `INTERNAL` fecha com total 0 (D-24) | — | Próxima fatia |
| 3 | Troca e remoção de quarto cuidarem das contas da suíte | 🟡 Média | Repasse ao Gabriel (`docs/qa/repasses/para_gabriel_19102026.md`) |
| 4 | `DROP TABLE consumptions` depois de conferida a migração em produção (D-27) | 🟢 Baixa | — |
| 5 | `db/schema.sql` não é idempotente (`CREATE TRIGGER` sem `IF NOT EXISTS`), já no `develop` | 🟢 Baixa | Arquivo do Sirlande |
| 6 | Repasse para o Sirlande de 17/10 (auditoria do Asaas): índice único em `payments.provider_charge_id` | 🟢 Baixa | `docs/qa/repasses/para_sirlande_17102026.md`; não aparecia nas pendências |
| 7 | `migrate` falha em banco do `schema.sql` (`event_quotes.status`) | 🟡 Média | Herdada de 14/10. Combinar com o Gabriel |
| 8 | MER: `origin`, `consumed_at`, `CONSUMPTIONS` legado | 🟢 Baixa | Próxima versão do Doc 04 |
