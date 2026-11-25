# /impeccable critique — painel Hoje (F3 da SPEC-10), 25/11/2026

**Execução:**
- duas avaliações isoladas em subagentes: A (design, sem o detector) e B (detector e navegador);
- síntese e correções nesta sessão;
- o alvo foi `frontend/apps/pms/src/features/today/`, no HEAD `59ec1a1`.

## Nota (Nielsen, avaliação A): 31/40

| Heurística | Nota | Heurística | Nota |
|---|---|---|---|
| Visibilidade do estado | 3 | Reconhecimento em vez de memória | 3 |
| Correspondência com o mundo real | 3 | Flexibilidade e eficiência | 2 |
| Controle e liberdade | 3 | Estética e minimalismo | 3 |
| Consistência | 3 | Recuperação de erros | 3 |
| Prevenção de erro | 4 | Ajuda | 3 |

**Especificidade do design:** é um PMS e não um painel genérico. A fita por andar, o quarto em destaque e o "Chega hoje" separado do "Livre" vêm do domínio. A moldura dos blocos (ícone em quadrado tingido, contagem em pílula) é a parte mais genérica.

## Detector e navegador (avaliação B)

**Linha de comando:** um `side-tab`, em `rows.tsx` (o aviso de saldo em aberto). Já existia antes desta fase, no commit `801bc7d`.

**Overlay na página:**
- `repeating-stripes-gradient` na bolinha "Manutenção". É falso positivo: o hachurado codifica o status.
- `straggler`: a hora quebrava sozinha no bloco Em limpeza. Corrigido.

**Medições:**
- os ícones da fita têm de 3,2:1 a 5,2:1;
- toque ≥ 44 px em 360;
- sem transbordo em 360, 375, 768 e 1366;
- altura em 375 px: 2.765 px.

## Problemas e o que foi feito

| # | Problema | Feito |
|---|---|---|
| P1-a | "Vendidos 4" contra "Chega hoje 2", com as duas chegadas atrasadas: os números não fechavam | O resumo diz "chegadas no prazo", e a chegada atrasada ganha o relógio no quarto e no nome |
| P1-b | A fita tinha uma parada de Tab por quarto e empurrava a primeira chegada para baixo da dobra | A grade virou uma parada, com setas, Home e End; o Esc fecha o detalhe; os quartos ficaram mais baixos com mouse. Em 1366×768 o primeiro "Fazer check-in" ficou em y = 683 |
| P1-c | A fita não mostrava a saída do dia | Quem sai hoje troca o ícone (seta de saída) e o nome ("sai hoje", "saída atrasada"), e o topo ganhou "Saem hoje" |
| P2 | Filtro sem efeito no celular | O filtro abre a grade; o esmaecido é sem saturação, e o ícone continua legível |
| P2 | O Atenção repete a rotina (limpeza logo depois do check-out) | **Aberto, para o Gabriel** (regra do painel): limpeza só acima de um tempo parado? |
| — | Contorno do "Livre" a 1,5:1 | Decisão do Sirlande: tracejado `gray-400` |

## Em aberto (observações menores)
- O dia da semana no cabeçalho ("terça, 25/11").
- "22,2%" com casa decimal num hotel pequeno: o `formatPercent` é compartilhado com os Indicadores.
- O verde de "Ocupado" perto do esmeralda da marca: testar com a recepção. A paleta não é reaberta.
- Um atalho de teclado para a próxima chegada: 5º semestre.
