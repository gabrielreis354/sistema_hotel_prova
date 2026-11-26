# QA Red Team — SPEC-10, F6 (comanda), rodada DELTA
**Branch:** feature/t10-fase6-comanda · **Dev:** Sirlande · **Base da delta:** 10fb4a5 · **HEAD:** 858061f · **Data:** 26/11/2026
**Arquivos auditados:** 8 (`git diff 10fb4a5...HEAD -- frontend/`, commits f6e62fa, 8f1f44b, 97399e1, 65955ce, e965d60)
**Achados no escopo:** 4 (🔴 0 · 🟡 1 · 🟢 3) · **Repassados:** 1

## Veredito
APROVADO COM RESSALVAS

Não há 🔴. O diff só mexe em `frontend/`: nenhuma rota, contrato ou regra mudou. O 🟡-1 vem do commit e965d60, que resolveu o repasse do foco. Ao devolver o foco à lista, a página rola sozinha e o cardápio desce 74 px debaixo do dedo do garçom. É o P0 antigo voltando por outro caminho. A correção é uma linha e convém fazê-la antes do merge.

Rodado na worktree:
- `vitest run` em `apps/pms`: 69 arquivos, 716 testes, todos verdes.
- `tsc --noEmit` em `apps/pms`: limpo.
- Ambiente vivo (`localhost:5173`, que serve esta branch: conferi que `StickyFooter` e `focusList` estão no código servido), com Playwright headless. Usei garçom a 360×740 e 360×640 com toque, e admin a 1366×900 e 390×844 com mouse. Os lançamentos de teste foram desfeitos. A API mostrou a Mesa 3 com `total "104.00"` e 2 itens depois de cada rodada (4 conferências).

## Achados no escopo

### 🟡-1 [UI / P0 do cardápio] O "Desfazer" da última unidade rola a página e o cardápio desce 74 px
**Onde:** `frontend/apps/pms/src/features/accounts/components/ItemList.tsx:184` (`focusList = () => box.current?.focus()`), chamado pelo novo `onClick` em `ItemList.tsx:299-304` (e965d60)
**Cenário:** medido ao vivo como garçom, a 360×640 com toque, na Mesa 3. O cardápio vai até 919 px de documento, então para tocar o último produto o garçom rola a página (`scrollY` 279). Com isso, o topo da caixa "Itens lançados" fica acima da tela (`top: -86`) e o "Desfazer" continua visível (`y: 33`). Ele toca em "Caipirinha" e depois em "Desfazer" (quantidade 1). O `focus()` sem `preventScroll` puxa a caixa para a vista: o `scrollY` cai de 279 para 205, e o último produto do cardápio passa de `y: 469` para `y: 543`. O toque seguinte, feito no lugar de sempre, cai em outro produto. É exatamente o que o P0 da revisão Impeccable proibiu, e o comentário de `ItemList.tsx:158-161` diz que a caixa existe para impedir isso. O `QuantityField` (`onLostFocus={focusList}`) já usava a mesma função antes da branch, mas só no Enter ou no blur do campo. O "Desfazer" é tocado o tempo todo, então a exposição sobe muito.
**Regra violada:** P0 da revisão Impeccable (o cardápio não se move no celular), `DESIGN_PMS.md` (comanda de uma mão) e o critério "cardápio não pode se mover" da SPEC-10 F6.
**Correção sugerida:** `box.current?.focus({ preventScroll: true })` em `focusList`. Isso corrige também o caminho do `QuantityField`. A WCAG 2.4.3 continua atendida, porque o foco vai para a região do mesmo jeito.

