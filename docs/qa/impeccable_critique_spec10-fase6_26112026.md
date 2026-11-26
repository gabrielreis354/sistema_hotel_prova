# /impeccable critique — comanda (F6 da SPEC-10), 26/11/2026

**Execução:**
- duas avaliações isoladas em subagentes: A (design) e B (detector e navegador);
- síntese e correções nesta sessão;
- HEAD avaliado: `10fb4a5`.

**Especificidade:** feita para este produto. A fila honesta ("Aguardando envio", "Na fila", "Recusado" com o motivo), o "Desfazer (5 s)" com a quantidade na linha, a caixa de itens de altura fixa para o cardápio não pular, o aviso de nome repetido ao abrir conta e a trava de 400 ms ao fechar vêm do salão e do balcão. Onde ainda é genérica: no computador a recepção não tem atalho de teclado, e as três ações do rodapé têm o mesmo peso.

**Nielsen (A): 28/40.** As menores notas: flexibilidade (2) e ajuda (2). As demais ficaram em 3.

| # | Heurística | Nota | Problema-chave |
|---|---|---|---|
| 1 | Visibilidade do estado | 3 | A fila é exemplar; o estado da conta (aberta, fechada, paga) não aparece no cabeçalho |
| 2 | Mundo real | 3 | "Ver conta" dentro da própria conta é ambíguo |
| 3 | Controle e liberdade | 3 | Passados os 5 s, o garçom não tem saída na tela (regra: só o admin exclui) |
| 4 | Consistência | 3 | O hover do Button grudava no toque; a linha da lista de contas já usava `hover:hover` |
| 5 | Prevenção de erro | 3 | "Fechar conta" colado em "Ver conta" no rodapé fixo do celular |
| 6 | Reconhecer | 3 | A lista de contas não mostra total nem itens |
| 7 | Flexibilidade | 2 | Sem busca no cardápio nem atalhos; com 9 produtos funciona, com 60 não |
| 8 | Estética | 3 | Três botões secundários iguais no rodapé, sem hierarquia |
| 9 | Recuperação de erro | 3 | Depois do "OK" do recusado, não há "lançar de novo" |
| 10 | Ajuda | 2 | Vazios e bloqueios explicam; fora isso, nada |

**Carga cognitiva:** 2 falhas de 8 (mínimo de opções e hierarquia, ambas nas ações do rodapé) e 1 parcial (memória de trabalho: caixa de itens de 176 px no computador).

## Detector e navegador (B)

**Linha de comando:** 0 achados nos 9 `.tsx` da comanda.

**Overlay:** não rodou. O preflight de injeção passou, mas o Playwright MCP só aceita a porta 5173 e bloqueou o `detect.js` do live-server (`ERR_BLOCKED_BY_CLIENT`). O servidor foi parado com `--keep-inject`. No lugar, medições com `browser_evaluate`:
- rolagem lateral 0 em 390, 768 e 1366;
- nenhum contraste reprovado; o pior texto é o cinza de 12 px, com 6,9:1. O segmento ativo tem 6,6:1 e se distingue também pelo peso;
- nenhum alvo abaixo de 44 px no toque. Com mouse em 1366, os segmentos têm 36 px (`desk:`, intencional);
- o total fixo não cobre conteúdo no fim da rolagem: 21 px de folga em 390 e em 768;
- a ordem do Tab no computador vai dos itens ao cardápio inteiro e volta ao total (é a ordem do DOM do celular);
- a caixa "Itens lançados" é parada de Tab mesmo sem o que rolar.

## Problemas e o que foi feito

| Problema | Origem | O que foi feito | Commit |
|---|---|---|---|
| P1 caixa de itens de 176 px no computador, com metade da tela vazia | A | No `xl` (cardápio ao lado), a caixa cresce com o conteúdo até 28rem, nunca abaixo do `h-44`. Junto, a grade de duas colunas passou de `lg` para `xl` (🟡-2 do qa-redteam: em 1024 com a barra lateral o cardápio tinha 284 px) | `f6e62fa` |
| P2 produto tocado parece selecionado (hover grudado no toque) | A | `[@media(hover:hover)]:hover:` no secundário e no ghost do `Button` | `8f1f44b` |
| P1 "Abrir conta" no pé de uma lista longa | A | Fixo no pé da tela, no mesmo `StickyFooter` do total (decisão do Sirlande de 26/11). Medido em 390 px com 16 contas: o botão fica entre y=778 e 826 numa janela de 844 | `65955ce` |
| P2 ações do rodapé sem hierarquia ("Receber" ou "Fechar" como primária conforme o saldo) | A | **Pergunta ao Gabriel** (decisão do Sirlande de 26/11): `docs/qa/repasses/para_gabriel_26112026.md` | — |
| P2 estado da conta e dado velho com pouco peso | A | Selo no cabeçalho: "Fechada" em âmbar (o backend só marca paga quando os pagamentos cobrem o total, então fechada em geral tem saldo) e "Paga" em cinza; aberta sem selo. O aviso de dado velho com rede vira `InfoNotice` (decisão do Sirlande de 26/11) | `65955ce` |

## Depois das correções (navegador, 26/11)

- 360 px, dois lançamentos na janela de desfazer: a linha caiu de 113 para 89 px e os dois nomes ficam visíveis na caixa; o "(5 s)" não quebra.
- 1024 px: uma coluna, como no tablet; 1366: duas colunas, a suíte vazia com o aviso centralizado.
- Rolagem lateral 0 nas 24 capturas (390, 768, 1024, 1366).

## Observações menores, abertas

- "Aguardando envio" (gray-400) e "Excluído" (`status-free`) têm pontos cinzas parecidos; o texto os separa.
- "Recusado" e "Excluído" usam o mesmo tachado; um ícone no recusado ajudaria.
- O `autoFocus` do "Nome na comanda" abre o teclado e cobre o Mesa/Balcão em 390 px.
- A conta interna ("Equipe e perdas") aparece no meio das contas do salão.
- Na mesa sem cardápio em cache e sem rede, a mensagem não tem "Tentar de novo" (`MenuGrid.tsx`).
- No banco da integração há oito contas "E2E Mesa …" abertas pelo e2e; o banco da demonstração (seed novo) não as tem.
