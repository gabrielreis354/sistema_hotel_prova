# Repasses — Sirlande — 07/10/2026

Origem: `docs/qa/redteam_paranoid-unique-merge_07out2026.md` (auditoria do PR #82).
Fora do diff do PR #82 (linhas de `e7100caa`, agosto), mas na área de schema/constraints (§7).

### 🟡 [testes] Dois testes de CHECK de products passam sem executar nenhuma asserção
**Onde:** `services/core-service/tests/db-constraints.test.js:23-41`
(`if (!tenant) return; // sem tenant seedado neste ponto da suíte`)
**Cenário:** na ordem padrão do Vitest, `db-constraints.test.js` é o **1º** arquivo da suíte
(conferido com `--reporter=verbose`), e o `globalSetup` acabou de rodar `sync({force:true})`. Por
isso `SELECT id FROM tenants LIMIT 1` volta vazio e os testes "o banco rejeita category fora da
allowlist" e "o banco rejeita price negativo" retornam antes do `expect`. Ficam verdes mesmo se os
CHECK `products_category_allowlist`/`products_price_non_negative` sumirem. O próprio arquivo já
corrige esse padrão no teste "ciclo" (`:205-213`, "Um `if (!tenant) return` aqui deixaria o teste
passar vazio").
**Regra violada:** teste que passaria com a regra quebrada (checklist qa-redteam §8).
**Correção sugerida:** criar o tenant no próprio teste (`INSERT … RETURNING id`, como em `:209`) e
apagá-lo no fim; ou `expect.assertions(1)`.
