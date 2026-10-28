# QA Red Team — T-05.5 comanda, correções da revisão Impeccable (achados 1 a 6)
**Branch:** feature/t055-correcoes-impeccable · **Dev:** Sirlande · **Base:** develop@aaacdea · **Data:** 27/10/2026
**Arquivos auditados:** 13 (`AccountPage.tsx`, `AccountsListPage.tsx`, `accountFilter.ts` e teste, `closeGuard.ts` e teste, `components/ItemList.tsx`, `components/Notice.tsx`, `components/OpenAccountForm.tsx`, `components/StaffActions.tsx`, `queueCore.ts` e teste, `packages/ui/src/Input.tsx`). Também li, para ter contexto: `queries.ts`, `queueStore.ts`, `accountTotals.ts`, `Button.tsx`, `CloseAccountController.js` e `ListAccountController.js`.
**Achados no escopo:** 9 (🔴 0 · 🟡 5 · 🟢 4) · **Repassados:** 0

Auditorias anteriores: `redteam_t055-comanda_26out2026.md`, `_delta_` e `_delta2_`. Revisão de origem: `docs/historico_sessao/sirlande/t055_revisao_impeccable_26out2026.md`.

## Veredito
**APROVADO COM RESSALVAS.** Pode mergear.

Os dois P0 estão fechados. Nenhum caminho de toque duplo, Enter repetido ou leitor de tela fecha a conta sem querer. Os achados 🟡 são de UX/a11y e de informação perdida para a recepção. Nenhum causa perda de dado no servidor. O mais importante é o 🟡-1: depois de fechar, a tela some com o bill e a UI não oferece caminho de volta. Vale corrigir antes da release.

## Achados no escopo

### 🟡-1 [UX / dinheiro] Depois de fechar, a recepção perde o bill e a UI não tem caminho de volta para a conta fechada
**Onde:** `components/StaffActions.tsx:114`, `accountsApi.ts:85-90` (`closeAccount` descarta o corpo), `AccountsListPage.tsx:62-66`
**Cenário:** a recepção abre "Day-use João", que já tem R$ 200 pagos. Toca em "Fechar conta" e a confirmação diz "Fechar Day-use João com **R$ 300,00**?" (`totalCents` é o **total**, não o saldo). Ela confirma e cai na lista com o aviso "Day-use João: conta fechada.", que não traz valor nenhum. A conta fechada sai da lista de abertas, e não existe outra tela no PMS que liste conta CLOSED ou mostre o bill dela (grep em `src/`: o `/bill` só é chamado aqui). Antes desta branch, a tela continuava na conta, já fechada, e "Ver conta" mostrava Pago/Saldo. Agora o único caminho é o botão "voltar" do navegador. Resultado: ela cobra os R$ 300 que viu na confirmação, em vez do saldo de R$ 100. O backend devolve o bill no `PUT /close` (`CloseAccountController.js`, `return response.json(bill)`), mas o front joga a resposta fora.
**Regra violada:** RNF-026 (o sistema deve dizer o que fazer depois), DESIGN_PMS (a ação irreversível não pode esconder o resultado).
**Correção sugerida:** o menor ajuste é fazer `closeAccount` devolver o bill e pôr no aviso o saldo (`"Mesa 3 fechada. Saldo a receber: R$ X"`, ou "Crédito do hóspede"), junto com um link "Ver conta fechada" para `/comanda/:id`. Outra opção: na confirmação, mostrar o saldo quando houver `payments_made > 0`, em vez do total.

### 🟡-2 [UX] O auto-rolar também dispara sem toque e puxa a lista de quem está conferindo
**Onde:** `components/ItemList.tsx:58-63`
**Cenário:** o comentário diz que só toque novo rola a caixa, mas `taps = items.length + Σ entry.quantity` também muda sem toque:
1. **Envio de linha com 2× ou mais.** O garçom lança "3× Cerveja" e rola a caixa para cima para conferir um item antigo. Quando a fila envia, `showSaved` põe **1** item no cache e `applyOutcome` tira a entrada de quantidade **3** (`queueStore.ts:136-137`). `taps` cai 2 e a caixa pula para o fim.
2. **Item de outro aparelho.** Outro garçom lança na mesma conta, ou chega o refetch do `invalidateQueries`: `items.length` sobe e a caixa pula para o fim.
3. `showSaved` e `commit` são duas fontes de estado (React Query e `useSyncExternalStore`). Se renderizarem em passadas separadas, até a linha de 1× provoca duas rolagens.

