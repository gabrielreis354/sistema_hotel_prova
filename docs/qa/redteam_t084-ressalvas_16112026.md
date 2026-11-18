# QA Red Team — ressalvas da T-08.4 (painel Hoje: selos curtos + foco do "Ver todas")
**Branch:** fix/t084-ressalvas-painel-hoje · **Dev:** Sirlande · **Base:** develop@cef3e50 · **Data:** 16/11/2026
**Arquivos auditados:** 3 (`rows.tsx`, `todayLogic.ts`, `todayLogic.test.ts`), mais leitura de apoio: `TodayPage.tsx`, `TodayBlock.tsx`, `AppShell.tsx`, `@hotel/ui/StatusBadge.tsx`, `@hotel/ui/Button.tsx`, `@hotel/domain/dates.ts`, `ReservationModel.js`, `main.tsx`
**Achados no escopo:** 5 (🔴 0 · 🟡 1 · 🟢 4) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴. O 🟡 é um caso que sobra da ressalva 🟡2: com o aviso fixo do painel aberto, o "Mostrar menos" vai parar embaixo dele. Os 🟢 são melhorias.

## Achados no escopo

### 🟡 [UI/UX] Ao recolher, o botão vai para o topo da vista, e o aviso fixo do painel o cobre
**Onde:** `frontend/apps/pms/src/features/today/components/rows.tsx:74` (`scrollIntoView({ block: 'nearest' })`), em conflito com `frontend/apps/pms/src/features/today/TodayPage.tsx:78` (`sticky top-2 z-20`)
**Status:** CONFIRMADO pela leitura do código. Não executei no navegador.
**Cenário:** celular, 375 px, Chegadas com 30 itens e o bloco expandido. A recepcionista faz o check-in do 20º item. O aviso de sucesso fica fixo no alto por 6 s; um aviso de erro fica até alguém fechar. Ela toca em "Mostrar menos". Recolher sempre tira conteúdo de cima do botão, então o botão sobe para fora da vista e o `nearest` o alinha no topo (é o "top 0" que a medição viu). O aviso fixo está em `top-2`, na camada `z-20`, e tem pelo menos 48 px (o botão "Fechar" tem 48 px). Por isso ele cobre o botão de 48 px inteiro. O foco está no botão, mas a pessoa não o vê: o problema de "perder o lugar" volta justamente depois de uma ação na linha, que é o caso mais comum. Não há `scroll-margin` nem `scroll-padding` em lugar nenhum (`grep` em `apps/pms/src`, `packages/ui/src` e `packages/config` não achou nada).
**Regra violada:** o critério da própria ressalva 🟡2 (o foco e a vista não podem se perder); DESIGN_PMS §5, o resultado aparece onde o olho está.
**Correção sugerida:** a menor é `scroll-mt-20` (ou outro valor da altura do aviso) no botão do `RowList`. A outra opção é `scrollIntoView({ block: 'center' })`.

### 🟢 [A11y] O `title` do selo pode fazer o texto completo ser lido duas vezes
**Onde:** `rows.tsx:296-300`
**Status:** SUSPEITA. Depende do leitor de tela e da configuração; não testei com NVDA, JAWS nem VoiceOver.
**Cenário:** a estrutura é `<span title={full}>` + `<span aria-hidden>` com o selo + `<span class="sr-only">{full}</span>`. O `aria-hidden` tira o rótulo curto da árvore de acessibilidade, e o `sr-only` entrega o texto completo uma vez, como pretendido. Já o `title` do span externo entra como descrição acessível ou dica no Chromium. O JAWS (com a leitura de "title" ligada) e o VoiceOver do macOS (dica que aparece depois de uma pausa) podem anunciar "Sem pagamento · risco de no-show" uma segunda vez. O NVDA, no modo padrão, não lê descrição de elemento que não recebe foco. Para quem enxerga, o `title` também ajuda pouco: o span não recebe foco, então o teclado não mostra a dica, e no toque (celular e tablet) ela não aparece. A informação do no-show não se perde porque também está no bloco Atenção (`TodayPage.tsx:99`).
**Regra violada:** nenhuma regra explícita; o próprio commit diz que o texto completo deve ser lido uma vez só.
**Correção sugerida:** tirar o `title`, porque o sr-only já cobre o leitor de tela e o Atenção cobre quem enxerga. Se quiser manter a dica do mouse, pôr `title` só no span com `aria-hidden`: o atributo vai junto com o nó escondido e não chega à árvore.

