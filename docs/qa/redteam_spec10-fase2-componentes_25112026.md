# QA Red Team — SPEC-10 F2 (componentes base e casca)
**Branch:** feature/t10-fase2-componentes · **Dev:** Sirlande · **Base:** feature/spec-10-identidade@d67f64f (HEAD 3c0974d) · **Data:** 25/11/2026
**Arquivos auditados:** 19 (diff `feature/spec-10-identidade...HEAD`; nada fora de commit)
**Achados no escopo:** 12 (🔴 0 · 🟡 4 · 🟢 8) · **Repassados:** 0

## Veredito
APROVADO COM RESSALVAS

Não há 🔴. Os quatro 🟡 travam o portão da §10.6 da SPEC-10 ("qa-redteam sem 🔴 nem 🟡 aberto"):
fecha cada um com correção ou com uma decisão registrada.

Testes da F2 rodados: `vitest run src/components/uiBase.test.tsx src/components/AppShell.test.tsx` → 32/32 verdes.

## Achados no escopo

### 🟡 [Casca/teclado] A trava da rolagem continua quando a folha "Mais" some porque a tela passou de 768 px
**Onde:** `frontend/apps/pms/src/components/AppShell.tsx:211-219` (o efeito que põe `body.style.overflow = 'hidden'`) junto com `:236` (`<div className="md:hidden">` envolve o `MobileTabs`)
**Cenário:** a recepcionista abre o "Mais" num celular grande em retrato e gira para paisagem (iPhone Pro Max deitado tem 932 px; tablet em 768 px). O `md:hidden` só esconde a folha e o fundo pelo CSS. O componente continua montado com `open = true`, então o `overflow: hidden` fica no body. A tela agora tem a barra lateral e nenhuma folha visível, mas não rola: o topo da lista de reservas fica preso. A trava só sai com o Esc (num aparelho de toque não tem) ou com uma navegação pela barra lateral (o `pathname` muda e a folha fecha). Antes da F2 a folha só ficava escondida e não fazia mal. A trava é que transforma isso num travamento.
**Regra violada:** a F2 prometeu travar a rolagem só com a folha aberta e visível (efeito colateral proibido do RPI)
**Correção sugerida:** fechar a folha quando a mídia `(min-width: 768px)` passa a valer (`matchMedia(...).addEventListener('change', …)` dentro do mesmo efeito), ou aplicar a trava só enquanto essa mídia não vale.

### 🟡 [Contraste] "Excluir" do cabeçalho do hóspede tem texto vermelho de 4,39:1 sobre o areia e agora menor
**Onde:** `frontend/apps/pms/src/features/guests/GuestDetailPage.tsx:93-97` (`size="compact"`, `variant="ghost"`, `className="text-status-maintenance"`)
**Cenário:** o ghost é transparente e o cabeçalho fica direto sobre o `bg-ground` da casca (246 244 239). `#dc2626` sobre esse fundo dá **4,39:1**, abaixo dos 4,5:1 (sobre branco daria 4,83:1). A F2 pôs `size="compact"` nessa linha, e o texto caiu de `text-base` para `text-sm` (14 px, peso 500). Ele não chega a "texto grande", então vale o 4,5:1. No hover (`bg-gray-100`) a diferença aumenta. O defeito começou com o fundo areia da F1, mas esta branch mexeu justo nessa linha e não o corrigiu. É também o caso que você pediu para olhar ("ghost com text-status-maintenance").
**Regra violada:** SPEC-10 §10.6 (texto ≥ 4,5:1, com as cores reais)
**Correção sugerida:** um vermelho mais escuro só para texto (`red-700` `#b91c1c` dá cerca de 6:1 sobre o areia), ou o `secondary` com texto vermelho (fundo branco, 4,83:1).