Isso acontece justamente com quem subiu para conferir. No celular, a caixa tem uns 3 itens de altura, então o salto tira da vista o item que a pessoa estava lendo.
**Regra violada:** o próprio contrato do componente (comentário em `:58-59`) e o critério (b) do pedido.
**Correção sugerida:** rolar só quando o **último** lançamento local mudar (`clientItemId` + `quantity` da entrada com `undoUntil` mais recente), ou só se a caixa já estava no fim antes da mudança (`scrollHeight - scrollTop - clientHeight < 1 linha`).

### 🟡-3 [UX / dinheiro] Item "Recusado" pode ficar escondido na caixa, e fora dela nada avisa
**Onde:** `components/ItemList.tsx:58-63, 71`
**Cenário:** o garçom está sem rede e lança A, B, C e D, produtos diferentes. A caixa (`h-44`, cerca de 3 linhas de 48 px) mostra B, C e D, e A fica acima da área visível. A rede volta, A é enviado primeiro e recebe 422 (produto desativado): fica `rejected`. `taps` não muda, então não há rolagem (é de propósito, `:58-59`). O rodapé tira A do "inclui R$ X na fila" sem explicar por quê. Fora da caixa nenhum contador ou aviso indica que há recusa. Se o garçom não rolar a caixa, o consumo A fica sem cobrança. Antes, as entradas locais ficavam sempre no fluxo da página. Só os itens do servidor eram recolhidos.
**Regra violada:** o princípio da fila, de que "a tela nunca finge que já gravou" (`ItemList.tsx:35-37`), e o critério (b).
**Correção sugerida:** quando uma entrada passar a `rejected` ou `excluded`, rolar até ela (`scrollIntoView({ block: 'nearest' })`), ou mostrar fora da caixa uma linha "1 lançamento recusado — ver" com `role="alert"`.

### 🟡-4 [a11y / UX] A trava de 5 s derruba a confirmação durante a leitura e durante o envio
**Onde:** `components/StaffActions.tsx:60-65` (o timer existia antes, mas agora vale para a confirmação nova em `:100-125`)
**Cenário:**
1. **Leitor de tela.** O foco vai para "Voltar" e o leitor anuncia o grupo "Fechar Mesa 3 com R$ 245,90? Depois de fechada, a conta não recebe item." A pessoa ainda precisa voltar até "Sim, fechar", que vem antes de "Voltar" no DOM. Com TalkBack ou VoiceOver isso passa fácil de 5 s, e a confirmação some no meio. O foco cai no `body`, porque o "Voltar" focado é desmontado. É um limite de tempo sem como estender (WCAG 2.2.1), e agora tem conteúdo para ler.
2. **Rede ruim.** A pessoa toca em "Sim, fechar" e o PUT demora mais de 5 s. O timer chama `setConfirming(false)` com `close.isPending` ainda verdadeiro. Somem o "Fechando…" e o total, e "Fechar conta" volta habilitado. Parece que nada aconteceu. Segundos depois o `onSuccess` leva para a lista de repente. Não fecha duas vezes: o segundo "Sim, fechar" fica desabilitado por `isPending` e o backend responderia 422.
3. **Foco perdido** também em "Voltar" (`:121`) e quando surge um bloqueio (`:62`): o grupo é desmontado e o foco não volta para "Fechar conta".
**Regra violada:** WCAG 2.1 2.2.1 e 2.4.3 (ordem do foco), RNF-024/RNF-025.
**Correção sugerida:** não armar o timer enquanto `close.isPending`. Reiniciar o timer quando o foco entra no grupo, ou dispensar o timer quando a confirmação recebe foco por teclado ou leitor de tela. Ao sair da confirmação, devolver o foco para "Fechar conta" com um `ref`.

