# /impeccable critique — Indicadores (F7 da SPEC-10), 26/11/2026

**Execução:**
- duas avaliações isoladas em subagentes: A (design) e B (detector e navegador);
- síntese e correções nesta sessão;
- HEAD avaliado: `54d4f23`.

**Especificidade:** feita para este produto. Os números são os de hotelaria (ocupação com "4 de 27 quartos", ADR, RevPAR, recebido hoje), o dinheiro é exato e tabular, o ranking explica o uso do dado pessoal e o celular mostra só os números do dia. As seções por período resolveram o filtro escondido. O que ainda parece genérico: as barras sem valor escrito.

**Nielsen (A): 26/40.** As menores notas: visibilidade do estado (2), consistência (2), flexibilidade (2) e ajuda (2).

## Detector e navegador (B)

- **Linha de comando:** 0 achados nos 7 `.tsx`.
- **Overlay:** indisponível, pelo mesmo motivo da F6 (o Playwright MCP só aceita a porta 5173).
- **Medições:**
  - nenhuma rolagem lateral em 390, 768 e 1366;
  - títulos h1 → h2 → h3 sem salto;
  - De/Até: data inválida mantém as legendas, a válida aplica;
  - 0 erro de console;
  - **dois contrastes abaixo de 4,5:1 sobre o areia:** o motivo da data (4,39:1) e o aviso do celular (4,40:1);
  - o tooltip da última barra cobre o "Ver tabela" enquanto está aberto.

## Problemas e o que foi feito

| Problema | Origem | O que foi feito | Commit |
|---|---|---|---|
| Contraste do motivo da data e do aviso do celular | B | O motivo ganhou fundo branco; o aviso passou a gray-600 | `79f4a47` |
| P1 legenda da sazonalidade ("12 meses" com 14 barras) | A | Legenda com o intervalo desenhado ("nov/25 a dez/26") | `79f4a47` |
| P2 texto do vazio igual em todo bloco | A | `emptyHint` por bloco: "Escolha mais meses acima." nos gráficos, "Troque as datas De e Até." nas tabelas, nada no ranking | `79f4a47`, `12e657e` |
| P2 tabela de categorias esticava o cartão vizinho | A | `items-start` na grade | `79f4a47` |
| P1 barras sem valor escrito | A | **Aberto, decisão do Sirlande** | — |
| P1 mês futuro da sazonalidade igual ao passado; eixos deslocados | A | **Aberto, decisão do Sirlande** | — |
| P2 categorias sem limite (5 maiores + "Outras") | A | **Aberto, decisão do Sirlande.** As "E2E Categoria" vêm do banco da integração; o seed da demonstração não as tem | — |
| P2 sem "atualizado às" | A | **Aberto, decisão do Sirlande** | — |

## Observações menores, abertas

- Em 768 px, os rótulos dos meses aparecem truncados ("ma…").
- Cada barra é uma parada de Tab: são 26 antes do De/Até.
- A falha parcial mostra a mensagem da consulta como veio.
- "Última saída" do ranking pode ser uma data futura (saída prevista de quem está na casa).
- "Meses no gráfico" governa dois gráficos.