### 🟢-1 [Design system] O hover do botão "Mais" da barra do celular voltou a pintar com mouse
**Onde:** `frontend/packages/ui/src/Button.tsx:32-33` (8f1f44b) × `frontend/apps/pms/src/components/AppShell.tsx:319` (`hover:bg-transparent`)
**Cenário:** antes, o twMerge descartava o `hover:bg-gray-100` do ghost em favor do `hover:bg-transparent` do "Mais". O `[@media(hover:hover)]:hover:bg-gray-100` tem outro modificador e por isso não conflita: o twMerge mantém os dois (conferido com `tailwind-merge`). No CSS gerado, a regra com media vem depois (byte 53025 contra 39853) e vence. Ao vivo, como admin a 390×844 com mouse (tablet com trackpad, janela estreita): o fundo do "Mais" vai de `transparent` para `rgb(243 244 246)` no hover. Com a folha aberta, o hover troca o `bg-brand/5` pelo cinza. No toque não muda nada. Fiz uma busca e nenhum outro `Button`/`ButtonLink` passa `hover:` no `className`. As outras telas ganharam o que se queria: no celular, o produto da comanda fica `rgb(255 255 255)` depois do toque, e o `active:scale` do `MenuGrid` continua dando o retorno ao toque.
**Regra violada:** regressão visual sem dano, por um efeito colateral do twMerge com variante arbitrária.
**Correção sugerida:** trocar `hover:bg-transparent` por `[@media(hover:hover)]:hover:bg-transparent` no `AppShell.tsx:319`, ou registrar no `CATALOGO.md` que quem sobrescreve o hover do secondary/ghost precisa usar a mesma variante.

### 🟢-2 [Texto / tom] "Fechada" em âmbar fica para sempre na conta INTERNAL e na de total 0
**Onde:** `frontend/apps/pms/src/features/accounts/accountFilter.ts:15-24`
**Cenário:** o comentário justifica o âmbar assim: "fechada em geral ainda tem saldo a receber". Pelo `settleAccount` (`services/core-service/app/utils/accountBill.js:59-85`), porém, a conta INTERNAL nunca chega a PAID (o banco recusa pagamento nela), e a conta fechada com total 0 sem pagamento direto também fica CLOSED. Nos dois casos não há nada a receber, e mesmo assim o selo de atenção continua aceso para sempre. A escolha dos tons respeita o `CATALOGO.md`: o tom está dentro do `StatusTone`, e o âmbar `cleaning` já faz o papel de "atenção" no painel Hoje (`attention.ts`, `todayLogic.ts`). O HTML está correto: o `StatusBadge` é `<span>` e entra num `<span>` dentro do `<p>` do `PageHeader`, que só aceita conteúdo de frase (conferido no DOM vivo da conta paga). O ponto tem `aria-hidden` e o rótulo vem em texto.
**Regra violada:** nenhuma regra dura. O sinal de atenção perde valor quando acende sem motivo.
**Correção sugerida:** `accountStatusBadge(account)` recebendo a conta, com tom `free` para `CLOSED` quando `type === 'INTERNAL'`. Outra saída é só ajustar o comentário. Pode ficar para depois do congelamento.

### 🟢-3 [Testes] O teste da R-4 aceita um `StickyFooter` importado e não usado
**Onde:** `frontend/apps/pms/src/components/AppShell.test.tsx:113-115`
**Cenário:** o teste lê o fonte e procura a string `<StickyFooter`. Ele continua verde se o total voltar a uma `div` sem sticky e o componente sobrar só num comentário ou num ramo morto. O mesmo vale para o `xl:static` e para os dois `EntryState`, que não têm teste de render (o 🟢-4 da rodada anterior já registra a falta de teste de leiaute).
**Correção sugerida:** renderizar `AccountsListPage`/`AccountPage` com dados falsos e conferir que o botão "Abrir conta" e o total têm um ancestral com a classe `sticky`. Ou aceitar o teste como está, já registrado.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟢 | "Cancelar" do formulário de abrir conta derruba o foco no `<body>` (já acontecia antes da branch: o botão e o formulário sempre se alternaram) | `frontend/apps/pms/src/features/accounts/components/OpenAccountForm.tsx:100` + `AccountsListPage.tsx:140-156` | Sirlande (comanda) | `docs/qa/repasses/para_sirlande_26112026.md` |

