# QA Red Team — comanda: quantidade digitada na linha
**Branch:** feature/comanda-quantidade · **Dev:** Sirlande · **Base:** develop@51e7b03 · **Data:** 16/11/2026
**Arquivos auditados:** 7 (diff `origin/develop...HEAD`, commits ba72329 e 9e3ef86)
**Achados no escopo:** 6 (🔴 0 · 🟡 4 · 🟢 2) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴 confirmado. A lógica pura (`parseQuantity`, `setQuantity`) está correta: valida a faixa, respeita o dono e
a janela, e não abre corrida com o runner da fila. As ressalvas ficam no `QuantityField`: a janela fecha
com o campo focado e o texto parcial, e o campo e a fila podem divergir. O 🟡-2 é SUSPEITA com risco de
cobrança a mais e precisa ser conferido num iPhone antes do congelamento de 24/11.

## Achados no escopo

### 🟡-1 [UX/financeiro] A janela fecha com o campo focado e a linha sai com a quantidade antiga — CONFIRMADO (lido)
**Onde:** `ItemList.tsx:48-51` (onFocus não renova), `ItemList.tsx:56-59` (texto vazio ou inválido não renova), `ItemList.tsx:201-207` (o campo desmonta quando `canUndo` vira falso)
**Cenário:** o garçom toca em Cerveja (t=0). Em t=3,5 s toca no campo e pergunta à mesa "quantas?". A janela
não foi renovada, porque só uma edição válida renova. Em t=5 s, o `useNow` (250 ms) re-renderiza, `canUndo` fica
falso, o campo some com o foco nele, o teclado fecha e o runner (`readyToSend`, tick de 1 s) envia `quantity: 1`.
O "6" digitado em t=5,2 s não cai em lugar nenhum. O mesmo acontece se ele apagar o campo para corrigir ("" não
renova) e demorar mais de 5 s desde a última edição válida. A tela não avisa: a linha só passa a mostrar
"Cerveja R$ 12,00" sem "N×".
**Efeito:** consumo cobrado a menos se ninguém reparar. Fora isso, o foco cai no `<body>` e o leitor de tela perde
a posição sem anúncio (ver 🟡-3).
**Regra violada:** DESIGN_PMS §5 (offline honesto: a tela não pode fingir o que gravou); a promessa do próprio
comentário em `queueCore.ts:123` ("a linha não sai enquanto ele está digitando") só vale entre teclas válidas.
**Correção sugerida:** renovar a janela no `onFocus` (por exemplo, `onChange(quantity)`, que já renova pelo
`setQuantity`) e em toda tecla enquanto o campo está focado, mesmo com o texto vazio. O teto continua sendo a
inatividade, sem janela infinita.

### 🟡-2 [financeiro] `select()` no onFocus não garante substituir o valor; "3" + "6" vira 36 — SUSPEITA
**Onde:** `ItemList.tsx:48-51`
**Cenário:** a linha está em "3" (3 toques). No iPhone, o garçom toca no campo e digita 6. O iOS Safari costuma
ignorar o `select()` chamado no evento `focus` ou desfazê-lo no fim do toque, quando posiciona o cursor. O campo
fica "36", `parseQuantity` aceita, a fila passa a 36 e a janela é renovada. O rodapé mostra
"inclui R$ 432,00 na fila", mas, se ele não olhar, saem 36 cervejas.
**Por que é SUSPEITA:** a conferência no Chromium partiu da quantidade 1, e o `fill` do Playwright limpa o campo
antes de digitar, então não exercita o `select()`. Não testei em iOS nem em Android com toque real.
**Para confirmar:** num iPhone (Safari), tocar 3 vezes em Cerveja, tocar no campo e digitar 6.
**Correção sugerida:** chamar `setSelectionRange(0, length)` num `requestAnimationFrame`/`setTimeout(0)` depois do
foco, ou usar um placeholder com o campo vazio ao focar. Conferir em aparelho real.

