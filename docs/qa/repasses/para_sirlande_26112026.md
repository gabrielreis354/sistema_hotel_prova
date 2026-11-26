# Repasse para Sirlande — 26/11/2026
Origem: qa-redteam da F6 da SPEC-10 (`docs/qa/redteam_spec10-fase6-comanda_26112026.md`). É anterior à branch `feature/t10-fase6-comanda` e por isso não entra no veredito dela.

### 🟢 [A11y] Desfazer a última unidade derruba o foco no `<body>`
**Onde:** `frontend/apps/pms/src/features/accounts/components/ItemList.tsx:282-286` (botão "Desfazer", sem devolução de foco ao desmontar)
**Cenário:** o garçom, com teclado ou leitor de tela, toca em "Água mineral" e ativa "Desfazer" (quantidade 1). A linha sai da fila, o botão focado é desmontado e `document.activeElement` passa a ser o `BODY`. Conferido ao vivo a 390, 360 e 700 px. O leitor de tela não anuncia nada e o próximo Tab recomeça do topo da página ("Pular para o conteúdo"). O `QuantityField` já resolve esse mesmo caso com `onLostFocus={focusList}` (🟡-3 do qa-redteam de 16/11), mas o botão "Desfazer" ficou de fora.
**Regra violada:** WCAG 2.4.3 (ordem de foco), a mesma do 🟡-3 de `redteam_comanda-quantidade_16112026.md`.
**Correção sugerida:** no `onClick` do "Desfazer", quando `entry.quantity === 1` (a linha vai sumir), chamar `focusList()` depois do `onUndo`. Outra saída é um efeito que foque a região "Itens lançados" quando o elemento ativo for desmontado.

**Resolvido em 26/11, na própria F6** (decisão do Sirlande): `focusList()` depois do `onUndo` quando a quantidade é 1 (`e965d60`). Conferido no navegador: depois do Enter no "Desfazer", o foco fica na região "Itens lançados".
