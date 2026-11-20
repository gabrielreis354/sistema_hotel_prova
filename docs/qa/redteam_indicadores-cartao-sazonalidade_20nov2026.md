# QA Red Team — Indicadores: rótulo "Cartão" (PR #194) e sazonalidade com meses vazios (PR #195)
**Branches:** `fix/rotulo-cartao-indicadores` (714e675) · `fix/sazonalidade-meses-vazios` (7ca13fa) · **Base:** develop@859cb30 · **Data:** 20/11/2026
**Arquivos auditados:** 5 (shares.ts, shares.test.ts, period.ts, period.test.ts, IndicatorsPage.tsx) + referências (reservationLogic.ts, paymentLogic.ts, Block.tsx, BarChart.tsx, queries.ts, GetSeasonalityController.js, hotelTimezone.js, dates.ts)
**Achados no escopo:** 7 (🔴 0 · 🟡 2 · 🟢 5) · **Repassados:** 0

## Veredito
- **PR #194 (`fix/rotulo-cartao-indicadores`): APROVADO COM RESSALVAS.** A correção está certa. A ressalva é DRY (achado 2).
- **PR #195 (`fix/sazonalidade-meses-vazios`): APROVADO COM RESSALVAS.** A janela bate com o backend, inclusive no fuso e na virada de ano. Há uma regressão: o estado vazio não aparece mais (achado 1).

Nenhum 🔴 no escopo.

## Achados no escopo

### 🟡 [UI/UX — estado vazio] O bloco Sazonalidade nunca mais mostra o estado vazio (PR #195)
**Onde:** `frontend/apps/pms/src/features/analytics/IndicatorsPage.tsx:152` (`isEmpty={seasonBars.length === 0}`), combinado com `period.ts` `fillSeasonality`, que sempre devolve pelo menos `months + 1` itens.
**Cenário:** um hotel novo, sem reserva nos últimos 12 meses, recebe `GET /analytics/seasonality` = `[]`. `fillSeasonality` gera 13 meses zerados, então `seasonBars.length` é 13 e `isEmpty` dá `false`. A tela mostra 13 barras de altura zero, com "0 reservas / sem reservas no mês" em cada mês, quando deveria mostrar o `EmptyState` "Nenhuma reserva nesses meses.". Antes do PR o array vazio mostrava o estado vazio. O `emptyText` virou código morto.
**Regra violada:** contrato do `Block.tsx` (carga, erro e vazio por bloco) e checklist §7 ("ausência de estado vazio"). O bloco irmão "Receita recebida por mês" (`IndicatorsPage.tsx:139`) já resolve isso com `monthBars.every((b) => b.value === 0)`.
**Correção sugerida:** `isEmpty={seasonBars.every((b) => b.value === 0)}`, igual à receita por mês. Acrescentar um teste que prenda o estado vazio com dados `[]`.
**Impacto na banca:** baixo, porque o tenant de demonstração tem seed. Por isso fica em 🟡.

### 🟡 [DRY] Rótulo de meio de pagamento em três mapas paralelos (PR #194)
**Onde:** `frontend/apps/pms/src/features/analytics/shares.ts:4-12`, `frontend/apps/pms/src/features/reservations/reservationLogic.ts:240-251` e `frontend/apps/pms/src/features/reservations/paymentLogic.ts:13-18`.
**Cenário:** o próprio bug que o PR corrige nasceu dessa duplicação. `reservationLogic.ts` já tinha `CARTAO: 'Cartão'` e `shares.ts` não tinha. O PR copia mais uma chave e prende a sincronia num comentário ("Mesmo rótulo da conta da reserva"). Os mapas já divergem hoje: `shares.ts` não tem `CREDIT_CARD`, `DEBIT_CARD` nem `CASH`. Se uma linha antiga com esses códigos aparecer no mix, os Indicadores mostram o código cru e a conta da reserva mostra "Cartão de crédito". O próximo meio novo (por exemplo, boleto) precisa ser lembrado em três arquivos.
**Regra violada:** CLAUDE.md §7 ("lógica duplicada — se existe, reutilize") e DRY (CODING_STANDARDS).
**Correção sugerida:** exportar um único `PAYMENT_METHOD_LABEL`, de preferência no `@hotel/domain` ou num módulo compartilhado do app. `methodLabel` passa a ler esse mapa, e `PAYMENT_METHOD_OPTIONS` deriva o `label` dele. Para o congelamento de 24/11, o PR como está resolve o sintoma. A unificação pode ficar registrada como pendência.

### 🟢 [UI/UX — texto] "1 reservas" e "sem reservas no mês" na coluna de noites
**Onde:** `IndicatorsPage.tsx:82-83`
**Cenário:** um mês com 1 reserva mostra "1 reservas". O plural errado já existia antes, mas a linha foi reescrita no PR. Na tabela, a coluna "Noites em média" de um mês zerado mostra "sem reservas no mês", enquanto o próprio `BarChart.tsx:62` usa "—" para detalhe ausente.
**Correção sugerida:** `${n} ${n === 1 ? 'reserva' : 'reservas'}`. Para `detail`, usar `undefined` quando `avg_nights === null` (a tabela mostra "—"), ou "—" direto.

### 🟢 [UI/UX — legenda] "últimos 12 meses" com 13 barras, ou mais
**Onde:** `IndicatorsPage.tsx:148` (legenda, sem mudança no PR), que fica visível agora com o preenchimento.
**Cenário:** na janela de 12, o eixo vai de nov/25 a nov/26 (13 barras), mais os meses futuros que existirem. Antes, com meses faltando, a diferença passava despercebida. Agora o gerente conta 13 barras ou mais sob "últimos 12 meses".
**Correção sugerida:** legenda com o intervalo real, por exemplo `nov/25 em diante`, a partir do primeiro mês de `fillSeasonality`.