### 🟡-3 [a11y] O campo some com o foco dentro, sem aviso — CONFIRMADO (lido)
**Onde:** `ItemList.tsx:201-207`
**Cenário:** é o mesmo fecho de janela do 🟡-1, mas com o TalkBack ou o VoiceOver. O elemento focado é removido
do DOM, o foco vai para o `<body>` e nada é anunciado: o `EntryState` continua "Aguardando envio" e o rodapé não
muda, porque o valor é o mesmo. O usuário de leitor de tela não sabe que perdeu o campo nem com que quantidade
a linha saiu.
**Regra violada:** WCAG 2.4.3 (ordem de foco) e 4.1.3 (mensagens de status).
**Correção sugerida:** com o 🟡-1 resolvido, isso só acontece por inatividade. Mesmo assim, mover o foco para a
região `Itens lançados` (já tem `tabIndex={0}`) quando o campo focado desmontar.

### 🟡-4 [UX] Cada tecla válida conta como "toque" e rola a lista até o fim, afastando o campo em edição — CONFIRMADO (lido) · ocultação na tela SUSPEITA
**Onde:** `ItemList.tsx:116-121` (`lastTap = max(undoUntil)`) e `queueCore.ts:136` (`setQuantity` renova o `undoUntil`)
**Cenário:** o garçom toca em Cerveja, Refrigerante, Água e Suco, quatro linhas na janela. A caixa tem `h-44`
(176 px), e as linhas, ≥ 48 px. Ele sobe e toca no campo de Cerveja. A cada dígito válido, o `undoUntil` de Cerveja
passa a ser o maior, o efeito roda e `scrollTop = scrollHeight` leva a caixa ao fim. A linha de Cerveja sai da área
visível com o teclado aberto, e ele digita sem ver o número. O comentário da linha 113 diz "a cada toque deste
aparelho — e só aí", e a edição passou a contar como toque sem querer.
**Correção sugerida:** guardar o maior `undoUntil` só dos toques no cardápio, ou não rolar quando
`document.activeElement` estiver dentro da caixa.

### 🟢-1 [estado local] O texto do campo pode divergir da fila durante a edição — SUSPEITA (depende do navegador)
**Onde:** `ItemList.tsx:36-38`
**Cenário:** o campo está focado com "6" (fila = 6). Se o toque em Cerveja no cardápio não tirar o foco do campo
(comportamento possível no iOS, em que tocar num `<button>` não desfoca o input), o `addTap` passa a fila a 7. O
efeito não sincroniza porque `editing.current` está verdadeiro. O campo mostra 6, a fila e o rodapé ficam com 7, e
a próxima tecla parte de "6". No Android/Chromium o botão desfoca o input, o `onBlur` corrige e o problema não
aparece.
**Correção sugerida:** guardar num ref o último valor emitido e sincronizar o texto sempre que `quantity` mudar
para um valor diferente dele, mesmo editando.

### 🟢-2 [testes/docs] A lógica de estado do `QuantityField` não tem teste, e a decisão não está na spec
**Onde:** `ItemList.tsx:24-63`; `docs/specs/SPEC-04-modulo-consumo.md`
**Cenário:** sem DOM, os testes por `renderToString` cobrem só o HTML inicial. As mutações abaixo passariam:
remover o `if (!editing.current)` (linha 37), remover o `setText` do `onBlur` (linha 54) e trocar
`if (n !== null) onChange(n)` por `onChange(n ?? quantity)`.

A decisão de 16/11 (só o campo, sem [−]/[+], e a renovação da janela) não aparece na SPEC-04 nem no DESIGN_PMS.
Também ficou um texto desatualizado: `undoAccessibleName` (`accountTotals.ts:72`, fora do diff) ainda diz
"disponível por 5 segundos após o toque", e agora a edição também renova a janela.
**Correção sugerida:** extrair a regra do texto local (sincroniza ou não, o que volta no blur) para uma função
pura testável, no padrão de `queueCore.ts`, e registrar a decisão no anexo da spec.

## Repassados a outro dev
nenhum

## O que foi verificado e está correto
- **Corrida com o runner (CONFIRMADO, lido):** `readyToSend` (`queueCore.ts:140-146`) só pega `undo` com `now >= undoUntil`.
  `setQuantity` exige `canUndo` (`now < undoUntil`) e os dois leem `Date.now()`. Uma entrada que já está na rodada
  do `flush` não pode mais ser editada, e o `sendBody(entry)` do snapshot não fica velho por edição. Uma tecla válida
  ("1" de "12") renova a janela por 5 s, então o "1" não sai entre dígitos digitados em ritmo normal.
