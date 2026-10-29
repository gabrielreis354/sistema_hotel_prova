### 2026-10-19 — Sirlande (orquestrando Claude Code)

- **Branch:** `feature/t04-1-accounts` · **Tarefa:** T-04.1, Bloco D (SPEC-04 §5) e fechamento da T-04.1
- **Objetivo:** lançar e excluir itens da conta, com idempotência da fila offline do garçom, cortesia auditável e soma da conta; Swagger de `/accounts`; auditoria antes do merge

#### Contexto de abertura

- Mesma sessão do Bloco C (relatório `t041_bloco_c_accounts_api_19out2026.md`). `develop` sem novidades desde então.
- Achado do research: a regra de "dono único" do `swagger.js` valia só durante a reescrita da T-06.2, concluída em 22/09. O Swagger entrou neste bloco sem precisar combinar com o Gabriel.

#### Decisões desta sessão

Aprovadas pelo Sirlande (as quatro primeiras no plano, as demais na resposta ao qa-redteam). Justificativa completa em `docs/specs/anexos/SPEC-04-decisoes-T-04.1.md`.

| # | Decisão | Escolha |
|---|---|---|
| D-19 | Reenvio de item já excluído | 200 com `deleted_at`, reconhecido antes de papel e status |
| D-20 | `quantity` | 1 a 9999, padrão 1 |
| D-21 | Garçom | Só item do cardápio e faturável; avulso e cortesia com ADMIN/RECEPTIONIST; preço do cliente ignorado com `product_id` |
| D-22 | Conta `ROOM` | Só recebe item com a reserva `CHECKED_IN` |
| D-23 | Recusas | `reason` em item faturável → 422; excluir item de conta fechada → 422; preço com 3 casas → 400 |
| D-24 | Total da conta `INTERNAL` | Soma no GET; o total zero é regra do `/bill` (T-04.3) |

#### O que foi feito

1. **Research:** `AccountItemModel`, constraints de `account_items`, consumo antigo (`ConsumptionApi`), `productValidation`, padrão do Swagger.
2. **TDD:** `tests/account-items.test.js`. RED com 43 falhas, todas por rota inexistente.
3. **Implementação:**
   - `accountTotal.js`: soma no Postgres, devolvida como texto (`'24.00'`), filtrando hotel, faturável e não excluído.
   - `CreateAccountItemController`: total em centavos, conta travada com `FOR UPDATE` durante o lançamento (prepara a T-04.3), reenvio por `client_item_id` inclusive na corrida pega pelo índice único.
   - `DeleteAccountItemController`: só ADMIN, soft delete com `deleted_by`.
   - `accountRuleViolation` ganhou as 5 constraints de `account_items`.
   - Swagger de `/accounts` com schema de resposta, validado com `swagger-parser` e conferido campo a campo contra os models.
4. **Achado por mutação (`8405298`):** o `save()` antes do `destroy()` era redundante. O `destroy` de model paranoid já faz `save()` dos campos alterados, então `deleted_by` e `deleted_at` saem num UPDATE só. O mutante sobrevivia; o `save()` foi tirado. O `DeleteConsumptionController` tem o mesmo padrão (inofensivo).
5. **Erro meu, corrigido na hora:** a função de mutação restaurava só os controllers, e um mutante em `accountTotal.js` (arquivo ainda não rastreado) ficou no disco. Detectado antes do commit e desfeito. Daí em diante, backup de todo arquivo mutado no scratchpad.
6. **Auditorias:**
   - `/security-review`: sem achados.
   - qa-redteam: **APROVADO COM RESSALVAS**, 0 🔴, 3 🟡, 6 🟢 (`docs/qa/redteam_t041-accounts_19out2026.md`). Ele reproduziu corridas reais em paralelo: 6 reenvios simultâneos geram 1 linha; 5 aberturas da RN-005 geram um 201 e quatro 422.
7. **Correção das ressalvas** (`27b0b8d` RED, `d5ca9da` fix): os 3 🟡 e 4 dos 🟢. Ficaram de fora a paginação (T-06.10) e o total da conta `INTERNAL` (D-24, T-04.3).

#### Verificação

- `npm test`: **672 passed + 1 skip**, em 35 arquivos.
- `tests/accounts.test.js` + `tests/account-items.test.js`: 104/104.
- Mutações, todas pegas por pelo menos um teste: reenvio na corrida, `paranoid: false` do reenvio, atribuição de `deleted_by`, garçom dando cortesia, soma incluindo cortesia, garçom lançando avulso, conta `ROOM` depois do check-out, corrida com id em maiúsculas, teto de `quantity`, limite de casas decimais.
- `qa_checks.sh`: sem erro. O aviso de `/accounts` sem Swagger sumiu; os 3 restantes são de outras áreas.

#### Commits

| Hash | Mensagem |
|------|----------|
| `711041a` | `test(accounts): itens da conta (RED)` |
| `9d199d0` | `feat(accounts): soma da conta e constraints de itens em 422` |
| `b624300` | `feat(accounts): lancar item com idempotencia e cortesia` |
| `8405298` | `feat(accounts): excluir item com auditoria` |
| `86a7b8c` | `docs(api): Swagger de /accounts com schema de resposta` |
| `21be026` | `docs(qa): auditoria qa-redteam da T-04.1, Blocos B a D` |
| `27b0b8d` | `test(accounts): ressalvas do qa-redteam de 19/10 (RED)` |
| `d5ca9da` | `fix(accounts): ressalvas do qa-redteam de 19/10` |
| `caa4da4` | `docs(api): limites e regras novas de /accounts no Swagger` |
| (este) | `docs(accounts): relatorio do Bloco D e decisoes D-19 a D-24` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | **T-04.2** — migrar `consumptions` para `account_items` | — | `amount (12,2)` × `total (10,2)`: conferir antes (CA-04.2.a). Migrar `deleted_by` (D-7) |
| 2 | **T-04.3** — `/bill` e fechamento | — | Conta `INTERNAL` fecha com total 0 (D-24); conta `ROOM` fecha no check-out (D-22). O `FOR UPDATE` do lançamento e da exclusão já espera o fechamento. Reusar `accountTotal` |
| 3 | Paginação de `GET /accounts` | 🟢 Baixa | Entra na T-06.10, junto com as outras listagens |
| 4 | `migrate` sobre banco do `schema.sql` falha em `event_quotes.status` | 🟡 Média | Herdada de 14/10, sem mudança. Combinar com o Gabriel |
| 5 | `save()` redundante no `DeleteConsumptionController` | 🟢 Baixa | Inofensivo; some na T-04.2, quando o consumo antigo for descontinuado |
| 6 | MER: `deleted_by` (D-7) e RN-005 por estadia (D-3) | 🟢 Baixa | Próxima versão sugerida do Doc 04 |
| 7 | Worktree antiga `.claude/worktrees/agent-ae7abde1edc85f246` | 🟢 Baixa | Branch já integrada, worktree limpa. Pode ser removida |