### 🟡-5 [UX] A ordem "mais antiga primeiro" põe as suítes no topo e empurra as mesas da noite para longe do polegar
**Onde:** `accountFilter.ts:53-57`, `AccountsListPage.tsx:44`
**Cenário:** o hotel tem 15 suítes ocupadas, cujas contas `ROOM` nasceram no check-in, dias atrás, e 4 mesas abertas no jantar. A lista ordena por `opened_at` crescente, então as 15 suítes vêm primeiro e as mesas, que são o trabalho do turno, ficam no fim da rolagem. Antes, o backend devolvia da mais nova para a mais antiga (`ListAccountController.js:38`) e as mesas ficavam no alto. A estabilidade que o P1 pedia continua garantida (conta nova entra no fim), mas o custo é cada toque nas mesas exigir rolagem. A linha também deixou de mostrar o tipo e passou a mostrar a hora. Numa suíte, isso dá "aberta em 22/10 às 14:00", que não ajuda o garçom.
**Regra violada:** CA-05.5.i (o que se usa fica ao alcance do polegar), critério (d) do pedido.
**Correção sugerida:** agrupar por tipo, com TABLE/DIRECT/DAY_USE primeiro e ROOM depois (ou ROOM em seção própria), e manter a ordem estável dentro de cada grupo. Outra opção: na linha da suíte, mostrar o tipo em vez da hora.

### 🟢-1 [a11y] Avisos novos não são anunciados pelo leitor de tela
**Onde:** `AccountsListPage.tsx:62-66` + `components/Notice.tsx:9`, `components/OpenAccountForm.tsx:65-75`
**Cenário:**
- **Aviso de conta fechada.** O `Notice` com `role="status"` já nasce com o texto quando a lista monta. A maioria dos leitores só anuncia mudança numa live region que já existia, então o "Mesa 3: conta fechada." não é lido. O foco também não vai para o aviso nem para o `h1`.
- **Nome repetido.** O aviso aparece enquanto a pessoa digita. Ele chega pelo `aria-describedby`, que só é lido quando o campo **recebe** foco. Como o campo já está focado, o aviso fica em silêncio.
**Correção sugerida:** na lista, deixar o `Notice` vazio no primeiro render e preencher num `useEffect`, ou focar o `h1`/aviso com `tabIndex={-1}`. No formulário, `role="status"` (`aria-live="polite"`) no `<p id="account-label-same">`.

### 🟢-2 [UX] A comparação de nome repetido não pega variações comuns
**Onde:** `accountFilter.ts:63-66`
**Cenário:** já existe "Mesa 3" aberta, e "Mesa 03", "Mesa3" ou "mesa 3." não avisam. Só a variação de caixa, acento e espaço é coberta.
**Correção sugerida:** antes de comparar, remover zeros à esquerda dos números e espaço entre letra e dígito (`/(\D)\s*0*(\d)/g`). Fica para quando acontecer de verdade, porque é KISS e o aviso é só ajuda.

### 🟢-3 [Testes] A ligação dos P0 com a tela não tem teste unitário
**Onde:** `components/StaffActions.tsx:112`, `components/ItemList.tsx:60-63`, `AccountsListPage.tsx:26-29`
**Cenário:** se a linha `if (!confirmArmed(...)) return;` for apagada, ou se `taps` for trocado por `entries` (o que reintroduz o 🟡-2), os 63 testes continuam verdes. `closeGuard.test.ts` testa só a função pura. A ligação com a tela fica só no roteiro Playwright manual. É a mesma lacuna do 🟢-3 da delta2, e o PMS não tem jsdom nem testing-library.
**Correção sugerida:** registrar como pendência de ferramenta (component test ou Playwright no CI). Até lá, deixar no anexo de decisões a lista das 16 checagens do Playwright.

