# QA Red Team — Janela de datas do check-in
**Branch:** feature/checkin-datas · **Dev:** Gabriel (agente executor) · **Base:** develop@9a3727c · **Data:** 15/11/2026
**Arquivos auditados:** 30 (diff `9a3727c..73c675a`, 4 commits), mais os vizinhos lidos por contexto: `ListReservationController.js`, `CancelReservationController.js`, `UpdateReservationController.js`, `ReleaseRoomController.js`, `SignContractController.js`, `ReservationModel.js`, `db/schema.sql`, `seed/seed_hotels.sql`, `reservationsApi.ts`, `TodayPage.tsx`, `today/queries.ts`, `todayApi.ts`, `todayLogic.ts`, `packages/ui` (`ActionSlot`), `packages/domain/src/dates.ts`, `api-client/src/schema.d.ts`, `test_rotas.sh`, `scripts/qa_explorador_dados.mjs`
**Achados no escopo:** 9 (🔴 0 · 🟡 5 · 🟢 4) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Não há 🔴 no escopo. A regra está no lugar certo e não tem desvio:
- `CheckInController` é o único caminho que grava `CHECKED_IN`. Webhook PIX, contrato B2B, `PUT /reservations/:id` e seed não fazem essa transição pela API.
- A checagem de datas roda depois do lock da reserva e antes de travar quartos.
- `todayInHotel` está correto num servidor em UTC (conferido: `02:59Z → 2026-11-15`, `03:00Z → 2026-11-16`).
- Backend e `@hotel/domain` têm os mesmos limites: `today < in` dá cedo demais, `today >= out` dá vencida.

As ressalvas, por ordem de importância:
1. Contrato do Swagger errado (🟡-1).
2. Mensagem de 422 enganosa no front (🟡-2).
3. Testes que não pegariam um erro de fuso (🟡-3).
4. Smoke script quebrado (🟡-4).
5. Uma lacuna operacional na madrugada, que pede decisão do Gabriel (🟡-5).

## Achados no escopo

### 🟡-1 [Contrato de API] O 422 do check-in passou a apontar para `RoomError`, que exige `code` e cujo enum não tem os códigos novos
**Onde:** `services/core-service/config/swagger.js:1055` (o 422 de `/reservations/{id}/check-in`) e `swagger.js:244-253` (`RoomError`: `required: ['error','code']`, `code.enum` só com códigos de quarto/categoria). `frontend/packages/api-client/src/schema.d.ts` não foi regenerado: o 422 ainda aparece como `Error`.
**Cenário:** o contrato publicado diz três coisas falsas.
- (a) Todo 422 de check-in traz `code`. Não traz: o 422 de status (`CheckInController.js:40`) devolve só `{ error }`.
- (b) `code` é um de `INVALID_INPUT…ROOM_NOT_AVAILABLE`. O servidor devolve `CHECK_IN_TOO_EARLY` e `RESERVATION_EXPIRED`, que estão fora do enum.
- (c) Quem regenerar o `api-client` (`pnpm generate`) recebe um tipo que, num `switch (error.code)`, estreita para códigos de quarto e não conhece os dois que a tela precisaria tratar. O validador de resposta de qualquer cliente que confie no schema rejeita os dois casos.

Não é 🔴 porque o corpo continua compatível em runtime: `error` sempre vem, e o front atual só lê `error`.
**Regra violada:** CLAUDE.md §6/checklist: o Swagger é o contrato do cliente tipado. DIVISAO §7: `swagger.js` tem regra de "uma pessoa".
**Correção sugerida:** um schema próprio, por exemplo `CheckInError { error: string, code?: enum['CHECK_IN_TOO_EARLY','RESERVATION_EXPIRED'] }`, ou `oneOf [Error, CheckInWindowError]`. Não reaproveitar `RoomError`. Depois, regenerar `schema.d.ts` no mesmo PR.

### 🟡-2 [UX] Todo 422 vira "A reserva mudou de situação em outro atendimento", inclusive o 422 de datas
**Onde:** `frontend/apps/pms/src/features/reservations/reservationsApi.ts:217-223`. A branch criou duas causas novas de 422 sem tocar nesse mapeamento.
**Cenário:** o painel "Hoje" fica aberto em tablet. `useHotelToday` só reavalia a cada `REFRESH`, e `ArrivalItem` usa `todayISO()` do relógio do aparelho. Basta o relógio do tablet estar um dia atrás, ou a tela ter ficado aberta na virada da meia-noite, para o botão continuar habilitado. A recepcionista toca "Confirmar check-in", o servidor responde 422 `RESERVATION_EXPIRED`, e a tela mostra: *"A reserva mudou de situação em outro atendimento (Reserva vencida: a saída era 15/11/2026. Cancele…). A tela foi atualizada — confira antes de tentar de novo."* A frase culpa um "outro atendimento" que não existiu e manda "tentar de novo", que vai falhar de novo.
**Regra violada:** checklist §7 do red team: o erro precisa dizer o que fazer, e esta mensagem diz o errado.
**Correção sugerida:** em `transitionReservation`, quando `error.code` for `CHECK_IN_TOO_EARLY` ou `RESERVATION_EXPIRED`, repassar `serverMessage(error)` puro, sem o prefixo de concorrência. Teste unitário com os dois códigos.