## O que foi verificado e está correto
- **"Abrir conta" fixo × última conta:** 18 contas a 360×740. No topo da página, o rodapé fica em 661–734 (6 px do pé, `--tabbar:0` do garçom). Rolado até o fim, ele fica em 629–702, depois da última conta (`bottom: 616`), e não a cobre: é o último filho do fluxo e o sticky solta no fim. Captura: `lista_fim_360.png` no scratchpad.
- **Formulário e aviso de nome repetido:** ao tocar em "Abrir conta", o botão some (0 botões com esse nome), o campo recebe o foco e fica à vista (`y: 577–625`). Com "Mesa 3", o aviso "Já existe uma conta aberta com esse nome… Ir para essa conta" aparece sem nada fixo por cima, porque o rodapé não está montado enquanto `opening` vale.
- **EmptyState:** com `data.length === 0`, o `EmptyState` traz o próprio botão e o `StickyFooter` não monta (`(data?.length ?? 0) > 0`). Não aparecem dois "Abrir conta". Na carga e no erro sem dados também não há botão, como antes. Uma busca sem resultado mantém o botão, o que está correto.
- **Dois `EntryState`:** a 360 px, o `innerText` da caixa e a árvore de acessibilidade têm "Aguardando envio" uma vez só. O outro nó está em `display:none`, e o nome acessível do "Desfazer" não mudou. Nenhum dos dois é live region, então a troca de nó quando a janela vence não gera anúncio duplicado.
- **P0 no toque do produto:** a 360 px, o produto ficou em `y: 443` antes e depois do lançamento. A caixa segue com 176 px (`h-44`) abaixo de 1280 px.
- **Caixa no xl (1366):** com 2 itens, ela fica no mínimo de 176 px. Com 6 lançamentos, cresce até 448 px (28rem), rola sozinha até o fim (`scrollTop 40 = scrollHeight − clientHeight`), e o cardápio fica parado em `y: 215`. O `<p>` do vazio ocupa a caixa pelo `xl:flex-1`.
- **Foco do "Desfazer" (e965d60):** a 360 px com toque, depois de desfazer a quantidade 1, o `activeElement` é a região "Itens lançados". Com quantidade maior que 1, o botão continua montado ("Desfazer 1"), e por isso não chama `focusList`, o que está correto. O problema de rolagem está no 🟡-1.
- **Selo:** na conta paga aparece `<span…bg-status-free…>Paga</span>` dentro do `<p>` do `PageHeader`. A Mesa 3 (aberta) fica sem selo. O motivo "Conta fechada: não recebe item novo." continua no cardápio indisponível.
- **InfoNotice do dado velho:** mesmo componente dos outros avisos da tela, sem `role` duplicado. O aviso só aparece com `stale && !offline`.
- **`accountContext`:** "Mesa1", "Mesa-2" e "Day use piscina" ficam sem o tipo repetido, e "Mesanino 2" continua mostrando "Mesa". Tudo com teste. O `\p{L}` só olha o caractere logo depois do prefixo, então um rótulo como "Mesa 2B" continua correto.
- **Hover só com mouse:** a 1366, com mouse, o produto (secondary) ganha `rgb(249 250 251)` no hover. No toque, o `:hover` não gruda. Só o "Mais" sobrescrevia o hover (🟢-1).
- **ESM, sem `require`.** Nenhum `services/`, `api-client` ou rota no diff.

## Não foi possível verificar
- **Leitor de tela real** (TalkBack, VoiceOver). Inferi pelo `innerText`, pelo `accessibility.snapshot` do Chromium e pelo DOM.
- **Conta fechada (CLOSED) ao vivo:** não havia ID à mão, e fechar uma conta deixaria dado. O selo "Fechada" foi conferido só pelo teste unitário e pelo mesmo caminho de render da "Paga".
- **iOS Safari:** a rolagem do `focus()` no 🟡-1 foi medida no Chromium (emulação mobile). O Safari também rola no `focus()` sem `preventScroll`, mas não medi quantos pixels.

## Resolução (26/11, mesma sessão)

| Achado | O que foi feito | Commit |
|---|---|---|
| 🟡-1 foco ao desfazer rola a página | `focus({ preventScroll: true })` no `focusList` (vale também para o campo de quantidade). Medido em 360×640 com a página rolada até o fim: `scrollY` 279 antes e depois, o último produto parado em y=469, foco em "Itens lançados" | ver o commit "fix(comanda): devolver o foco à lista sem rolar a página" |
| 🟢-1 hover do "Mais" | `[@media(hover:hover)]:hover:bg-transparent`, na mesma variante do `Button`. Medido: fundo transparente com e sem hover | idem |
| 🟢-2 "Fechada" em âmbar que não apaga (conta interna, total zero) | Fica: decisão de 26/11 registrada; o caso aparece para a conta interna, que a recepção conhece. Revisitar se o Gabriel mudar a regra das ações (repasse de 26/11) | — |
| 🟢-3 teste da R-4 só procura a string | Fica: os testes rodam sem CSS; o sticky foi conferido nas capturas de 390 e 768 | — |