### 🟢 [A11y] Dois textos sr-only lado a lado, sem espaço no meio
**Onde:** `rows.tsx:293-302`
**Status:** SUSPEITA. Não ouvi a leitura.
**Cenário:** uma chegada atrasada e sem pagamento gera dois `<span>` vizinhos vindos de um `map`, sem nenhum espaço entre eles. Quando o leitor junta a linha de texto (navegação por linha no modo de leitura), pode sair "…risco de no-showChegada atrasada · entrada era 03/11/2026". Os spans são itens de um contêiner flex (`flex-wrap`), o que costuma separar o texto, mas não confirmei.
**Correção sugerida:** terminar o texto sr-only com um separador (`{f.full}. `) ou `{' '}`.

### 🟢 [A11y] No bloco Em limpeza, o foco do "Ver todas" cai em "Liberar quarto" sem dizer de qual quarto
**Onde:** `rows.tsx:65` (`querySelector('a[href], button:not([disabled])')`), aplicado ao `CleaningItem` (`rows.tsx:440-450`)
**Status:** CONFIRMADO pela leitura do código.
**Cenário:** o bloco Em limpeza tem 9 ou mais quartos e a pessoa ativa "Ver todas". O 9º item não tem link, então o primeiro elemento focável é o botão de ação, que fica depois do "Quarto 205" no DOM. O leitor anuncia só "Liberar quarto, botão", sem o número, e a pessoa não sabe de que quarto é a ação. Não é perigoso, porque ainda falta a confirmação no painel, mas é o único bloco em que o destino do foco não identifica o item. Nos blocos Chegadas, Saídas e Na casa, o foco vai para o `GuestLink`, que dá o nome do hóspede.
**Correção sugerida:** focar o próprio `<li>` quando o item não tem link (`'a[href]'` em vez de `'a[href], button…'`). Outra opção é dar ao botão um `aria-label` que inclua o número do quarto.

### 🟢 [DRY] Formatação de data feita à mão, ao lado do `formatDateBR` do domínio
**Onde:** `todayLogic.ts:201-206`
**Status:** CONFIRMADO pela leitura e pela execução dos testes.
**Cenário:** com valores válidos, as duas formas dão o mesmo resultado. A coluna é `DATEONLY` (`ReservationModel.js:34-36`) e chega como `yyyy-MM-dd`, que já é a premissa das comparações de string em `arrivalRows`. Como não há parse para instante, não existe risco de fuso. A única diferença está na entrada fora do formato: o `formatDateBR` lança `RangeError` e derruba a renderização, enquanto o `split` mostra o texto torto ("03T00:00:00.000Z/11"). Isso é mais tolerante, não pior. O ponto de atenção é ter uma segunda forma de formatar data, fora do `@hotel/domain`, que é a fonte única definida em `dates.ts:1-7`.
**Correção sugerida:** `formatDateBR(entrada)` para o texto completo e `.slice(0, 5)` para o curto. Fazer isso só se não pesar no teste puro (`@hotel/domain` já é importável no node).

## Pontos atacados sem achado

