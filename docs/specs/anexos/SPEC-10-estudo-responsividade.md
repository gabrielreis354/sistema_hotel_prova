# SPEC-10 — Estudo de telas e responsividade

**Criado em:** 22/11/2026 · **Responsável:** Sirlande, com Claude Code
**Protótipo:** https://claude.ai/artifact/FQJbmJrWow4xgPVj3QB7Kf (painel Hoje da Fase 1: desktop 1366, celular 360 e tablet 800)
**Vale para:** todas as fases da §10.4 da SPEC-10, principalmente a comanda (Fase 5), que é a tela mais usada no celular.

---

## 1. Em quais telas o Gesway roda

Dados do StatCounter para o Brasil em 2026. As páginas do StatCounter divergem no mês e na
ordem exata, então os números servem como tendência, não como medida.

| Tipo | Larguras mais comuns (CSS px) | Quem usa no Gesway |
|---|---|---|
| Celular | **375** (375×812), **414** (414×896), **384** (384×832); **360** nos Android mais simples | Garçom na comanda; gerente olhando o painel |
| Tablet em pé | **800** (800×1280), cerca de 601, e 768 (768×1024) bem atrás | Recepção sem computador |
| Tablet deitado | **1280** (1280×800) | Recepção, com o dedo |
| Desktop | **1366** no balcão; 1920 | Recepção e administrador |

## 2. Regras que saem do estudo

| # | Regra | Por quê |
|---|---|---|
| R-1 | **Projetar o celular em 360 px.** Conferir em 375 e 414 | É o caso mais estreito comum: se cabe nele, cabe nos outros |
| R-2 | **A primeira ação da tela fica acima da dobra no celular.** Em 375×812 sobram cerca de 570 px úteis (tirando a barra do navegador, o topo e a navegação de baixo) | No painel Hoje, a 1ª chegada estava perto de 650 px, abaixo da dobra. Com o resumo compacto, subiu para perto de 500 px |
| R-3 | **O tamanho do alvo de toque segue o tipo de ponteiro, não a largura.** Compacto (36 px) só com `pointer: fine`; com dedo, 48 px em qualquer largura | O app hoje usa `xl:min-h-0` e `xl:h-9` em 20 lugares e não consulta `pointer`. Um tablet de 1280 px deitado ganha botões de 36 px para o dedo |
| R-4 | **Folga para a barra de gestos do iPhone** na navegação de baixo: `padding-bottom: max(6px, env(safe-area-inset-bottom))` | Sem ela, a aba fica embaixo do gesto de voltar para a tela inicial |
| R-5 | **Lista horizontal que rola avisa que continua:** esmaecer a borda e mostrar o total ("Atenção 4") | No protótipo, só 2 dos 4 alertas apareciam, e nada indicava os outros |
| R-6 | **Texto do topo não quebra:** nome do hotel e do usuário numa linha, com "…" | Em 360 px, "Recepção Aurora 1 · Recepcionista" quebrava |
| R-7 | **Conteúdo do desktop com largura máxima e centralizado**, e o topo alinhado à mesma coluna | Em monitor largo, conteúdo à esquerda deixava uma faixa vazia, e o "Sair" desalinhava dos cartões |
| R-8 | **No máximo 2 colunas de blocos no painel**, caindo para 1 em tela estreita | Com 3 colunas, a ordem dos blocos se perdia e abria buraco |
| R-9 | **No celular, informação que ocupa muita altura fica recolhida e abre no toque** (como a grade por andar da fita) | Mantém o resumo à vista sem empurrar a ação para baixo |
| R-10 | **Bloco do painel decide o layout pela largura da área de conteúdo** (*container query*), não pela largura da janela (*media query*) | A barra lateral come 236 px a partir de 768 px: com 800 px de janela, o conteúdo tem ~560 px. A regra pela janela errou no protótipo; a pela área de conteúdo acertou no tablet e no desktop |

## 3. Como o app se distribui por largura hoje

A casca usa os breakpoints do `packages/config/tailwind-preset.js` (`md` = 768 px):

| Largura | Casca | Painel Hoje |
|---|---|---|
| < 768 (celular e tablet de ~601) | Barra de navegação embaixo, com "Mais" | 1 coluna, botões da largura toda |
| 768 a 1279 (tablet em pé de 800) | Barra lateral | 1 coluna |
| ≥ 1280 (notebook, tablet deitado, desktop) | Barra lateral | 2 colunas; botões compactos **(rever pela R-3)** |

## 4. O que ficou para depois

- **Comanda (Fase 5):** precisa de um estudo próprio de uso com uma mão e rede ruim, com as R-1 a R-6 como ponto de partida.
- **Tablet de 800 px:** a prancha existe no protótipo, mas não foi conferida em captura.
- **Leitor de tela e navegação por teclado** no celular: ainda não testados.

## 5. Fontes

- [StatCounter — resolução de tela em celular, Brasil](https://gs.statcounter.com/screen-resolution-stats/mobile/brazil)
- [StatCounter — participação por resolução em celular, Brasil](https://gs.statcounter.com/screen-resolution-market-share/mobile/brazil)
- [StatCounter — resolução de tela em tablet, Brasil](https://gs.statcounter.com/screen-resolution-stats/tablet/brazil)
- [StatCounter — participação por resolução em tablet, Brasil](https://gs.statcounter.com/screen-resolution-market-share/tablet/brazil)
- [StatCounter — celular e tablet, Brasil](https://gs.statcounter.com/screen-resolution-stats/mobile-tablet/brazil)