### 🟡 [Contraste] A borda do novo secundário mede 1,47:1 sobre branco e 1,33:1 sobre o areia
**Onde:** `frontend/packages/ui/src/Button.tsx:20` (`border border-gray-300 bg-white`)
**Cenário:** o próprio comentário da linha 18-19 diz que "a borda separa do fundo", ou seja, a borda tem função. Nas medidas, `#d1d5db` dá 1,47:1 contra o branco do Card e 1,33:1 contra o areia. Nos lugares onde o secundário fica sobre um Card branco, o contorno some e só o texto diz que é botão. É o caso de `rows.tsx:265/347/459` (check-in, check-out, liberar no painel Hoje), `StaffActions.tsx:190-216` (Receber, Ver conta, Fechar) e `MenuGrid.tsx:69` (os ladrilhos do cardápio do garçom, onde o contorno é o que forma a grade de toque). O WCAG 1.4.11 aceita o texto como identificação, mas a §10.6 pede "borda com função ≥ 3:1". Não é regressão: o `gray-100` preenchido de antes era ainda mais fraco. Hoje, porém, a decisão de 25/11 bate com o portão da fase sem que ninguém tenha decidido isso.
**Regra violada:** SPEC-10 §10.6 (borda com função ≥ 3:1)
**Correção sugerida:** escolher uma das duas e registrar no CATALOGO/DESIGN_PMS. (a) A borda é decorativa e quem identifica o botão é o texto: aí basta tirar do comentário a frase "a borda separa do fundo". (b) A borda tem função: aí ela precisa de `gray-500` (`#6b7280`, 4,8:1). O `gray-400` dá só 2,5:1 e não serve.

### 🟡 [Teste] A varredura do PageHeader passa mesmo com "Novo quarto" e "Nova categoria" de volta a 32 px
**Onde:** `frontend/apps/pms/src/features/rooms/RoomsListPage.tsx:19` e `CategoriesListPage.tsx:21` (`className="desk:h-9"`), contra `frontend/apps/pms/src/features/rooms/components/Actions.tsx:10` (`RESPONSIVE = 'desk:h-8 …'`). Teste: `uiBase.test.tsx:118-127`.
**Cenário:** o `WriteButton` junta `cn(RESPONSIVE, className)`, e o `buttonClasses` junta esse resultado depois das classes do `compact`. O `desk:h-8` do `RESPONSIVE` derruba o `desk:h-9` do `compact`. Conferi com `tailwind-merge`: sem a `className`, sobra `desk:h-8`, e com ela vence `desk:h-9`. Ou seja, quem garante os 36 px é a `className="desk:h-9"`, não o `size="compact"`. O teste só procura `size="compact"` na tag. Se alguém apagar a `className` (ela parece redundante, porque o compact "já tem" 36 px), o teste continua verde e o botão volta aos 32 px que a F2 queria acabar.
**Regra violada:** promessa 4 da F2 (as ações de cabeçalho com um tamanho só), com um teste que passa mesmo com o código errado
**Correção sugerida:** tirar o `desk:h-8` do `RESPONSIVE` quando vier `size="compact"`, ou fazer o teste olhar as classes renderizadas (`renderToString(<WriteButton size="compact" …/>)` precisa conter `desk:h-9` e não `desk:h-8`).

### 🟢 [Teste] Nenhum teste cobre a trava da rolagem, o onBlur da folha ou o uso de `moreTabClass`
**Onde:** `AppShell.tsx:211-219`, `:254-258`, `:309`; `AppShell.test.tsx:174-187`
**Cenário:** os testes de `moreTabClass` testam a função sozinha. Se a linha 309 voltar a `open || inMore ? TAB_ACTIVE : …`, tudo continua verde. A regra do onBlur, com as três saídas (nulo, dentro da folha, no "Mais"), está numa arrow inline sem nenhum teste, e trocar `!next ||` por `next &&` reabre o bug do Safari sem ninguém perceber. O `pb` do `main` com `var(--tabbar)` (`:167`) também não tem asserção: voltar a `5rem` passa.
**Correção sugerida:** extrair `shouldCloseSheet(next, sheet, more)` como função pura e testá-la. No SSR, conferir que a aba "Mais" renderizada não tem `before:bg-brand` fora de uma tela dela. Conferir o `pb-[calc(var(--tabbar)` no fonte, como já se faz com a comanda.

