### 2026-10-14 — Sirlande (orquestrando Claude Code)

- **Branch:** `feature/t04-1-accounts` (sai de `develop` em `bfb91e2`) · **Tarefa:** T-04.1, Bloco B (SPEC-04 §5)
- **Objetivo:** `accounts` e `account_items` no banco, com as regras de negócio garantidas pelo PostgreSQL, antes de existir qualquer controller

#### Contexto de abertura

- `develop` estava 78 commits atrás do remoto: PIX, `/metrics`, reservas multiquarto, T-06.13 e ADR-007 candidata, todos do Gabriel. Atualizado por fast-forward.
- O Bloco A (allowlist do `WAITER`) já estava em `origin/develop`. A pendência 🔴 do relatório de 07/10 está fechada.
- O `/metrics` trouxe dependência nova. É preciso rodar `npm ci` em `services/core-service` antes dos testes.

#### Decisões desta sessão

| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| D-10 | `total = quantity × unit_price` como CHECK | Mantido (aprovado pelo Sirlande) | Reforça o CA-04.1.c no banco. Conferido contra a T-04.2 (migra como `quantity 1`), a T-04.6 (divide **contas**, não itens) e a RN-007. Nenhum RF tem desconto por item. Inteiro × `NUMERIC(10,2)` é exato, então não há falso positivo por centavo |
| D-11 | Onde vive o índice total da D-6 | Só em `applyDbConstraints` e `schema.sql`, fora do `indexes:` do model | A regra 8 do `qa_checks.sh` continua sem exceção para models. A única exceção do projeto fica nomeada em `db-constraints.test.js`, com a justificativa |
| D-12 | D-4 e D-5 também no banco | 4 CHECKs em `accounts` | Segunda barreira atrás dos 422 do Bloco C, mesmo raciocínio do `EXCLUDE` anti-double-booking |
| D-13 | `total >= 0` da MER | Sem CHECK próprio | Fica implícito em `quantity > 0`, `unit_price >= 0` e `total = quantity × unit_price`. Um CHECK redundante também impediria provar cada regra isoladamente |

#### O que foi feito

1. **Research:** SPEC-04, MER 4.11 e 4.12 (`docs/sugestoes-documentos-oficiais/04-mer/versao-sugerida_v1.2.md`), `ProductModel`, `applyDbConstraints`, `db-constraints.test.js` e regra 8.
2. **TDD:** `tests/accounts-db.test.js`, com 51 testes de INSERT direto no banco.
   - No primeiro RED, os casos "recusa…" passavam porque a tabela não existia: o `rejects.toThrow()` genérico aceita qualquer erro.
   - Trocado por `recusadoPor(promessa, constraint)`, que exige o **nome** da constraint. Cada caso viola exatamente uma regra.
   - Resultado: RED com 30 falhas e 0 falsos verdes.
3. **Models:** `AccountModel` com o índice parcial da RN-005, `AccountItemModel` com `deleted_by` (D-7), `app/utils/accountEnums.js` e a seção 12 do `relations.js`, só acrescentada ao final.
4. **`applyAccountConstraints`** em `applyDbConstraints.js`, mais o `schema.sql` com os mesmos nomes de constraint.
5. **Erro meu, corrigido em commit próprio (`34a20ca`):**
   - Eu tinha escrito que o `belongsTo` sobrescreve o `onDelete` do atributo, e repeti o `onDelete` nas associações.
   - A mutação provou o contrário: tirar o `onDelete` das associações não muda nada; tirar do atributo vira `SET NULL` e quebra o teste de FK.
   - A repetição e o comentário foram removidos. O teste de FK fica, provado por mutação.

#### Verificação

- `npm test`: **490 passed + 1 skip**, em 29 arquivos.
- `qa_checks.sh`: sem erro. Os 3 avisos são anteriores a esta branch (Swagger de rotas B2B e frontend).
- Provisionamento verificado em bancos descartáveis, já removidos:
  - `migrate` em banco vazio, rodado 2×: 11 CHECKs, 7 índices e FKs com a ação do MER. É idempotente.
  - `schema.sql` puro: mesmas constraints e índices.
  - `schema.sql` seguido de `migrate`: as constraints de conta aplicam, mas o `sync({alter})` falha em `event_quotes` (ver pendência 1). O erro **reproduz no `develop`** sem esta branch.
- **Não rodados:** qa-redteam e `/security-review`. Pela tabela de blocos, rodam depois do Bloco D, antes do merge.

#### Commits

| Hash | Mensagem |
|------|----------|
| `dd1a15e` | `test(accounts): constraints de banco de accounts e account_items (RED)` |
| `e7ad820` | `feat(accounts): models Account e AccountItem com relations` |
| `34a20ca` | `fix(accounts): onDelete fica so no atributo do model` |
| `8cce937` | `feat(db): CHECKs, RN-005 e idempotencia de account_items` |
| (este) | `docs(historico): relatorio do Bloco B da T-04.1 (14/10)` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | `migrate` sobre banco provisionado pelo `schema.sql` falha: `default for column "status" cannot be cast automatically to type enum_event_quotes_status` | 🟡 Média | **Anterior a esta branch** (reproduzido no `develop` `bfb91e2`). O `schema.sql` declara `status TEXT` e o `EventQuoteModel` usa ENUM. O `schema.sql` é do Sirlande; o model é do B2B. Combinar com o Gabriel. Banco provisionado só por `migrate` não é afetado |
| 2 | Bloco C: `POST/GET /accounts`, `GET /accounts/:id`, regras por tipo (D-5), RN-005 → 422 | — | Os CHECKs dão a segunda barreira. O controller precisa traduzir para 422 com mensagem, nunca deixar virar 500. Nomes das constraints em `tests/accounts-db.test.js`. Reserva multiquarto: o quarto da conta tem que estar em `reservation_rooms`, não só em `reservations.room_id` |
| 3 | Bloco C/D: forçar `charges_lodging: false` fora de `ROOM` | — | O default da coluna é `true` (MER). Um INSERT de `TABLE` sem o campo é **recusado** pelo CHECK, então o servidor precisa gravar `false` explicitamente (D-4) |
| 4 | Bloco D: o reenvio do `client_item_id` responde 200 com o item existente, inclusive quando o item foi excluído (D-6) | — | Decidir a resposta para item excluído: devolver o item com `deleted_at` ou 409. Hoje o banco só garante que não duplica |
| 5 | MER: sugerir `deleted_by` em `ACCOUNT_ITEMS` (D-7) e o escopo da RN-005 por estadia (D-3) | 🟢 Baixa | Entra na próxima versão sugerida do Doc 04 |
| 6 | T-04.2: `consumptions.amount` é `NUMERIC(12,2)`, `account_items.total` é `(10,2)` | 🟢 Baixa | Acima de R$ 99.999.999,99 não migraria. Irreal, mas o CA-04.2.a diz "sem perda de valor": a migração deve checar antes |
| 7 | qa-redteam com foco em dados | — | O `estado.sh` recomenda já, porque há model e schema no diff. Pelo plano, roda após o Bloco D sobre a branch inteira. Se preferir uma rodada antecipada só do schema, é aqui |
| 8 | Próximo: **Bloco C**, na mesma branch | — | — |