### 🟢-4 [UX / KISS] Detalhes menores
- `components/StaffActions.tsx:119`: "Fechar mesmo assim" aparece quando há item de outro usuário e não cabe numa linha a 375 px. O botão ocupa uns 167 px, e o texto em 16 px mais `px-4` passa disso. O commit `dce64b8` resolveu só o "Sim, fechar".
- `components/StaffActions.tsx:114`: o `navigate` empilha `/comanda` sem `replace`. O "voltar" do navegador abre a conta fechada. Hoje isso **ajuda** (é o único caminho para o bill, ver 🟡-1), mas deixa de fazer sentido depois que o 🟡-1 for corrigido.
- `queueCore.ts:266`: `undoLabel` é texto de botão dentro do núcleo puro da fila, e a regra era não mexer nessa área. Pelo SRP, o lugar dele é `ItemList.tsx` ou `accountTotals.ts`. Não quebra nada.
- `accountFilter.ts:71-75`: `openedAtLabel` desmonta a string de `formatDateTimeBR` com `split(' ')`. Se o formato do domínio mudar, quebra em silêncio. Seria melhor `formatInTimeZone(..., 'HH:mm')` em `@hotel/domain` (`formatTimeBR`). Um `opened_at` inválido lançaria `RangeError` e derrubaria a lista, mas a coluna é `NOT NULL DEFAULT now()` (`schema.sql:310`), então hoje não ocorre.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- **(a) Toque duplo:** o segundo toque cai em "Voltar", porque "Fechar conta" estava na coluna da direita e "Voltar" está lá agora. Mesmo se cair em "Sim, fechar", `confirmArmed` ignora o toque nos primeiros 400 ms. `shownAt` só é escrito no `onClick` de "Fechar conta", que é o único caminho para `confirming=true`. O `type="button"` padrão do `Button` evita submit acidental.
- **(a) Teclado:** Enter em "Fechar conta" dispara no keydown, e a repetição de tecla cai em "Voltar" (autoFocus), que só cancela. Espaço dispara no keyup, e o foco já está em "Voltar". Nenhuma sequência de teclas fecha sem passar por "Sim, fechar" com foco deliberado.
- **(a) A trava não prende:** toque antes de 400 ms é ignorado sem efeito colateral, e o seguinte funciona. Duplo fechamento é impossível, porque `disabled={close.isPending}` e o backend responde 422 para conta não-OPEN.
- **(c) Navegação:** o `onSuccess` do `mutate` roda antes do `onSettled`. O `setConfirming(false)` acontece com o componente ainda montado. Se o usuário sair durante o envio, o callback do `mutate` do TanStack v5 não dispara, então não há sequestro de navegação. O `useEffect` com `replace` não entra em loop: `notice` fica congelado no `useState`, `pathname` não muda e `navigate` é estável para o mesmo pathname. No StrictMode são dois `replace`, sem dano. Recarregar a página não traz o aviso de volta (`state: null`).
- **(d)** `opened_at` é `NOT NULL` e sai em ISO UTC uniforme do Sequelize, então o `localeCompare` ordena certo. O desempate por id torna a ordem total. `openedAtLabel` compara o dia no fuso do hotel (`HOTEL_TZ`). Nome em branco não avisa (teste dos mutantes).
- **(e)** `Input.tsx`: `placeholder:text-gray-500` (#6b7280 sobre branco, 4,83:1). O preset não sobrescreve `gray`. Os consumidores (`GuestForm`, `GuestsListPage`, `OpenAccountForm`, `AccountsListPage`) não passam classe de placeholder, e o `cn` com tailwind-merge resolveria um conflito. Não achei regressão.
- **(f)** `openWithSameLabel` reutiliza o `normalize` local, a única cópia no monorepo (grep). O `@hotel/domain` não tem equivalente. `Notice` substitui dois `<p>` idênticos sem criar abstração para um caso só. `formatBRL` e `formatDateTimeBR` vêm do domínio, e não há `Number()` em valor monetário.
- Os 63 testes do `apps/pms` passam (`npx vitest run`, 27/10).
- A fila (`queueCore`/`queueStore`) não foi alterada além do `undoLabel` puro. `undoTap` tira uma unidade (`queueCore.ts:100-102`), o que confirma o texto "Desfazer 1".

## Não foi possível verificar
- O comportamento real de TalkBack e VoiceOver com o `autoFocus` e o `aria-labelledby` do grupo. A análise do 🟡-4 e do 🟢-1 vem do código e do comportamento documentado dos leitores. Não houve teste com o dispositivo.
- Se `showSaved` e `commit` renderizam na mesma passada (o item 3 do 🟡-2). Depende do agendamento do `notifyManager` do React Query. Os itens 1 e 2 do 🟡-2 valem nos dois casos.
- O roteiro Playwright das 16 checagens não está no repositório. Não reexecutei.
