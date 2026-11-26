# QA Red Team — SPEC-10 F7 (Indicadores)
**Branch:** feature/t10-fase7-indicadores (54d4f23) · **Dev:** Sirlande · **Base:** origin/feature/spec-10-identidade@7945bc0 · **Data:** 26/11/2026
**Arquivos auditados:** 10 (4 commits)
**Achados no escopo:** 7 (🔴 0 · 🟡 4 · 🟢 3) · **Repassados:** 0

## Veredito
APROVADO COM RESSALVAS

Nenhum 🔴: não há vazamento, dinheiro, rota nem contrato mexidos (só frontend; nenhuma chamada nova; o ranking
continua desligado no celular). Mas o objetivo principal do commit 79c0187 (um aviso só quando o analytics cai)
não se cumpre por ~2 s em cada queda no computador, e o "Tentar de novo" geral derruba o foco. Os dois foram
reproduzidos no ambiente vivo.

## Achados no escopo

### 🟡 [UI/a11y] Queda geral no computador mostra 5 faixas de erro antes do aviso único
**Onde:** `frontend/apps/pms/src/features/analytics/IndicatorsPage.tsx:70-73` e `:169-179`; `availability.ts:6-7`
**Cenário (reproduzido, analytics parado, 1280 px):** as 7 consultas não falham juntas (com `retry: 1`, uma
fica em `pending` mais tempo que as outras). Enquanto uma ainda carrega, `allSourcesDown` dá `false`. Com isso
aparecem 5 `ErrorState`, cada uma com `role="alert"` ("Não foi possível carregar a receita…" ×2, sazonalidade,
categoria, meios) **e** um spinner. Uns 2 s depois a última cai, `down` vira `true`, as 5 somem e entra o
aviso do topo. Linha do tempo do carregamento: t=6,3 s → 5 alertas; t=8,4 s → 1 alerta. O leitor de tela lê
os 6 avisos, que é justamente o que o P3 do audit da F2 queria evitar. No celular (2 fontes) não acontece: as
duas caem juntas.
**Regra violada:** critério do próprio commit (um aviso só); DESIGN_PMS (estado de erro único e claro).
**Correção sugerida:** esconder os erros por bloco enquanto nenhuma fonte deu certo e alguma ainda está em
voo. Por exemplo: `const settling = sources.some(s => s.isFetching) && !sources.some(s => s.isSuccess)`, e os
erros por bloco/cartão só aparecem com `!down && !settling`. Ou então: `down` = nenhuma em sucesso e pelo
menos uma em erro, sem esperar todas. Vale um teste de `allSourcesDown` com uma fonte `{ isError: false,
isPending: true }`.

### 🟡 [a11y] "Tentar de novo" geral desmonta o próprio botão: o foco vai para o `<body>` e a tela pisca três estados
**Onde:** `IndicatorsPage.tsx:74` (`retryAll`) e `:160-165`
**Cenário (reproduzido):** no computador, o foco está em "Tentar de novo" e a pessoa aperta Enter. O `refetch` de
uma query sem dado volta o status para `pending` (TanStack v5, `fetchState` limpa o `error`). Daí `down = false`
no render seguinte: o aviso e o botão desmontam e `document.activeElement` vira `BODY` (medido em t=0,5 s). A
tela remonta as 3 seções com 5 spinners. Em t≈3,5 s voltam as 5 faixas do achado anterior e em t≈5 s o aviso
único. O foco não volta para o botão. No celular o foco também se perde (o aviso some durante os ~6 s).
**Regra violada:** WCAG 2.4.3 (ordem de foco); DESIGN_PMS (foco visível e previsível).
**Correção sugerida:** manter o aviso montado enquanto a nova tentativa roda, com a regra "a última leitura
foi de queda e há fonte em voo" (ou guardar `wasDown` em estado até alguma fonte voltar). O botão fica no
lugar, de preferência com "Tentando…", e o foco não se perde. A mesma regra resolve o pisca-pisca.