### 🟢 [Teste] A varredura do PageHeader tem três pontos cegos
**Onde:** `uiBase.test.tsx:88-101`
**Cenário:** (1) se o `/>` de fechamento não estiver na mesma indentação do `<PageHeader`, `findIndex` devolve -1, `slice(i, 0)` devolve `[]` e o bloco sai vazio, sem aviso. (2) `[^>]*` para no `>` de `=>`, então um `size="compact"` escrito depois de um `onClick={() => …}` vira falso positivo. (3) Uma ação passada por variável (`action={action}`, como faz `RoomsHeader.tsx:17`) só é coberta pela lista fixa `newRoom`/`newCategory`: uma tela nova com esse padrão escapa. O `≥ 4` (`:106`) só pega o caso em que todas somem.
**Correção sugerida:** fazer o teste falhar quando `fim === -1`. Melhor ainda: renderizar as páginas e conferir a classe no HTML do slot de ação do PageHeader.

### 🟢 [DRY] O alvo de toque continua repetido no lugar, e o teste do TOUCH não pega
**Onde:** `frontend/apps/pms/src/features/accounts/components/ItemList.tsx:87` (`min-h-touch … desk:min-h-0` no `Input`); `ReservationDetailPage.tsx:401` (o mesmo no `ButtonLink`, que já vem com `min-h-touch`)
**Cenário:** o CATALOGO agora diz "não repita o alvo na tela", mas o teste `uiBase.test.tsx:50-53` só procura o identificador `TOUCH`. A repetição escrita direto na classe passa.
**Correção sugerida:** tirar as duas repetições (hoje elas só sobram) e procurar `min-h-touch` em `<Input` no teste.

### 🟢 [Visual] Um atalho muda de largura em 2 px ao passar de secundário a primário
**Onde:** `ReservationsListPage.tsx:68-73` (atalhos de período); `IndicatorsPage.tsx:104-108` (janela de meses)
**Cenário:** agora só o secundário tem `border` de 1 px. Quando a recepcionista toca "Esta semana", o botão ativo fica 2 px mais estreito e os vizinhos andam.
**Correção sugerida:** `border border-transparent` no `primary` (e no `danger`).

### 🟢 [Visual] O ErrorState põe o botão ao lado do texto pela largura da tela, não pela do cartão
**Onde:** `frontend/packages/ui/src/ErrorState.tsx:20` (`sm:flex-row sm:justify-between`); quem chama dentro de colunas estreitas: `TodayBlock.tsx:34`, `analytics/components/Block.tsx:25`
**Cenário:** `SUSPEITA`. Num bloco do Hoje dividido em colunas, a partir de 640 px o texto do erro (`error.message`, que pode ser longo) divide a linha com o "Tentar de novo" `shrink-0` e fica espremido em várias linhas. Para confirmar, falta uma captura de um bloco em erro em 1024 px.
**Correção sugerida:** `flex-wrap` com `gap`, ou `@container`, no lugar do `sm:`.

### 🟢 [Compatibilidade] `overflow: hidden` no body não trava a rolagem no Safari do iOS antes da versão 16
**Onde:** `AppShell.tsx:214-215`
**Cenário:** `SUSPEITA`. A verificação de 25/11 foi feita no navegador do desktop. No iOS 15 a página atrás do fundo escuro continua rolando com o dedo. Para confirmar, falta testar num iPhone real ou no BrowserStack.
**Correção sugerida:** aceitar a limitação e registrá-la, ou usar `position: fixed` com o `top` salvo.

### 🟢 [Robustez] `var(--tabbar)` sem valor padrão
**Onde:** `AccountPage.tsx:139`, `AppShell.tsx:167`
**Cenário:** se a `AccountPage` for renderizada fora da casca (hoje só existe a rota `comanda/:id`, dentro do `AppShell`), o `calc(var(--tabbar)+…)` fica inválido, o `bottom` vira `auto` e o total deixa de ficar preso. Hoje não acontece.
**Correção sugerida:** `var(--tabbar,3rem)`.

### 🟢 [Doc] Um comentário de contraste ficou desatualizado no login
**Onde:** `frontend/apps/pms/src/features/auth/login.css:235` ("O ghost traz ring-gray-300")
**Cenário:** depois da F2 o ghost já vem com `ring-brand`. A regra local continua necessária, porque o vidro do login usa `--login-accent`, mas o motivo escrito ali deixou de ser verdade.
**Correção sugerida:** reescrever o comentário.

