# Retomada — `feature/t053-painel-hoje` (T-05.3, painel "Hoje", meta M4, prazo 10/11)

**Estado em 04/11/2026:** Research e Plan concluídos. **Nenhum código escrito.** Aguarda a aprovação
do Gabriel (RPI, `CLAUDE.md` §4) e as respostas da §4 deste arquivo.

- Worktree: `/home/gabri/wt-t053` · branch `feature/t053-painel-hoje` a partir de `origin/develop` em `cb04f85`
- Portas reservadas (livres em 03/11, conferidas com `ss -ltn`): **PG 5464 · backend 3053 · Vite 5253**
- Nenhum container subido nesta etapa

---

## 1. Research — as 5 perguntas do `CLAUDE.md` §4

### 1.1 O que já existe?

**Backend (`services/core-service`)**

| Endpoint | O que faz hoje | Serve ao painel? |
|---|---|---|
| `GET /reservations?from=&to=&page=&limit=` | Reservas que **se sobrepõem** a `[from, to]` (`check_in <= to AND check_out >= from`), com `guest`, `room` (só o principal) e `user`. Paginação opcional, `limit` máx. 100 | Em parte. **Não tem filtro por status**: com `from=to=hoje` vêm também CANCELLED e CHECKED_OUT; e o hóspede com saída **atrasada** (CHECKED_IN, `check_out < hoje`) fica fora |
| `PUT /reservations/:id/check-in` · `/check-out` | Transições dedicadas, com transação. Check-out manda o quarto para `CLEANING`, não bloqueia por saldo | Sim |
| `GET /reservations/:id/bill` | Conta com `balance_due` | Sim, sob demanda no check-out |
| `GET /rooms` | Todos os quartos do tenant, **sem filtro** | Não (seria baixar a coleção para filtrar `CLEANING`) |
| `PUT /rooms/:id` `{status:'AVAILABLE'}` | Libera `CLEANING → AVAILABLE` (validado por `isManualRoomTransitionAllowed`). **`requireRole('ADMIN')`** | Só para o gerente — ver decisão D-1 |
| `GET /analytics/occupancy?date=` | `total_rooms`, `occupied`, `available`, `cleaning`, `occupancy_rate` agregados no SQL | Sim, para o topo (RT-12) |
| `GET /analytics/alerts` | `no_show_risk` (CONFIRMED, `check_in_date = CURRENT_DATE`, sem nenhum PAID — D-3), `cleaning_pending` (quartos em `CLEANING`, já filtrados no servidor), `pending_too_long` (PENDING há > 48 h) | Sim (CA-c, f, g) |

**Frontend (`frontend/apps/pms/src`)**

- `features/reservations/` (T-05.2): `transitionReservation()` + `useTransitionReservation(id)` (trata 422 e invalida `reservations` e `rooms`), `reservationActions(status)` (allowlist do `@hotel/domain` + motivo), `ActionSlot` (ação desabilitada com motivo via `aria-describedby`, hoje **local** no `ReservationDetailPage`), `ReservationStatusBadge`, `getBill`/`useBill`, detalhe com `?aba=conta`, `primitives.tsx`.
- `features/rooms/` (T-05.1): `updateRoom(id, changes, number)`, `StatusBadge` generalizado (`tone` + `label`), `touch.ts`.
- `features/analytics/` (T-05.6): `useOccupancy(date)` com chave por usuário (`analyticsKeys`), sem `index.ts` de fachada.
- `@hotel/domain`: `todayISO()` (America/Sao_Paulo), `formatDateBR`, `formatDateTimeBR`, `addDaysISO`, `decimalToCents`/`formatBRL`.
- `@hotel/ui`: `Button` (`comfortable` ≥ 48 px), `StatusBadge`, `Card`, `Spinner`, `EmptyState`, `ErrorState`.
- `App.tsx`: rota `index` = `<Placeholder title="Hoje" />`. `AppShell`: barra inferior com **7 itens para o ADMIN** (Hoje, Reservas, Hóspedes, Quartos, Comanda, Indicadores, Usuários) — rótulos se encostam em 375 px.

### 1.2 Existe código similar para reaproveitar?

Sim — o painel é **composição** do que existe; quase nada é regra nova:
- Check-in/out: `useTransitionReservation` + `reservationActions` (sem duplicar a máquina de estados).
- Status: `ReservationStatusBadge` e `StatusBadge` (cor + rótulo, CA-05.1.c).
- Topo: `useOccupancy(todayISO())` — mesma chave de cache dos Indicadores.
- `ActionSlot` passa a ter **dois** usuários (detalhe e painel) → sobe para `features/reservations/components/ActionSlot.tsx` e sai pela fachada `index.ts` (regra do 2º uso, `packages/ui/CATALOGO.md`; continua no módulo, não vai para `packages/ui`).