- **`useEffect` com `pendingFocus` e `[expanded]`, contra a recarga da lista:** o efeito só roda quando `expanded` muda, e a ref só recebe valor no `onClick`. Uma recarga a cada `REFRESH` (`queries.ts:46-56`) muda `items` sem mudar `expanded`, então não move o foco. O destino é calculado com o `items.length` do mesmo render que o clique causa: o clique é um evento discreto, renderizado de forma síncrona, e nenhum dado de consulta entra no meio.
- **Lista que encolhe para 8 ou menos com o bloco expandido:** o botão desmonta, `buttonRef` vira null e nenhum efeito roda, porque `expanded` não mudou. Continuar com `expanded=true` e voltar a mostrar "Mostrar menos" quando a lista cresce de novo é comportamento que já existia na develop, fora deste diff.
- **Índice fora do intervalo:** só pode acontecer com total ≤ 8, e nesse caso não há botão. Mesmo assim, o optional chaining (`children[i]` como `undefined`, depois `item?.`) não lança erro.
- **StrictMode (`main.tsx:16`, React 18.3):** o efeito duplo acontece só na montagem, quando `pendingFocus` é null, então não faz nada. Os handlers não rodam duas vezes.
- **Barra inferior fixa (`AppShell.tsx:72`, `main pb-20`):** recolher sempre leva o botão para cima, então o `nearest` alinha no topo, não no rodapé. Ao expandir, o 9º item ocupa o lugar do botão que acabou de ser tocado e, portanto, estava visível. A barra não cobre o destino em nenhum dos dois casos.
- **`key={f.tone}`:** `arrivalFlags` gera no máximo um selo de cada tom (`maintenance` e `cleaning`), então a chave é única hoje. Se um terceiro selo usar um tom repetido, a chave colide; `key={f.label}` seria mais robusta. Não registrei como achado porque não há cenário de falha atual.
- **Desktop (≥ 1280) e os outros blocos:** a mudança do `ArrivalItem` junta `StayLine` e os selos num único item flex. No `xl:flex-row` o resultado visual é o mesmo, com espaço de 8 px entre estadia e selo em vez de 12 px. `DepartureItem`, `InHouseItem` e `CleaningItem` não mudaram. A mudança do `RowList` (`aria-controls` e foco) vale para os quatro blocos, que é o esperado; o único efeito colateral é o 🟢 do bloco Em limpeza.
- **`aria-controls={listId}`:** o `useId` é estável, e o id vai na `<ul>` que existe sempre que o botão existe.
- **`Button` com `ref`:** é `forwardRef` (`packages/ui/src/Button.tsx:52`), então a ref chega ao `<button>`.
- **Cor + rótulo:** o selo continua com ponto e texto. O curto fica escondido do leitor, que recebe o texto completo.
- **Testes:** os 31 de `todayLogic.test.ts` passam (executado). Os casos de `arrivalFlags` cobrem: nenhum selo, cada selo sozinho, os dois juntos com a ordem, a data ausente e o teto de 16 caracteres com a data mais larga (31/12). `toggleFocusTarget` cobre expandir, recolher, corte informado e nada novo para mostrar.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- O diff completo (`git diff origin/develop...HEAD`, 3 arquivos, +165/-14).
- Não há `require`, backend, dado pessoal novo, `console.*` nem dependência nova.
- Os tipos de `arrivalFlags(row: ArrivalRow)` aceitam `ArrivalRow<ReservationListItem>`.
- Não há `Number()` sobre valor monetário nem `new Date()` sobre data de calendário.

## Não foi possível verificar
- **Alturas do CA-08.i (2.891 e 2.879 px em 375 px):** não refiz no navegador. Aceito a medição do dev. Nenhum teste automatizado garante essas alturas; o único guarda é o teste do teto de 16 caracteres, que é uma aproximação da largura real da fonte.
- **Comportamento real em NVDA, JAWS e VoiceOver** (os dois 🟢 marcados como SUSPEITA).
- **O efeito de foco e de rolagem em si:** sem DOM no Vitest, só a função pura `toggleFocusTarget` tem teste. O caminho que busca o elemento focável e chama `scrollIntoView` foi validado apenas pela medição manual que o dev relatou.

---

## Tratamento (16/11, Sirlande com Claude Code)

| Achado | O que foi feito |
|---|---|
| 🟡 Aviso fixo cobre o "Mostrar menos" | `scroll-mt-28` no botão. Medido em 375 px: ao recolher, o botão para a 112 px do topo (antes, 0), abaixo do aviso `sticky top-2` |
| 🟢1 `title` duplicando a leitura | O `title` foi para o trecho `aria-hidden`; o leitor de tela lê só o `sr-only` |
| 🟢2 Textos `sr-only` colados | Cada texto completo termina em ". " |
| 🟢3 Foco sem contexto no bloco Em limpeza | Ao expandir, o foco vai para o link do item; sem link, para o próprio `<li>` (que lê o quarto e a ação) |
| `key={f.tone}` frágil | Passou a `key={f.label}` |
| 🟢4 Data formatada à mão | **Mantido.** Mesmo resultado do `formatDateBR` para `DATEONLY`; fica como pendência 🟢 de mover um `formatDayMonth` para o `@hotel/domain` |

Depois do tratamento: alturas iguais (2.891 e 2.879 px), foco no 9º item ao expandir, 437 testes do pms e typecheck limpos.
