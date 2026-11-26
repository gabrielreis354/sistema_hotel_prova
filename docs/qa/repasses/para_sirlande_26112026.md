# Repasse para Sirlande — 26/11/2026
Origem: qa-redteam da F6 da SPEC-10 (`docs/qa/redteam_spec10-fase6-comanda_26112026.md`). É anterior à branch `feature/t10-fase6-comanda` e por isso não entra no veredito dela.

### 🟢 [A11y] Desfazer a última unidade derruba o foco no `<body>`
**Onde:** `frontend/apps/pms/src/features/accounts/components/ItemList.tsx:282-286` (botão "Desfazer", sem devolução de foco ao desmontar)
**Cenário:** o garçom, com teclado ou leitor de tela, toca em "Água mineral" e ativa "Desfazer" (quantidade 1). A linha sai da fila, o botão focado é desmontado e `document.activeElement` passa a ser o `BODY`. Conferido ao vivo a 390, 360 e 700 px. O leitor de tela não anuncia nada e o próximo Tab recomeça do topo da página ("Pular para o conteúdo"). O `QuantityField` já resolve esse mesmo caso com `onLostFocus={focusList}` (🟡-3 do qa-redteam de 16/11), mas o botão "Desfazer" ficou de fora.
**Regra violada:** WCAG 2.4.3 (ordem de foco), a mesma do 🟡-3 de `redteam_comanda-quantidade_16112026.md`.
**Correção sugerida:** no `onClick` do "Desfazer", quando `entry.quantity === 1` (a linha vai sumir), chamar `focusList()` depois do `onUndo`. Outra saída é um efeito que foque a região "Itens lançados" quando o elemento ativo for desmontado.

**Resolvido em 26/11, na própria F6** (decisão do Sirlande): `focusList()` depois do `onUndo` quando a quantidade é 1 (`e965d60`). Conferido no navegador: depois do Enter no "Desfazer", o foco fica na região "Itens lançados".

---
Origem: qa-redteam DELTA da F6 (`docs/qa/redteam_spec10-fase6-comanda_delta_26112026.md`). É anterior à branch (o formulário e o botão já se alternavam antes de 10fb4a5) e por isso não entra no veredito.

### 🟢 [A11y] "Cancelar" do formulário de abrir conta derruba o foco no `<body>`
**Onde:** `frontend/apps/pms/src/features/accounts/components/OpenAccountForm.tsx:100` (`onClick={onCancel}`) + `frontend/apps/pms/src/features/accounts/AccountsListPage.tsx:140-156`
**Cenário:** medido ao vivo como garçom a 360×740. Ele toca em "Abrir conta", que desmonta o botão e foca o campo. Depois toca em "Cancelar". O formulário desmonta com o botão focado dentro, o "Abrir conta" volta como um nó novo no `StickyFooter`, e o `document.activeElement` passa a ser o `BODY`. Para o leitor de tela, o próximo Tab recomeça do topo.
**Regra violada:** WCAG 2.4.3 (ordem de foco), a mesma família do repasse do "Desfazer" acima.
**Correção sugerida:** um `ref` no botão "Abrir conta" e, no `onCancel`, `setOpening(false)` seguido do foco nesse botão depois do render (num `useEffect` que olha `opening` e só age depois de um cancelamento). Pode ficar para depois do congelamento.

---
Origem: qa-explorador, passada final da SPEC-10 (`docs/qa/exploratorio_final_spec10_26112026.md`). Os dois são anteriores à SPEC-10 (o código é o mesmo na `develop`) e por isso não entram no veredito dela.

### 🟡 [Tempo] Duplo clique em "Sim, fechar" na comanda manda dois PUT e mostra "Conta CLOSED não pode ser fechada"
**Onde:** `frontend/apps/pms/src/features/accounts/components/StaffActions.tsx:171-188` (`disabled={close.isPending || !fresh}`, sem trava síncrona)
**Passos:** recepção, 768×1024, `/comanda/<mesa QA>` com R$ 24,00 → "Fechar conta" → duplo clique em "Sim, fechar".
**Obtido:** `PUT /accounts/:id/close` 200 e logo depois 422; a tela mostra em vermelho "Conta CLOSED não pode ser fechada" (código interno) e "A conta já está fechada", num fechamento que deu certo. Evidência: `evidencias/final_spec10_26112026/mcp/comanda-fechar-duplo_768.png`.
**Regra:** SPEC-11 §2 ("nenhum clique duplo vira erro falso"; a mensagem nunca mostra código interno). O C-12 (`closeGuard`, 400 ms) protege o toque em "Fechar conta", não o "Sim, fechar".
**Sugestão:** a mesma trava síncrona por ref (`mutateOnce`) usada no detalhe da reserva.

### 🟡 [Tempo] Duplo clique em "Cadastrar" no novo hóspede: grava e mostra "CPF ou e-mail já cadastrado"
**Onde:** `frontend/apps/pms/src/features/guests/GuestFormPages.tsx:26-31` (`submitting={create.isPending}`, sem `submitOnce`)
**Passos:** recepção, 1366×768, `/hospedes/novo`, preencher (CPF 529.982.247-25, e-mail `@qa.test`) → duplo clique em "Cadastrar".
**Obtido:** `POST /guests` 201 e 409; a tela fica no formulário com o alerta "CPF ou e-mail já cadastrado para outro hóspede." O hóspede foi criado (aparece uma vez na lista). A recepcionista acha que falhou e pode recadastrar com outro dado.
**Regra:** SPEC-11 §2, o mesmo defeito "A" que a T-11.3 resolveu em quartos e categorias, mas o formulário de hóspede ficou fora do CA-11.a.
**Sugestão:** `submitOnce`/`submitLock` de `lib/`, como em `RoomFormPages.tsx`.
