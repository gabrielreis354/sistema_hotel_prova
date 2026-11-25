# /impeccable critique — listas e formulários (F5 da SPEC-10), 25/11/2026

**Execução:**
- duas avaliações isoladas em subagentes: A (design) e B (detector e navegador);
- síntese e correções nesta sessão;
- HEAD avaliado: `91ba1a1`.

**Especificidade:** feita para este produto. O selo do quarto à esquerda com a reserva em duas linhas, as diárias junto do período e o período segmentado tingido (filtro, não ação) vêm do balcão. Tabelas de Hóspedes e Quartos e o formulário de novo hóspede são genéricos.

**Nielsen (A): 27/40.** As menores notas: consistência (2), reconhecer em vez de lembrar (2), flexibilidade (2) e ajuda (2). Carga cognitiva moderada: 2 de 8 falhas, ambas no tablet e na barra fixa.

## Detector e navegador (B)

**Linha de comando:** 0 achados nos 12 `.tsx` (só regex).

**Overlay:** injetado nas 6 telas, "No anti-patterns found" em todas. O Playwright MCP só aceita a porta 5173; B rodou a injeção num script Playwright local.

**Medições (antes):**

| O que | Resultado |
|---|---|
| SegmentedControl ativo / inativo | 6,56:1 / 10,31:1; 48 px no toque; anel de foco visível |
| Status das reservas em 768 | Cortado: tabela de 540 px num cartão de 466 px com `overflow-hidden` |
| Ficha do hóspede em 768 | Página rola 8 px de lado (e-mail sem quebra) |
| Links de hóspede nos Indicadores | 37 e 17 px de altura abaixo do `lg` |
| Barra da nova reserva em 768 | Solta 54 px acima do rodapé |
| Dobra em 1366×768 | Ação principal visível, exceto "Aplicar período" dos Indicadores |

## Problemas e o que foi feito

| # | Problema | Feito |
|---|---|---|
| P1 | Status das reservas cortado em 768 px | `Table` do @hotel/ui e colunas só no `lg` (abaixo, as duas linhas do celular). Medido: tabela 466 em cartão 466 (`8aeeecb`) |
| P1 | Barra com o valor e o Confirmar cinza, sem motivo | Motivo em até duas linhas; pronta, "hóspede · diárias · quarto" (`3866217`) |
| P2 | Barra solta 54 px no tablet | `md:bottom-0` (`3866217`) |
| P2 | Hóspedes, Quartos e ficha do hóspede passam da largura em 768 px | Telefone, e-mail, andar, categoria e diária só no `lg`; `px-3`; e-mail quebra; histórico no `Table`; volta no topo (`07b49ae`) |
| P2 | Links de hóspede dos Indicadores abaixo de 48 px | 48 px no toque, compacto com mouse (`07b49ae`) |
| B | Ativo do segmentado só por cor (também 🟡3 do red team) | `font-semibold` (`22c17c6`) |
| P2 | Histórico do hóspede sem link para a reserva nem quarto | **Aberto**: é funcionalidade nova, fora da SPEC-10. Pendência |
| A | Lista de reservas sem busca por nome; busca de hóspedes sem foco ao abrir | **Aberto**: funcionalidade. Pendência |
| A | Dois modelos de período nos Indicadores (meses na hora, De/Até com "Aplicar"), "Aplicar" abaixo da dobra | **Aberto**: candidato à F7 (Indicadores) |

## Depois das correções (navegador, 25/11)

| Largura | Conferido |
|---|---|
| 390 | Reservas sem rolagem lateral, link da reserva 48 px com o selo dentro; barra com motivo em 2 linhas e, pronta, "Isabela Castro · 1 diária · 101"; foco nos 8 quartos nunca atrás da barra |
| 768 | Reservas, Hóspedes, Quartos, ficha do hóspede e Indicadores sem rolagem lateral; Status inteiro; "Editar" visível; links dos Indicadores com 48 px; barra da nova reserva encostada no fim |
| 1366 | Reservas com as 5 colunas, selo escondido, sem rolagem lateral |

Capturas em `docs/qa/evidencias/critique_spec10_f5_25112026/` (gitignored).

## Observações menores, abertas
- Telefones crus ("+55-11-91000-0009") contra o exemplo "(11) 90000-0000" do formulário.
- Altura de linha diferente entre tabelas (48 px em Hóspedes, ~41 px nas outras).
- Telefone da ficha sem `tel:`; novo hóspede não marca os campos opcionais.
- "Livre" cinza e "Ocupado" verde, ao contrário do costume de rack: pergunta, não erro.
