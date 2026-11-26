# QA Red Team — SPEC-10 F7 (Indicadores), rodada DELTA
**Branch:** feature/t10-fase7-indicadores (03c3ae4) · **Dev:** Sirlande · **Base do delta:** 54d4f23 (fim da 1ª rodada) · **Data:** 26/11/2026
**Escopo:** `git diff 54d4f23...HEAD -- frontend/` (commits 79f4a47 e 12e657e)
**Arquivos auditados:** 4 (`IndicatorsPage.tsx`, `availability.ts`, `availability.test.ts`, `components/Block.tsx`)
**Achados no escopo:** 4 (🔴 0 · 🟡 1 · 🟢 3) · **Repassados:** 0

## Veredito
APROVADO COM RESSALVAS

Não há nenhum 🔴. O delta mexe só no frontend. Não cria chamada nova, não mexe em rota nem em contrato, e o ranking
continua desligado no celular. Os três 🟡 da 1ª rodada que o delta ataca foram conferidos no ambiente vivo e estão
resolvidos. O aviso único sai sem faixas antes dele. O "Tentar de novo" mantém o aviso montado e o foco no botão. O
De/Até espera a digitação parar. Sobra uma ressalva 🟡. A memória `settling` espera a consulta mais lenta, sem limite
de tempo, e enquanto isso esconde falhas que já aconteceram.

## Achados no escopo

### 🟡 [UX/estado] `settling` segura erros reais enquanto a consulta mais lenta não termina, e não tem teto
**Onde:** `frontend/apps/pms/src/features/analytics/availability.ts:24-28`, `IndicatorsPage.tsx:94-103` e `:162-167`
**Cenário (reproduzido com `page.route`, sem criar dado):** no computador, 6 consultas respondem 502 e a
`top-guests` demora 15 s.
- De 0,1 s a 15,3 s a tela mostra 5 spinners e nenhum alerta. Não aparece nem o aviso geral nem o erro de algum bloco.
- Aos 15,3 s aparecem os 6 erros parciais de uma vez.
- Durante essa espera os cartões do dia mostram "—" com a dica normal. O `busy` do `KpiCards` (linha 205) não
  considera `settling`, então o cartão não diz "Carregando…" e o erro da ocupação fica escondido pelo `!settling`.

Não existe timeout no cliente (`lib/api.ts` não passa `signal`). O tempo dessa espera é, portanto, o da consulta mais
lenta: até o `proxy_read_timeout` do nginx, ou sem limite no proxy do Vite. Antes do delta, as falhas apareciam assim
que aconteciam.
**Regra violada:** DESIGN_PMS / PLANEJAMENTO_FRONTEND §10 (estado de erro que diz o que fazer). O dono fica olhando
spinner de um bloco que já falhou.
**Correção sugerida:** dar um teto ao `settling`, por exemplo liberar os erros de bloco depois de N segundos desde a
primeira falha, ou assim que todas as consultas do celular (cartões) tiverem terminado. E alinhar o `busy` dos cartões
com o `blockState`, para não aparecer "—" mudo.

### 🟢 [React] `useRef` escrito durante o render
**Onde:** `IndicatorsPage.tsx:94-96`
**Análise:** `analyticsAvailability` é idempotente: `f(f(p,s).down, s) == f(p,s)`. Por isso o render duplo do
StrictMode (ativo em `main.tsx`) não muda o resultado. A troca de `isDesktop` também está coberta. Com o analytics
fora, testei celular → computador: o aviso continua e os blocos não piscam. Um render descartado (transição ou
Suspense) pode gravar `down` calculado sobre um estado que nunca foi confirmado na tela. Hoje não há `startTransition`
nessa árvore, e o render seguinte recalcula com as mesmas consultas, então não há dano observável. Ainda assim, a
escrita contraria a regra do React ("não ler nem escrever ref no render"), e o React Compiler ou o
`eslint-plugin-react-hooks` 6 vão acusar. O projeto não tem `eslint.config`, então nada acusa hoje.
**Correção sugerida:** guardar `down` num `useState`, atualizado num efeito ou derivado com o padrão "estado anterior"
(`if (next !== prev) setPrev(next)` no render, como a documentação do React descreve).

### 🟢 [Layout] o `<p role="status">` vazio ainda ocupa uma linha da grade flex
**Onde:** `IndicatorsPage.tsx:179-185`
**Cenário:** o `empty:p-0` zera o padding e a altura, mas `w-full` dentro do `flex flex-wrap gap-3` força uma
segunda linha. O `gap-3` entra como espaço morto. Medido a 1280 px: o grupo De/Até tem 84 px de altura com o `<p>`
vazio, contra 72 px sem ele. O título "No período" desce 12 px, e o grupo perde o alinhamento pela base com o
título. Quando o motivo aparece, a altura passa a 28 px e a página se desloca.
**Correção sugerida:** tirar o `<p>` da grade flex (irmão do grupo, não filho), ou usar `basis-full` com margem
negativa. O mínimo é aceitar esses 12 px.