### 🟢 [Robustez] Reserva muito no futuro estica o eixo com dezenas de meses zerados
**Onde:** `period.ts` `fillSeasonality` (`lastReturned`). O backend não tem limite superior (`GetSeasonalityController.js:25`).
**Cenário:** uma reserva lançada com o ano errado (check-in em 2028-11) gera, na janela "6 meses", cerca de 30 barras (mai/26 a nov/28), quase todas zeradas, e comprime o gráfico. Antes apareciam só as barras com dado. O comportamento é coerente com o backend, mas o eixo fica refém de um outlier.
**Correção sugerida:** aceitar como está (é fiel ao dado). Se incomodar, limitar o fim visível a hoje + N meses, ou limitar no backend.

### 🟢 [Fuso — virada de mês com a tela aberta] `today` congelado na sessão contra o backend que recalcula
**Onde:** `IndicatorsPage.tsx:39` (`useState(todayISO)`, decisão anterior ao PR) e `fillSeasonality(today, …)` (`:78`).
**Cenário:** a tela fica aberta de 30/11 23:50 até 01/12. Um refetch (foco ou janela trocada) faz o backend usar `hotelToday()` = 2026-12-01, com início em dez/25. O front continua com `today` = 2026-11-30, com início em nov/25. O front então mostra nov/25 como "0 reservas", embora o backend apenas não o tenha consultado. O mês aparece zerado de forma enganosa. O risco é pequeno: só acontece com a tela aberta na virada do mês.
**Correção sugerida:** derivar o primeiro mês do próprio dado quando houver, ou mandar `today` na query para o backend. Por ora, registrar como limitação.

### 🟢 [Testes] Faltam o teste de tela e o caso `avg_nights` ausente com reservas
**Onde:** `period.test.ts` (5 casos novos e bons: 13 meses, buraco no meio, futuro, virada de ano, linha inválida). Não existe `IndicatorsPage.test.tsx`.
**Cenário:** nenhum teste pega o achado 1, porque o vazio só se manifesta na ligação com a página. Outro caso: uma linha `{ month, reservations: 3 }` sem `avg_nights` vira `avg_nights: null`, e a tela diria "sem reservas no mês" com 3 reservas. O backend sempre manda a média quando `COUNT > 0`, então hoje isso não acontece. Mesmo assim, o texto deveria depender de `reservations === 0`, não de `avg_nights === null`.
**Correção sugerida:** teste do critério de vazio, ou extrair `isSeasonEmpty(bars)` puro e testá-lo. Na página, decidir o `detail` por `reservations === 0`.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- **Janela contra o backend:** `monthFromIndex(monthIndex(hoje) − months)` é equivalente a `DATE_TRUNC('month', :today − make_interval(months => :months))`, inclusive no dia 31 (31/03 − 1 mês = 28/02 no PG, truncado em fev, mesmo mês). Sem limite de fim nos dois lados. A virada de ano tem teste (`2026-01-05`, 2 meses = `2025-11..2026-01`).
- **Fuso:** `todayISO` usa `formatInTimeZone(new Date(), HOTEL_TZ)` com `HOTEL_TZ = 'America/Sao_Paulo'` (`packages/domain/src/dates.ts:12,52`). O backend usa `hotelToday()` com `HOTEL_TIMEZONE = 'America/Sao_Paulo'`. É o mesmo "hoje".
- **Loading e erro:** `Block.tsx` testa `isLoading` (Spinner) e `error` (ErrorState) antes de renderizar `children`. `useSeasonality` não usa `placeholderData`, então trocar a janela mostra o Spinner, não 13 barras zeradas nem dados velhos sobre o eixo novo. As barras zeradas só aparecem com sucesso e `[]`, que é o achado 1.
- **`fillMonths` refatorado** para `monthRange` sem mudar o comportamento (os testes antigos passam).
- **Tipos:** `avg_nights: number | null` modela "média de nada" sem fingir zero. `tsc --noEmit` passa na branch #195.
- **Rótulo:** `methodLabel('CARTAO')` dá 'Cartão', igual a `reservationLogic.ts:250`. O seed realmente grava `'CARTAO'` (`seed_hotels.sql:270+`, `seed_hoje.sql:73,75`).
- **Testes:** `vitest run src/features/analytics` passa nas duas branches: #194 com 30/30 e #195 com 34/34 (rodado em worktree destacado, já removido).
- **Texto em PT-BR** em comentários, testes e UI.
- **Sem backend no diff:** nenhuma query, tenant, LGPD, Swagger ou `require()` envolvido.

## Não foi possível verificar
- A renderização real no navegador (Edge) da tela com tenant vazio. O achado 1 foi confirmado lendo o código (`Block.tsx` + `fillSeasonality` + o `isEmpty` da linha 152), não visualmente.
- A cobertura percentual do portão de 60%: não rodei com `--coverage`.

---

## Desfecho (20/11/2026)

- PR #195, 🟡 estado vazio: corrigido. `noSeasonReservations` (`period.ts`, com teste) decide o `isEmpty`; hotel sem reserva volta a ver "Nenhuma reserva nesses meses.".
- PR #195, 🟢 "1 reservas" e "sem reservas no mês": corrigidos ("1 reserva" e "—").
- PR #194, 🟡 rótulo do meio em três mapas (`shares.ts`, `reservationLogic.ts`, `paymentLogic.ts`): fica como pendência pós-congelamento (mapa único no `@hotel/domain`).
- 🟢 que ficam: legenda "últimos 12 meses" com 13 barras, eixo esticado por reserva com ano errado, mês de início na virada do mês, teste de tela.