### 🟡-3 [Testes] Os testes calculam "hoje" com a mesma função que está sendo testada, então um erro de fuso passaria
**Onde:**
- `services/core-service/tests/helpers/stayDates.js:15-17` (`stayFromToday` usa `todayInHotel`).
- `tests/checkin-room-status.test.js:150` (`const hoje = () => todayInHotel()`).
- `tests/reservations-status-filter.test.js:412`.

Não existe teste unitário de `todayInHotel` com instante fixo, nem de `checkInWindow` do backend.
**Cenário:** alguém troca `todayInHotel` por `new Date().toISOString().slice(0,10)` (UTC), ou um refactor futuro passa a ler o fuso do tenant e erra. Das 21h à meia-noite de Brasília o servidor recusaria como `CHECK_IN_TOO_EARLY` a chegada do próprio dia, porque o UTC já virou. Mesmo assim, as 1205 asserções continuam verdes: as datas da fixture e a do controller saem da mesma função errada e concordam entre si. É justamente o risco que a tarefa pediu para caçar, e ele não tem cobertura.
**Regra violada:** checklist §8 do red team: um teste que passaria com a regra quebrada.
**Correção sugerida:** um `tests/checkInWindow.unit.test.js` com:
- `todayInHotel(new Date('2026-11-16T02:59:00Z')) === '2026-11-15'`;
- `todayInHotel(new Date('2026-11-16T03:00:00Z')) === '2026-11-16'`;
- `checkInWindow` com os 4 limites (entrada hoje, atrasada, saída hoje, futura).

Pode ser opcional injetar `now` no controller, mas o teste unitário já fecha o buraco.

### 🟡-4 [Regressão de script] `test_rotas.sh` faz check-in numa reserva de 01–05/08/2026 e agora quebra
**Onde:** `test_rotas.sh:84` (reserva `2026-08-01 → 2026-08-05`) e `:113-115` (T12: check-in, depois `d["status"]` no Python).
**Cenário:** depois do merge, rodar `bash test_rotas.sh`. T12 recebe 422 `RESERVATION_EXPIRED`, `d["status"]` levanta `KeyError`, e T13 ("cancelar CHECKED_IN espera 422") passa a testar o cancelamento de uma reserva PENDING, que dá 200. O smoke mente sem avisar. A branch migrou cerca de 17 suítes de teste, mas não migrou o script de smoke. O `scripts/qa_explorador_dados.mjs` já usa datas relativas a hoje em SP e está ok.
**Regra violada:** um efeito colateral proibido do plano ("o que NÃO deve mudar").
**Correção sugerida:** gerar as datas a partir de `TZ=America/Sao_Paulo date +%F` no script, para T12, e `+3 days` para o conflito de T7/T8.

### 🟡-5 [Regra de negócio — pede decisão] O hóspede que chega de madrugada para a noite que já começou não tem caminho correto
**Onde:** `services/core-service/app/utils/checkInWindow.js:18` (`today >= checkOutDate → EXPIRED`) e o espelho em `frontend/packages/domain/src/state-machines.ts`.
**Cenário:** reserva de 14/11 a 15/11, uma noite, PENDING. O voo atrasa e o hóspede chega ao balcão às 01:30 de 15/11. `todayInHotel()` já é 15, igual à saída, então o check-in recebe 422 `RESERVATION_EXPIRED` e a tela manda cancelar. As saídas que existem levam ao valor errado:
- cancelar e abrir um walk-in de 15 a 16 cobra uma noite que não é a dele e ocupa o quarto da noite seguinte;
- editar a saída para 16 (`PUT /reservations/:id`) recalcula o total para duas diárias.

Em hotel, o "dia do hotel" costuma virar na auditoria noturna, não à meia-noite.
**Regra violada:** nenhuma regra escrita. A decisão de 15/11 diz explicitamente "saída hoje = vencida", e o código a segue. O achado é de produto: "mapeia para uma operação real" (CLAUDE.md §1).
**Correção sugerida:** levar ao Gabriel antes do merge. As opções são:
- (a) aceitar e registrar a limitação no CLAUDE.md §3;
- (b) tolerância de madrugada, com `today` calculado como `todayInHotel(now - N horas)` até um corte (por exemplo, 06h);
- (c) permitir, na saída-hoje, check-in com confirmação explícita só para ADMIN.