### 🟡 [UX/a11y] Digitar no De/Até consulta valores intermediários e o alerta muda a cada tecla do ano
**Onde:** `IndicatorsPage.tsx:49-52` (`editDraft` → `appliedPeriod` a cada `onChange`) e `:149` (`role="alert"`)
**Cenário (reproduzido no Chromium):** o input `date` do Chrome emite `change` a cada segmento. Ao digitar o
dia "15" sobre "01/11/2026", o "1" já vale "01/11", o "5" vale "15/11" e o mês "1" vale "15/01/2026". Toda
data intermediária válida vira consulta e troca o período das tabelas: spinner, legenda nova e uma requisição
(no teste, `start=2026-01-01` saiu sem a pessoa ter escolhido essa data). Ao digitar o ano, os valores
`0002-…`, `0020-…` e `0202-…` passam pela regex ISO. O alerta alterna entre "Consulte no máximo um ano por
vez." e "A data inicial não pode ser depois da final." (registro: 8 mudanças em uma digitação do campo Até),
e cada mudança do texto de um `role="alert"` é anunciada de forma assertiva. A pessoa ouve um erro que não
cometeu enquanto digita. O que o commit promete ("só vira consulta a data válida") vale, mas "válida" inclui
data incompleta do ponto de vista humano.
**Regra violada:** DESIGN_PMS (erro que diz o que fazer, sem ruído); WCAG 3.3.1/4.1.3 (mensagem de status sem
interromper).
**Correção sugerida:** aplicar com um debounce curto (~600 ms) ou no `blur`/Enter. Mostrar o alerta só depois
do `blur` (ou com debounce) e trocar `role="alert"` por `aria-live="polite"`, mantendo o `aria-describedby`.
Opcional: tratar ano < 1900 como "incompleta" no `periodError`.

### 🟡 [Testes] A fiação da queda geral não tem teste; o de `allSourcesDown` passaria com os dois bugs acima
**Onde:** `availability.test.ts:1-16`; não há `IndicatorsPage.test.tsx`
**Cenário:** os testes cobrem só a função pura com listas estáticas (todas em erro, uma de pé, vazia). Nada
testa que (a) a lista `sources` muda com `isDesktop`, (b) os erros dos cartões somem quando `down`, (c) há
fontes ainda carregando ou (d) o "Tentar de novo" mantém o aviso. Os dois primeiros achados passam em todos os
42 testes verdes.
**Regra violada:** checklist §8 (teste que passaria com a regra quebrada).
**Correção sugerida:** teste da função com fonte `pending` e um teste de componente que faça o mock das
7 queries (uma ainda `isLoading`) e verifique um alerta só.

### 🟢 [UX] `max={today}` é só dica: a data futura digitada é aplicada
**Onde:** `IndicatorsPage.tsx:129,140`; `period.ts:95-103` (`periodError` não olha `today`)
**Cenário:** se a pessoa digita (ou cola) 31/12/2026 no "Até", o Chrome aceita o valor (`rangeOverflow` só
marca a validade), o `appliedPeriod` aplica e a consulta sai com `end` no futuro. O backend aceita
(`queryParams.js:28` só confere start > end). Isso já acontecia antes, com o "Aplicar". A diferença é que
agora sai sem confirmação. Para "categoria por check-in" o futuro até faz sentido, mas aí o `max` contradiz.
**Correção sugerida:** decidir. Ou a regra entra no `periodError` ("até hoje"), ou o `max` sai do "Até".

### 🟢 [UX] "Carregando…" troca a dica de todos os cartões, inclusive os que já têm dado
**Onde:** `components/KpiCards.tsx:17`
**Cenário:** `busy = occupancy.isLoading || revenueToday.isLoading`. Se a ocupação chega e a receita do dia
ainda carrega, o cartão Ocupação mostra "14,3%" com "Carregando…" embaixo, no lugar de "4 de 28 quartos
ocupados agora".
**Correção sugerida:** `busy` por cartão (ocupação/ADR/RevPAR ← `occupancy`; recebido ← `revenueToday`), ou mostrar
"Carregando…" só quando `k.value === NO_VALUE`.

### 🟢 [UI] Tooltip da última barra da sazonalidade sai do cartão
**Onde:** `components/BarChart.tsx:80-82`
**Cenário (medido, 1280 px):** o tooltip de 3 linhas (56 px) da última barra vai de x=1134 a x=1264. A `ul`
termina em 1231, então ele passa uns 17 px da borda do cartão. Ele também começa ~34 px acima da `ul`, por cima
da legenda do bloco. O "Ver tabela" fica por baixo, como o comentário prevê (z-30 sobre z-20,
`pointer-events-none`). Só aparece no hover/foco. O comportamento é anterior à F7, só ficou mais visível.
**Correção sugerida:** ancorar à direita nas últimas barras (`right-0` em vez da posição estática).

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- `sources` no celular tem só `occupancy` e `revenueToday`. As 5 queries desligadas não entram, e por isso
  `isError` de query desligada não interfere. Ao vivo, em 390 px com o analytics fora, aparece um aviso só.
