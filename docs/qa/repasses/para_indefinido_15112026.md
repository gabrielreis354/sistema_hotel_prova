# Repasses do qa-redteam — DONO INDEFINIDO — 15/11/2026

Origem: auditoria da branch `fix/t091-comprovante-emissor` (`docs/qa/redteam_t091-comprovante-emissor_15nov2026.md`).

### 🟡 [Testes] O `vite.config.test.ts` nunca é executado
**Onde:** `frontend/apps/pms/vitest.config.ts:9` (`include: [..., 'vite.config.test.ts']`) e `frontend/apps/pms/vite.config.test.ts`
**Dono:** INDEFINIDO. É o ferramental do `apps/pms`, que não aparece no §4.4 nem no §7 da divisão. O commit que criou o teste, `1db4209` (14/11), é do Gabriel.
**Cenário:** o `exclude` padrão do Vitest 2.1.9 inclui `**/{karma,rollup,webpack,vite,vitest,…}.config.*`, e `vite.config.test.ts` casa com `vite.config.*`. Como o `exclude` vence o `include`, o arquivo nunca entra na suíte.
- `cd frontend/apps/pms && npx vitest run vite.config.test` mostra "No test files found, exiting with code 1".
- `npx vitest run --reporter=verbose` lista 25 arquivos, todos em `src/`.

Os testes que esse arquivo diz cobrir (as portas do proxy a partir do `.env` da raiz, 🟢-1 do red team de 14/11) não rodam no CI. Uma regressão no `vite.config.ts` passaria verde.
**Regra violada:** um teste que não executa não prova nada. O checklist §8 do red team pede teste que falhe quando a regra quebra.
**Correção sugerida:** renomear para `src/devProxy.config.test.ts` (ou outro nome fora do padrão `*.config.*`) e ajustar o `include`. A alternativa é sobrescrever o `exclude` no `vitest.config.ts`, mantendo `configDefaults.exclude` e retirando só o padrão de config. Depois, conferir na lista verbose que o arquivo aparece.