### 🟢 [Texto] a dica "Escolha mais meses acima." com 24 meses já escolhidos
**Onde:** `IndicatorsPage.tsx:222` e `:234`
**Cenário:** com a janela de 24 meses selecionada (o máximo de `SEASONALITY_WINDOWS`) e nada no período, a dica pede
uma ação que não existe.
**Correção sugerida:** mostrar a dica só quando `months < max(SEASONALITY_WINDOWS)`.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
Tudo no ambiente vivo (http://localhost:5173, Chromium headless, sessão do admin Aurora):
- **Queda inteira, no computador:** com `docker stop` no analytics, de 0 a 6 s ficam só os spinners, sem nenhuma
  faixa de erro. Às 6 s (502 + 1 nova tentativa) aparece um aviso só, e os blocos são escondidos. O 🟡1 da 1ª rodada
  está resolvido.
- **"Tentar de novo" com o analytics fora:** o aviso continua montado, a mensagem ganha "Tentando de novo…" por
  cerca de 5 s e o foco fica no botão (`document.activeElement` = o botão). O 🟡2 está resolvido.
- **Volta do analytics:** com `docker start` + "Tentar de novo", o aviso some e os blocos montam com spinner. Em 131 ms
  está tudo carregado, sem piscar erro de bloco. Sem dado em cache, o refetch do TanStack 5 volta a consulta para
  `pending` com `error: null`, por isso não aparece o erro velho.
- **Falha parcial real:** com só a `payment-mix` em 503, o bloco "Meios de pagamento" mostra o erro (1,1 s, depois
  da nova tentativa), sem aviso geral. No celular, com só a ocupação em 503, aparece o erro da ocupação embaixo dos
  cartões.
- **`settling` preso por consulta desligada:** não acontece. No computador as 7 consultas ligam. No celular a lista
  `sources` só tem as 2 que ligam (`useRevenue(monthWindow, isDesktop)` com `isDesktop` falso fica fora da lista).
  Em toda troca de `isDesktop` a lista acompanha o `enabled`.
- **Efeito inicial do De/Até:** `appliedPeriod(period, draft)` devolve a mesma referência, e `setDraftError(null)`
  não muda nada. Medido: nenhuma consulta no segundo depois da carga.
- **Digitação no De/Até:** "11/20/2026" gera 1 par de consultas no fim, não uma por segmento. Com o início depois do
  fim, nenhuma consulta. O motivo e o `aria-invalid="true"` + `aria-describedby="periodo-erro"` aparecem entre 550 e
  650 ms depois da última tecla. Ao corrigir, o motivo some cerca de 600 ms depois (atraso simétrico, aceitável).
- **Desmontagem durante o timer:** sair para `/` 0 ms depois de digitar não gera aviso nem erro no console. O cleanup
  `clearTimeout` funciona.
- **`role="status"` vazio:** `textContent` é `""` (o `{null}` não cria nó de texto), então `:empty` casa: fundo
  transparente, padding 0, altura 0. A região viva fica montada antes do primeiro texto, e por isso o leitor de tela
  anuncia a mudança.
- **Contraste:** #dc2626 sobre o branco dá cerca de 4,8:1 (AA). gray-600 #4b5563 sobre o areia (246 244 239) dá
  cerca de 6,7:1 (AA). Nenhuma regressão.
- **`emptyHint`:** é opcional, e o `EmptyState` já aceita `description` indefinido. O ranking fica sem dica, de
  propósito.
- **`seasonCaption`:** `fillSeasonality` sempre devolve meses, então a legenda nunca termina em " · " vazio.
- **Testes:** `vitest run src/features/analytics` passa 47 de 47. `analyticsAvailability` cobre os 5 casos de
  transição.

## Não foi possível verificar
- **Leitor de tela real (NVDA/Orca):** o anúncio do `role="status"` e a repetição do `role="alert"` do aviso foram
  inferidos pela especificação ARIA. Quando a mensagem ganha e perde "Tentando de novo…", a maioria dos leitores
  relê o aviso inteiro a cada clique. É 🟢 em potencial, não confirmado.
- **Render descartado em modo concorrente:** não há transição nessa tela para provocar o caso. Fica só a análise.
- **Teto real do `settling` atrás do nginx do compose:** o teste da espera foi feito com `page.route`. O
  `proxy_read_timeout` do nginx não foi lido.

**Estado final do ambiente:** `gesway_integracao-analytics-service-1` religado e `healthy`. Nenhum dado criado: as
falhas parciais foram simuladas no navegador (`page.route`).

## Resolução (26/11, mesma sessão)

| Achado | O que foi feito |
|---|---|
| 🟡 `settling` sem teto | Teto de 3 s contado do primeiro erro (`SETTLE_CAP_MS`); volta a valer quando alguma fonte responde. Os cartões mostram "Carregando…" durante a espera. Medido com `page.route` (6 consultas em 502, `top-guests` em 15 s): 0 alerta aos 1,5 s e aos 4 s, 6 erros de bloco aos 9 s (antes: só depois dos 15 s) |
| 🟢 ref escrito no render | A memória da queda virou estado ajustado no render (o padrão do React para estado derivado) |
| 🟢 `<p role="status">` vazio somando o gap | O motivo saiu da linha flex dos campos: `mt-2` só com texto (`empty:mt-0`) |
| 🟢 "Escolha mais meses" com 24 meses | A dica some na maior janela |