- `isDesktop` usa `(min-width: 768px)`, o mesmo corte do `md:`. Em 768 px aparecem as 3 seções e em 390 px
  nenhuma (o `h2` some).
- "Só os números do dia caem" no computador: `down` fica `false` (as outras 5 fontes estão de pé) e os dois
  `ErrorState` dos cartões continuam aparecendo (`IndicatorsPage.tsx:169-174`). Conferido pelo código.
- `appliedPeriod` com `setPeriod` funcional: `next` não depende de `current`, então não tem corrida.
  Data inválida mantém o período, e o alerta diz qual está valendo ("As tabelas seguem em …"). Conferido ao vivo.
- Títulos: h1 "Indicadores" → h2 "Mês a mês" / "No período" / "Todo o histórico" → h3 de cada `Block`, sem
  salto. Fora do ar, fica só o h1 (os h2 somem junto com as seções).
- "Ver tabela": no toque (`min-h-touch`) tem 48 px, a mesma altura do `pt-12`. No desk tem 36 px. Medido: o
  botão vai de y=421 a 457, e o primeiro `li` começa em 469, então não cobre nenhuma barra. O foco é mantido
  ao alternar (é o mesmo elemento, só muda a classe do wrapper).
- Contraste: o rótulo de grupo `text-gray-600` (#4b5563) sobre branco/creme dá ~7,5:1, e o cabeçalho
  `gray-600` sobre `gray-50` dá ~7,2:1. Os dois passam AA com folga em 12–14 px.
- Ninguém mais usa a prop `actions`, que saiu do `Block`, nem o texto "Aplicar período" (nem o e2e).
- `vitest` nos testes de analytics: 42/42. `tsc --noEmit`: limpo. `qa_checks.sh`: nenhum erro bloqueante (os
  4 avisos são de fora do diff).
- LGPD: o ranking continua só no computador (`enabled`), com o aviso de uso. A legenda perdeu
  "· todo o histórico", que foi para o h2.

## Não foi possível verificar
- Leitor de tela real (NVDA/VoiceOver). O anúncio repetido foi inferido do `role="alert"` com texto mudando,
  registrado por MutationObserver.
- Digitação no Firefox/Safari (lá o input `date` pode emitir eventos de outro jeito). Testado só no Chromium.
- O caso "só os números do dia caem" ao vivo exigiria derrubar só dois endpoints. Ficou na leitura do código.

Evidências (gitignored): `docs/qa/evidencias/spec10_fase7_indicadores_26112026/` (`depois_1280.png`,
`depois_768.png`, `depois_390.png`, `fora_do_ar_1280.png`, `fora_do_ar_390.png`, `tooltip_ultima_barra.png`).
O analytics-service foi parado e religado (`Up … (healthy)` conferido no fim).

## Resolução (26/11, mesma sessão)

| Achado | O que foi feito | Commit |
|---|---|---|
| 🟡1 aviso único depois de 5 faixas | `analyticsAvailability`: enquanto nenhuma fonte respondeu e alguma carrega, os blocos mostram carregando, sem erro. Medido com o analytics parado, amostra a cada 250 ms por 12 s: no máximo 1 `role=alert` | `79f4a47` |
| 🟡2 "Tentar de novo" perde o foco e pisca | A queda fica valendo até alguma fonte responder: o aviso segue montado e diz "Tentando de novo…". Medido: o foco fica no botão durante toda a nova tentativa, no máximo 1 alerta | `79f4a47` |
| 🟡3 consulta e alerta a cada segmento | O De/Até aplica 600 ms depois da última tecla; o motivo fica numa região `status` sempre montada. Medido digitando 15/10/2026: 1 consulta, nenhum texto intermediário no aviso | `79f4a47` |
| 🟡4 sem teste da fiação | 5 testes do `analyticsAvailability` com as sequências (carregando, parcial, queda, nova tentativa, volta). O componente segue sem teste de DOM (a suíte roda em `node`); as transições foram medidas ao vivo | `79f4a47` |
| 🟢5 data futura digitada | Fica: anterior à F7 (o "Aplicar" já aceitava). Registrado | — |
| 🟢6 "Carregando…" nos 4 cartões juntos | Fica: as duas fontes carregam juntas na prática. Registrado | — |
| 🟢7 tooltip da última barra passa da borda | Fica: anterior à F7. Registrado | — |