- **Dono:** `setQuantity` recusa outro `ownerId` (`queueCore.ts:135`), `AccountPage` passa `user.id`
  (`AccountPage.tsx:113`) e a lista só recebe `onThisAccount`, já filtrada pelo usuário.
- **Persistência:** `commit` grava só a chave da entrada alterada. `isQueueEntry` aceita a quantidade editada (número
  finito em `NUMBER_FIELDS`), e o evento `storage` propaga para outras abas.
- **Valores:** "" → nulo; "0" → nulo; "007" → 7; "9999" → 9999; "10000" → nulo; "1,5", "2.5", "-2", "6x", "1e3" →
  nulo; colar " 3 " → 3. `\d` sem a flag `u` só aceita dígito ASCII. O teto de 9999 é o mesmo do backend, que
  revalida. Total com `multiplyCents(decimalToCents(...))`, sem `Number()` em DECIMAL.
- **Teclado:** `inputMode="numeric"` com `pattern="[0-9]*"` abre o teclado numérico do iOS. `text-base` (16 px) no
  `Input` evita o zoom do iOS no foco.
- **Rótulo e alvo:** o campo se chama "Quantidade de {produto}" e tem `min-h-touch` (48 px) abaixo de `xl`.
  `tailwind-merge` resolve `w-16`/`px-2` sobre `w-full`/`px-3`.
- **Quem não usa o campo:** `addTap` e `undoTap` não mudaram. O "N×" só some durante a janela e volta depois
  (testado). O Desfazer continua tirando 1.
- **Rodapé:** `footerTotals` usa `e.quantity`, então "inclui R$ X na fila" acompanha cada edição válida em
  `aria-live="polite"`.
- **ESM e TypeScript:** sem `require`, sem `any` novo. `npx vitest run src/features/accounts`: 119 testes, 8 arquivos
  verdes (executado).

## Não foi possível verificar
- O comportamento de `select()` no foco e o desfoque ao tocar num `<button>` em iOS Safari e Android real (🟡-2 e 🟢-1).
  Não há aparelho nem navegador WebKit no ambiente.
- A ocultação visual do 🟡-4 no navegador. A rolagem foi confirmada lendo o código; o efeito na tela, com o teclado
  aberto, não foi reproduzido.
- Corrida entre duas abas no mesmo aparelho no último milissegundo da janela: o `storage` é assíncrono e uma aba
  pode enviar a quantidade velha enquanto a outra edita. É o mesmo padrão que já existia com o `addTap`, de
  probabilidade desprezível, e não foi exercitado.

---

## Tratamento (16/11, Sirlande com Claude Code)

| Achado | O que foi feito | Verificação (Chromium, 390 px, garçom do Aurora) |
|---|---|---|
| 🟡-1 A janela fecha com o campo focado | Enquanto o campo tem o foco, a janela é renovada a cada segundo, e o foco também renova. Tecla inválida (vazio) renova com a quantidade atual | Campo focado por 8 s sem digitar: a linha continua na tela e nada vai ao servidor |
| 🟡-2 "3" + "6" virando 36 no iOS | A seleção do texto agora é feita com `setSelectionRange` num `requestAnimationFrame`, depois do foco | 3 toques e "6" digitado pelo teclado (não pelo `fill`): 6. **No iPhone de verdade não foi testado**, porque não há aparelho no ambiente |
| 🟡-3 O campo sai com o foco dentro | Se o campo sai da tela com o foco dentro, e também no Enter, o foco vai para a região "Itens lançados" | Enter: o foco vai para "Itens lançados" |
| 🟡-4 A lista rolava a cada tecla | `lastTapAt` ignora a linha em edição | Teste unitário; mutação morta |
| 🟢-1 O campo divergia da fila com toque por fora | `fieldText`: se a fila mudou por fora, o campo acompanha | Com o campo em 6, um toque no produto leva o campo a 7, e o servidor grava "7× Pudim" |
| 🟢-2 Teste e texto | `fieldText` e `lastTapAt` puros, com teste (3 de 3 mutantes mortos). O nome do Desfazer passa a dizer "após o último toque ou edição" | — |

467 testes do pms e typecheck limpos; `qa_checks` sem aviso novo.