### 🟢-1 [UX] No painel Hoje, a chegada vencida pede "Cancele", mas a linha não tem botão de cancelar
**Onde:** `frontend/apps/pms/src/features/today/components/rows.tsx:159-200`.
**Cenário:** as chegadas vêm de `from=hoje&to=hoje&status=PENDING,CONFIRMED` (`ListReservationController.js:31`, `check_out_date >= from`). Por isso uma reserva PENDING de 13 a 15/11 aparece em 15/11 como "Chegada atrasada · entrada era 13/11/2026", com o check-in desabilitado e o motivo "Reserva vencida: a saída era 15/11/2026. Cancele em vez de fazer o check-in."

O motivo aparece, e é texto, não só cor, então a acessibilidade está ok. Mas, para cancelar, a recepção precisa achar o link do nome e ir ao detalhe, onde o cancelar funciona (`actions.cancel` segue `{enabled:true}`, com teste em `reservationLogic.test.ts`). Além disso, o "era" com a data de hoje soa estranho.
**Correção sugerida:** trocar o texto para "a saída é hoje (15/11)" quando `check_out_date === today`, e acrescentar "— abra a reserva para cancelar", ou levar o cancelar para a linha, reaproveitando o `ConfirmPanel`.

### 🟢-2 [Consistência] Existem duas fontes de "hoje" no painel
**Onde:** `TodayPage.tsx:21` (`useHotelToday()`, que alimenta `arrivalRows`) e `rows.tsx:159` (`reservationActions(r.status, r)`, com `today` no default `todayISO()`).
**Cenário:** logo depois da meia-noite, até o próximo tick de `REFRESH`, a linha é classificada com o "hoje" de ontem (atrasada ou não), enquanto o botão usa o de hoje. É inofensivo porque o servidor decide, mas são duas verdades na mesma linha.
**Correção sugerida:** passar `today` do `TodayPage` até `ArrivalItem` e daí para `reservationActions(r.status, r, today)`.

### 🟢-3 [Fail-safe no front] Sem datas, o check-in fica habilitado
**Onde:** `frontend/apps/pms/src/features/reservations/reservationLogic.ts:125`.
**Cenário:** um payload sem `check_in_date` (lista com `attributes` reduzido no futuro) deixa o botão habilitado. O servidor barra, porque as colunas são `NOT NULL` e a checagem sempre roda, mas a tela vira a mensagem enganosa da 🟡-2. É o oposto da allowlist usada para o status.
**Correção sugerida:** é aceitável como está, já que o servidor é a autoridade. Se quiser simetria, use `enabled:false` com o motivo "Datas da reserva indisponíveis".

### 🟢-4 [Testes / dívida] Comentário velho, falha na virada da meia-noite e wiring sem teste
- `services/core-service/tests/account-bill.test.js:52` ainda diz "Datas distintas por reserva: os quartos não colidem no EXCLUDE". Agora todas as reservas usam a mesma data, e a ausência de colisão depende só de quarto novo por reserva. O comentário certo já está em `reservation-room-accounts.test.js:36-37`.
- **Falha na virada da meia-noite:** cerca de 20 testes usam `stayFromToday(1)` ou `nextDates(1)` (por exemplo, `checkin-room-status.test.js:56,73,77,90,106,125,144`, `room-release.test.js:34,87`, `account-payments.test.js:419…`). Se a suíte cruzar 03:00 UTC (00:00 em Brasília) entre o `POST /reservations` e o `PUT …/check-in`, a saída (D+1) vira "hoje" e o check-in dá 422. Em `outbox.test.js:153` e `reservations-status-filter.test.js:412`, o "hoje" é fixado no carregamento do módulo. A janela é de segundos, mas a falha é determinística se o CI rodar nesse horário. Correção barata: `stayFromToday` com padrão de 2 noites, ou check-in com entrada em `addDays(today,-1)`, que dá chegada atrasada e sobrevive à virada.
- `ReservationDetailPage.tsx:90` e `rows.tsx:159` (passar `r` para `reservationActions`) não têm teste de componente. Voltar a `reservationActions(r.status)` não quebra nada.
- Seed: todas as reservas PENDING/CONFIRMED de `seed/seed_hotels.sql:224-234,408-414` são de jul–nov/2026 e já venceram. Num ambiente semeado, nenhuma chegada pode receber check-in, e uma demo do fluxo exige criar a reserva antes.

## Repassados a outro dev
Nenhum. Os achados em arquivos vizinhos (`reservationsApi.ts`, `test_rotas.sh`, seed) são consequência direta da regra que esta branch introduziu e estão na área do Gabriel (reservas e painel), por isso ficaram no escopo.