## Repassados a outro dev
nenhum

## O que foi verificado e está correto
- `secondary`/`ghost` com classe própria: o `tailwind-merge` deixa vencer a borda e o fundo de quem chama em `StatusPicker.tsx:41-44` e `RoomPicker.tsx:48-53` (conferido com `twMerge`). O estado selecionado (`border-brand`, `bg-brand/10`) não regrediu.
- Nenhum `Button` fica sobre a barra esmeralda: a lateral só usa `NavLink` com `ring-nav-accent`. A aba "Mais" usa `ring-inset ring-brand` sobre o branco da barra de baixo.
- Secundário sobre fundo tingido (`ErrorState`, a faixa `bg-status-maintenance/10`): o texto `gray-900` e o anel da marca seguem legíveis, e o `ring-offset` branco separa bem.
- `bottom: 3rem` e `pb: 5rem`: depois da F2 só restam a folha do "Mais" (`AppShell.tsx:259`, que só existe com a barra) e o total da comanda, que passou para `--tabbar`. Não sobrou nenhum outro `bottom-[calc(3rem`, `5rem`, `pb-20` ou `bottom-12` no app.
- `Input` com `min-h-touch`: os usos são formulários, filtros de data e buscas, e nenhum está numa célula de tabela. O de quantidade (`ItemList`) já tinha o mesmo alvo. No login a altura fixa de 48 px vence.
- Folha "Mais" no teclado. Tab depois do último item vai para a primeira aba, fora da folha, e fecha. Esc e o toque no fundo levam o foco para o "Mais", e o onBlur não fecha duas vezes. O foco inicial no primeiro item não dispara o onBlur da folha.
- Garçom sem barras. A volta à lista continua pelo `BackLink` "← Contas" da `AccountPage`. Topo, usuário e Sair aparecem em toda largura. O `RequireRole` não mudou.
- O `ErrorState` mantém o `role="alert"`, e os 18 lugares que o chamam não passam nenhuma prop nova obrigatória.
- Não há `require()`, dependência nova nem `Number()` sobre valor monetário no diff.

## Não foi possível verificar
- O visual no navegador (giro de tela, iOS real, ErrorState em coluna estreita): fiz a auditoria lendo o código e rodando os testes, sem subir o compose.
- O e2e completo e o `qa_checks.sh` (regras 9a/9b/9c): não rodei.
- Os contrastes saíram da fórmula WCAG aplicada aos tokens (`tokens.css`, a paleta do Tailwind), sem medir na captura.

---

## Resolução (25/11, mesma sessão)

| Achado | O que foi feito | Commit |
|---|---|---|
| 🟡1 rolagem presa ao girar a tela | A folha fecha quando a tela passa do md (`matchMedia`). Conferido no navegador: 390×844 → 844×390, a folha some e o `overflow` volta a `visible` | `9e0c9a0` |
| 🟡2 "Excluir" 4,39:1 | Secundário com texto vermelho (fundo branco, 4,8:1). Teste varre o app: nenhum ghost com `text-status-maintenance` | `9e0c9a0` |
| 🟡3 borda do secundário 1,3:1 | **Decisão do Sirlande: borda decorativa**, registrada na SPEC-10 §10.6 e no comentário do `Button` | este commit |
| 🟡4 teste passava com o código errado | O `WriteButton` compacto não leva o `desk:h-8`; a classe extra saiu e o teste renderiza o botão e mede a classe final | `9e0c9a0` |
| 🟢 atalhos andam 2 px | Borda transparente no primário e no danger; conferido: larguras iguais antes e depois de ativar | `9e0c9a0` |
| 🟢 `var(--tabbar)` sem padrão | `var(--tabbar,3rem)` na comanda | `9e0c9a0` |
| 🟢 comentário do `login.css` | Atualizado | `9e0c9a0` |
| 🟢 demais (testes da trava e do onBlur sem DOM, pontos cegos da varredura, alvo repetido em `ItemList`/`ReservationDetailPage`, ErrorState em coluna estreita, iOS < 16) | Abertos. Trava e onBlur foram conferidos no navegador; o resto fica para a F4/F5, que mexem nessas telas | — |