### 1.3 Impacto nos outros módulos

- **Máquina de estados:** nenhuma regra nova. O painel só chama os endpoints dedicados.
- **Tenant:** o filtro novo entra no `where` que já começa por `tenant_id`; nenhuma query nova sem ele.
- **Transações:** o backend novo é só leitura; check-in/out já são transacionais.
- **H.3 (PR #109, aberto):** move `/analytics/*` para o analytics-service. Comparei os dois contratos no código (`origin/feature/analytics-cutover`, `a4d7355`):
  - `alerts.no_show_risk`: some `guest_phone`, entra `guest_id`, `amount` vira **string**;
  - `alerts.cleaning_pending`: mesmos campos; `cleaning_since` passa a vir do evento (mais correto);
  - `occupancy`: contagens e `occupancy_rate` iguais; `adr`/`revpar` viram string;
  - `revenue.unpaid` ganha `guest_id`, `paid`, `balance` — **o painel não usa `/revenue`**.
  - **Estratégia:** o painel consome só os campos estáveis nos dois contratos — `reservation_id` (no-show), `room_id`/`room_number`/`category`/`cleaning_since` (limpeza) e as quatro contagens + `occupancy_rate`. Nome, quarto e valor da chegada vêm da **lista de reservas do core**, nunca do alerta. Nada de `Number()` em `amount`. Assim o rebase sobre a H.3 + `pnpm gen:api` não quebra o typecheck.
  - **Arquivos:** a H.3 mexe em `features/analytics/{analyticsApi,kpis,shares,IndicatorsPage,…}`. O painel **não edita** esses arquivos; cria `features/today/todayApi.ts` (alerts) e um `features/analytics/index.ts` novo, só reexportando `useOccupancy` — arquivo que a H.3 não toca.
- **AppShell:** é do Gabriel (§5 do painel de andamento) — a mudança da barra inferior está no escopo desta tarefa por ser pendência herdada.

### 1.4 Documentação que define o comportamento

`SPEC-05` T-05.3 (CA-05.3.a a g); `REQUISITOS_TELAS_PMS_09set2026.md` RT-08 a RT-13; `DESIGN_PMS.md` §1 (picos de check-out 7–11 h e check-in 14–18 h), §2 (densidade), §5 (cor + rótulo; **check-out pede confirmação**; data é dia; alvo ≥ 48 px); `CLAUDE.md` §3 (máquinas de estado: liberação é "manual pelo admin"); catálogo de eventos §9.1 D-3 refinada; `FERRAMENTAL.md` (controller tocado ⇒ `/security-review` obrigatório; ordem Impeccable: comportamento → audit → critique → polish).

### 1.5 O que os outros devs já fizeram na área

T-05.1 (quartos, Gabriel/agente), T-05.2 (reservas, `cb04f85`), T-05.6 (indicadores, Weslley) e H.3 (analytics, em PR). O `ListReservationController` ganhou `from/to` e paginação na Fatia 0; ninguém mais mexe nele agora.

### 1.6 Conclusão: dá para montar o painel sem baixar coleções inteiras?

**Quase.** Quartos em limpeza, contagens e no-show já vêm filtrados/agregados do servidor. Faltam
**filtros de status em `GET /reservations`**. Sem eles, "hóspedes na casa" ou perde a saída atrasada,
ou exige baixar reservas fora da janela. → **subtarefa de backend com TDD (Fatia B abaixo).**

---

## 2. Plan

### 2.1 Desenho das consultas (todas por `tenant_id` do JWT)

| # | Chamada | Para quê | Limite natural |
|---|---|---|---|
| Q1 | `GET /reservations?status=CHECKED_IN&limit=100` | Hóspedes na casa **e** saídas do dia (`check_out_date <= hoje` → "saída hoje" / "saída atrasada") | nº de quartos |
| Q2 | `GET /reservations?from=HOJE&to=HOJE&status=PENDING,CONFIRMED&limit=100` | Chegadas do dia (`check_in_date = hoje`) e chegadas **em atraso** (`check_in < hoje`, ainda não chegou) | nº de quartos |
| Q3 | `GET /analytics/alerts` | `no_show_risk` (ids) e `cleaning_pending` | servidor já filtra |
| Q4 | `GET /analytics/occupancy?date=HOJE` | Topo: ocupados, livres, em limpeza, ocupação % | 1 linha |
| Q5 (sob demanda) | `GET /reservations/:id/bill` | Saldo na confirmação do check-out | 1 reserva |

`HOJE = todayISO()` do `@hotel/domain` (America/Sao_Paulo). A partição em blocos é feita no cliente
**sobre conjuntos já recortados pelo servidor** (≤ capacidade do hotel), não sobre a coleção.
Se `total > limit` (não acontece em hotel pequeno), o bloco avisa "mostrando 100 de N — ver em Reservas" em vez de esconder.

### 2.2 Critérios de aceite (mapeados aos CAs)

- [ ] **CA-05.3.a — chegadas, saídas e na casa.** Três blocos: **Chegadas** (Q2 com `check_in = hoje`, mais "atrasadas" destacadas), **Saídas** (Q1 com `check_out <= hoje`; atrasada com rótulo "Saída atrasada"), **Na casa** (Q1 inteiro). Cada linha: hóspede, quarto principal (+N extras quando houver — ver D-5), noites, `ReservationStatusBadge`, link para o detalhe.
- [ ] **CA-05.3.b — ação direta na lista.** Chegada: botão **Check-in** (`useTransitionReservation`; habilitação por `reservationActions`; desabilitado com motivo, nunca some). Saída: botão **Check-out** abre confirmação inline que busca Q5 e mostra o saldo devido (`formatBRL(decimalToCents(...))`); saldo > 0 mostra aviso e link "Abrir conta" (`/reservas/:id?aba=conta`); confirmar executa o check-out sem sair do painel (RT-09 + DESIGN_PMS §5). Ver D-2.
- [ ] **CA-05.3.c — alertas.** Bloco "Atenção" com: risco de no-show (contagem + linha marcada na chegada), quartos em limpeza (Q3) e reservas PENDING há > 48 h (contagem com link para Reservas). Falha só de Q3 não derruba o painel: o bloco mostra o próprio erro com "Tentar de novo".
- [ ] **CA-05.3.d — celular.** Mobile-first em 375×812: blocos empilhados na ordem do pico (antes das 12 h: Saídas primeiro; depois: Chegadas primeiro — ver D-4), contagens no topo visíveis sem rolar, ações na largura da linha, alvo ≥ 48 px medido, sem scroll horizontal. **Barra inferior:** no máx. 5 itens; o resto em "Mais" (ver D-3).
- [ ] **CA-05.3.e — contagens.** Cada bloco com contagem no título (`Chegadas · 4`). Topo com **Ocupados**, **Livres**, **Em limpeza** e **Ocupação %** (Q4) + **Vendidos hoje** = ocupados + chegadas ainda por fazer (definição em D-6).
- [ ] **CA-05.3.f — no-show.** Chegada cujo `id` está em `no_show_risk` ganha selo **"Sem pagamento — risco de no-show"** (cor + rótulo + ícone, não só cor) e sobe para o topo do bloco. Cruzar pelo id evita alerta velho (reserva já com check-in não aparece em Q2).
- [ ] **CA-05.3.g — limpeza.** Bloco **Em limpeza** com quarto, categoria e "desde" (`formatDateTimeBR`), e ação **Liberar quarto** (`updateRoom(id, {status:'AVAILABLE'})` ou endpoint novo, conforme D-1). Recepção sem permissão vê a ação desabilitada com motivo.
- [ ] **Transversais:** os 4 estados por bloco (carregando com `Spinner` rotulado, vazio com o próximo passo — "Nenhuma chegada hoje" + "Nova reserva" —, erro com `ErrorState`, dados); cor + rótulo em todo status; sem `Number()`/`parseFloat` em dinheiro; sem `as unknown as`; `api-client` só regenerado.

### 2.3 Cenários de erro

| Cenário | Comportamento |
|---|---|
| Q1/Q2 falham (5xx/rede) | Bloco afetado em `ErrorState` com "Tentar de novo"; os outros continuam |
| Q3 (alerts) ou Q4 (occupancy) falham | Bloco "Atenção"/topo em erro; chegadas e saídas seguem — o balcão não para por causa do analytics (importante depois da H.3: serviço separado, pode estar fora) |
| 401 | Fluxo atual do `http.ts` (volta ao login) |
| 403 em `/analytics/*` ou `PUT /rooms` | Mensagem de permissão; nunca tela branca |
| 422 no check-in/out | Mensagem do `transitionReservation` ("mudou em outro atendimento"), invalidação e recarga do bloco |
| 409/422 na liberação do quarto | "O quarto mudou de situação" + recarga (`ROOM_STATUS_TRANSITION_NOT_ALLOWED`) |
| 404 (reserva/quarto excluído) | Mensagem e recarga da lista |
| `GET /reservations?status=FOO` | Backend devolve **400** (allowlist) |
| Virada do dia com a tela aberta | `todayISO()` recalculado no foco/refetch; chave de query inclui a data |

### 2.4 O que NÃO pode mudar

- Contrato atual de `GET /reservations` **sem** `status`: mesmo resultado (array puro ou `{data,total,page,limit}`) — a T-05.2 e o rack dependem dele.
- `useTransitionReservation`, `reservationActions` e o fluxo do detalhe da T-05.2 (só o `ActionSlot` muda de arquivo, mesma API).
- Arquivos de `features/analytics/` que a H.3 altera; `/analytics/*` no core (está saindo na H.3).
- Ordem dos itens da sidebar do desktop e as rotas existentes; os papéis em `nav.ts` (fonte do `RequireRole`).
- `packages/api-client`: só via `pnpm gen:api`.

### 2.5 Arquivos a criar

| Arquivo | Propósito |
|---|---|
| `services/core-service/tests/reservations-status-filter.test.js` | RED/GREEN do filtro `status` (allowlist, 400, tenant, combinação com `from/to` e paginação, contrato sem `status` intacto) |
| `frontend/apps/pms/src/features/today/TodayPage.tsx` | Página; compõe os blocos |
| `features/today/todayApi.ts` | `getAlerts()` tipado pelo `paths` gerado; leitura só dos campos estáveis |
| `features/today/queries.ts` | `useInHouse`, `useArrivals`, `useAlerts` (chaves com usuário + data; invalidadas por `reservations`/`rooms`) |
| `features/today/todayLogic.ts` + `todayLogic.test.ts` | Funções puras: partição em chegadas/atrasadas/saídas/atrasadas/na casa, ordenação (no-show primeiro), "vendidos hoje", ordem dos blocos por horário |
| `features/today/components/{Block,ArrivalRow,DepartureRow,InHouseRow,CleaningRow,CheckOutConfirm,TodayCounters}.tsx` | Blocos e linhas (locais ao módulo) |
| `features/today/index.ts` | Fachada (`TodayPage`) |
| `features/analytics/index.ts` | Fachada nova: reexporta `useOccupancy`/`analyticsKeys` (não altera arquivo da H.3) |
| `features/reservations/components/ActionSlot.tsx` | `ActionSlot` extraído do detalhe (2º uso) |
| `frontend/apps/pms/src/routes/nav.test.ts` | Prende a regra da barra inferior (≤ 5 itens + "Mais") |
| `docs/historico_sessao/gabriel/t053_painel_hoje_<ddmmaaaa>.md` | Relatório |
| `docs/qa/redteam_t053-painel-hoje_<ddmmaaaa>.md` | Parecer do qa-redteam (escrito pelo auditor) |

### 2.6 Arquivos a modificar

| Arquivo | O que muda |
|---|---|
| `services/core-service/app/Controllers/ReservationApi/ListReservationController.js` | `?status=A,B` com allowlist de `RESERVATION_STATUSES`; inválido → 400; ausente → contrato atual |
| `services/core-service/config/swagger.js` | Só o parâmetro `status` em `GET /reservations` |
| (D-1, se aprovado) `routes/apis/roomRouter.js` + `app/Controllers/RoomApi/ReleaseRoomController.js` (novo) + teste | `PUT /rooms/:id/release` só `CLEANING → AVAILABLE`, ADMIN e RECEPTIONIST, com lock |
| `frontend/packages/api-client/{openapi.json,src/schema.d.ts}` | **Regenerados** por `pnpm gen:api` |
| `features/reservations/reservationsApi.ts` | `ReservationListParams` aceita `status?` e `from/to` opcionais (sem quebrar a lista) |
| `features/reservations/ReservationDetailPage.tsx` | Importa o `ActionSlot` extraído (sem mudança visual) |
| `features/reservations/index.ts` | Exporta `ActionSlot`, `useTransitionReservation`, `reservationActions`, `useBill` |
| `features/rooms/index.ts` | Exporta `updateRoom` (ou o hook de liberação) |
| `frontend/apps/pms/src/App.tsx` | Rota `index` → `<TodayPage />` (só essa linha) |
| `frontend/apps/pms/src/routes/nav.ts` | Marca quais itens vão na barra inferior (`primary`) |
| `frontend/apps/pms/src/components/AppShell.tsx` | Barra inferior com ≤ 5 itens + "Mais" (folha com o restante) |
| `docs/specs/SPEC-05-frontend-pms.md` | Marca CA-05.3.a–g com evidência |
| `docs/PAINEL_DE_ANDAMENTO_MVP.md` | §3 (frente e portas 5464/3053/5253) e §4 |

### 2.7 Ordem de execução (e por quê)

1. **Fatia B — backend com TDD** (RED → GREEN no PG 5464): o frontend depende do contrato; regenerar o `api-client` uma vez só. Inclui D-1 se aprovado. `/security-review` no diff do controller.
2. **`pnpm gen:api`** e typecheck — confirma que a T-05.2 continua compilando.
3. **Lógica pura** `todayLogic.ts` com testes (Vitest) — partição, ordenação, contagens, virada do dia.
4. **API e queries** do módulo `today` + fachadas (`analytics/index.ts`, extração do `ActionSlot`).
5. **Blocos e página**, com os 4 estados; troca do Placeholder.
6. **Barra inferior** do AppShell (pendência herdada) + `nav.test.ts`.
7. **Verificação** (§2.9) → Impeccable `audit` → `critique` → `polish` + `emil-design-eng` → correções.
8. **qa-redteam** → correções (delta, se REPROVADO) → SPEC, painel de andamento, relatório, push.

### 2.8 Branch e commits planejados

Branch: `feature/t053-painel-hoje` (já criada). Commit e push a cada passo.

1. `test(reservations): RED do filtro por status na listagem`
2. `feat(reservations): filtro status na listagem com allowlist`
3. *(D-1)* `test(rooms): RED da liberação de quarto em limpeza` · `feat(rooms): PUT /rooms/:id/release para recepção e admin`
4. `chore(api-client): regenera o cliente com o filtro de status`
5. `refactor(reservations): ActionSlot sobe para components e sai pela fachada`
6. `test(today): regras de partição e contagem do painel`
7. `feat(today): painel Hoje com chegadas, saídas, na casa, limpeza e alertas`
8. `feat(shell): barra inferior com cinco itens e menu Mais no celular`
9. `fix(today): achados da revisão Impeccable e emil-design-eng`
10. `docs(qa): parecer do qa-redteam da T-05.3` · `fix(today): achados do qa-redteam` (se houver)
11. `docs(t053): relatório, SPEC-05 marcada e painel de andamento`

Todos com corpo (o quê + porquê) e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `git add .`/`-A`. Sem PR (o Gabriel decide).

### 2.9 Verificação

- **Backend:** suíte completa do core verde no PG 5464 (`.env.test` com `POSTGRES_PORT=5464`), cobertura ≥ 60%; `bash scripts/qa_checks.sh` limpo; `/security-review` no diff.
- **Frontend:** `pnpm -C frontend typecheck`, `test` e `build` limpos; regra 9 (9a/9b/9c) do `qa_checks`.
- **Navegador (Playwright), backend 3053 + Vite 5253, seed do tenant de demonstração** com cenário preparado: 1 chegada CONFIRMED sem pagamento (no-show), 1 chegada com PAID, 1 chegada atrasada, 1 saída hoje, 1 saída atrasada, 2 na casa, 1 quarto em CLEANING.
  - **1366×900 e 375×812**, como ADMIN e como RECEPTIONIST;
  - fluxo: check-in da lista → linha sai de Chegadas e entra em Na casa; check-out com saldo → aviso + confirmação → quarto aparece em Em limpeza → Liberar → contagem de Livres sobe;
  - 4 estados forçados por interceptação (`route.fulfill` com atraso, `[]`, 500) em cada bloco, inclusive **só o `/analytics/alerts` em 500**;
  - medição de todo alvo interativo ≥ 48 px em 375×812, sem scroll horizontal, barra inferior sem rótulo encostado;
  - zero erro de console; nenhuma requisição a `/rooms` sem filtro nem a `/reservations` sem `status`/janela (conferido no log de rede).
- **Revisão de design:** Impeccable `audit → critique → polish` + `emil-design-eng` (DESIGN_PMS prevalece em conflito).
- **qa-redteam** no fim, relatório em `docs/qa/`.
- Containers derrubados no fim de cada sessão (`docker rm -f pg-t053`).

### 2.10 Riscos para o prazo de 10/11

| Risco | Prob. | Mitigação |
|---|---|---|
| H.3 (PR #109) entra no meio: conflito no `api-client` gerado | Alta | Só regenerar, nunca resolver à mão; painel usa só campos estáveis; rebase + `pnpm gen:api` + typecheck é o teste |
| `CURRENT_DATE` do `/analytics/alerts` é UTC: entre 21 h e 0 h (BRT) o no-show olha **amanhã** | Certa (21–24 h) | Cruzar por id com Q2 (de dia BRT) faz o erro sumir em silêncio, sem selo falso. Correção (`?date=` ou TZ) é do analytics → **repasse para a H.3**, não mexer em `/analytics` aqui |
| No-show só considera CONFIRMED; reserva de balcão (PENDING) sem pagamento não aparece | Média | Decisão D-7 |
| Liberação de quarto exige ADMIN | Certa | Decisão D-1 |
| Reserva multi-quarto: a lista só traz o quarto principal | Média | D-5; mitigação mínima "+N quartos" exige o include no backend |
| Estimativa ~2 dias vira 3–4 com backend, barra inferior e QA | Média | Prioridade de corte: (1) a–c, e–g; (2) barra inferior; (3) ordem dos blocos por horário; (4) "Mais" refinado |
| Banco de teste compartilhado sabotando a suíte | Baixa | PG próprio na 5464 |

---

## 3. Fatia de backend — detalhe do TDD

`GET /reservations?status=PENDING,CONFIRMED`
- Testes RED: (a) filtra por um status; (b) por lista separada por vírgula; (c) `status=FOO` ou vazio → 400 com a lista permitida; (d) combina com `from/to` e com `page/limit` (`total` coerente); (e) **outro tenant** com a mesma situação não vaza; (f) sem `status` o resultado é idêntico ao de hoje (array puro); (g) reserva *paranoid* excluída não volta.
- Implementação: `where.status = { [Op.in]: lista }` com allowlist importada da mesma constante que o model/state machine já usam (fail-safe, não blocklist).

---

## 4. Decisões que só o Gabriel pode tomar

- **D-1 — Quem libera o quarto (`CLEANING → AVAILABLE`)?** Hoje `PUT /rooms/:id` é só ADMIN, e o `CLAUDE.md` §3 diz "manual pelo admin".
  - (a) Mantém: o gerente (ADMIN, celular) libera; a recepção vê o botão desabilitado com motivo. Zero backend.
  - (b) **Recomendado:** endpoint dedicado `PUT /rooms/:id/release`, só essa transição, para ADMIN e RECEPTIONIST, com TDD. Fica no padrão "endpoint dedicado para máquina de estado" e não abre o PUT genérico. Custa ~meio dia.
- **D-2 — Check-out na lista:** confirmação inline com o saldo (busca a conta na hora, recomendado — cumpre RT-09 e o "irreversível pede confirmação") ou só um atalho para `/reservas/:id?aba=conta` (mais simples, mas abre o detalhe)?
- **D-3 — Barra inferior do celular:** quais 4 itens + "Mais"? Proposta: **Hoje · Reservas · Hóspedes · Comanda · Mais** (Quartos, Indicadores, Usuários no "Mais"). Para a recepção (5 itens) não aparece "Mais".
- **D-4 — Ordem dos blocos muda com o horário** (Saídas primeiro até 12 h, Chegadas depois), ou ordem fixa? Recomendo mudar — segue os picos do DESIGN_PMS §1 —, mas é comportamento que o usuário precisa achar previsível.
- **D-5 — Reserva com vários quartos:** mostrar "+N quartos" exige incluir `reservation_rooms` na listagem (mais backend). Aceita mostrar só o principal no M4 e registrar como pendência?
- **D-6 — Definição de "vendidos hoje":** ocupados agora + chegadas de hoje ainda não feitas (recomendado, sem backend) ou outra?
- **D-7 — No-show e reservas PENDING:** a D-3 refinada só olha CONFIRMED. Chegada de hoje em PENDING sem pagamento também ganha o selo de risco? Se sim, é mudança de regra no analytics (H.3) — ou o painel marca PENDING de hoje apenas como "Pendente de confirmação".
- **D-8 — Bug de fuso no `/analytics/alerts` (`CURRENT_DATE` em UTC):** aceita como repasse para a H.3 (recomendado) em vez de corrigir nesta branch?
- **D-9 — Saída atrasada** (CHECKED_IN com saída já vencida) entra no bloco Saídas com rótulo próprio — confirma que é desejado?