## O que foi verificado e está correto
- **Único caminho para CHECKED_IN:** `grep CHECKED_IN app/` mostra que só `CheckInController.js:72` grava esse status. O webhook PIX (`PixWebhookController`) vai só a CONFIRMED. `SignContractController` cria CONFIRMED. `UpdateReservationController` bloqueia status. `ReleaseRoomController` só lê.
- **Ordem das checagens** (`CheckInController.js:36-45`): lock da reserva, depois status, depois datas, e só então pivot e lock dos quartos. A reserva vencida ou adiantada sai com rollback e não trava quarto.
- **Tenant isolation:** `findOne({ id, tenant_id })` e quartos com `tenant_id`, sem mudança.
- **Fuso:** `todayInHotel` usa `Intl` com `America/Sao_Paulo` e saída `en-CA` (`YYYY-MM-DD`). Conferido em UTC: `2026-11-16T02:59Z → 2026-11-15`. DATEONLY volta do Sequelize como string `YYYY-MM-DD`, e as colunas são `NOT NULL` com `CHECK (out > in)`, então a comparação lexicográfica é válida e não existe caso "cedo e vencida ao mesmo tempo".
- **Paridade backend × `@hotel/domain`:** os dois usam `today < in → TOO_EARLY` e `today >= out → EXPIRED`, na mesma ordem. Saída hoje é vencida nos dois. Chegada atrasada dentro do período fica aberta nos dois.
- **Front:** `todayISO()` usa `HOTEL_TZ`. O motivo do status tem precedência sobre o das datas (teste em `reservationLogic.test.ts`). `ActionSlot` mostra o motivo em texto e o liga por `aria-describedby`. O cancelar da reserva vencida continua habilitado no front, e no back (`CancelReservationController` não olha datas).
- **DRY:** `todayInBrazil` do `AsaasPixProvider` foi absorvido por `todayInHotel`, sem mudar comportamento.
- **Testes que trocaram datas fixas por relativas:** o EXCLUDE ainda é exercitado (`reservations.test.js` 409 e "período diferente" passam). O outbox continua conferindo as chaves e o formato das datas do payload (`...estadia` é `YYYY-MM-DD`). `moverParaAntesDeHoje` reproduz a saída atrasada real sem sobrepor a chegada (`[D-2,D)` contra `[D,D+2)`).
- **Execução:** rodei `checkin-room-status`, `reservations`, `outbox` e `room-release` no worktree (Postgres temporário): 4 arquivos, 61 passaram e 1 foi pulado (o skip já existia).
- **Proibições do projeto:** nenhum `require()`. Não há escrita nova em várias tabelas sem transação, rota nova ou `total_amount` vindo do cliente.

## Não foi possível verificar
- A suíte completa do core (1205) e as do front (`@hotel/domain` com 44, app-pms com 303, `tsc`) não foram re-executadas. Uso o relato do dev e rodei só os 4 arquivos mais afetados.
- A falha da virada da meia-noite (🟢-4) e o mascaramento de fuso (🟡-3) foram demonstrados por leitura e pela conta das datas, sem rodar com relógio simulado (`faketime`).
- O comportamento real de `useHotelToday` e do `REFRESH` com a tela aberta na virada do dia (🟡-2, 🟢-2) não foi testado no navegador.

---

## Desfecho (15/11/2026, sessão do Gabriel)

Corrigido no commit `b8f31d4`:
- 🟡-1: schema `CheckInError` no Swagger, com os dois codes, e api-client regerado.
- 🟡-2: o 422 da janela mostra a mensagem do servidor (`isCheckInWindowError`), com teste.
- 🟡-3: `tests/check-in-window.test.js`, com instante fixo (02:59Z e 03:00Z) e os limites da janela.
- 🟡-4: `test_rotas.sh` com datas a partir de hoje.
- 🟢-1 (parte): a saída de hoje diz "a saída é hoje".
- 🟢-2: o painel passa o seu `today` para a linha da chegada.
- 🟢-4 (parte): comentário de `account-bill.test.js`.

**Em aberto:**
- 🟡-5, hóspede de madrugada (reserva de 14 a 15/11 com chegada à 01:30 de 15/11): **decisão do Gabriel**.
- 🟢-1, botão de cancelar na linha da chegada vencida do painel: hoje a recepção cancela pelo detalhe da reserva.
- 🟢-3, reserva sem datas no front: o servidor barra.
- 🟢-4, restante: flakiness na virada das 03:00 UTC e falta de teste da ligação nos componentes. Registrados, sem dono.

Suítes depois das correções: core 60/60 arquivos (1215 testes), app-pms 305, @hotel/domain 44.
