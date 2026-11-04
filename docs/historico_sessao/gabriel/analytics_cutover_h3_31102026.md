### 2026-10-31 — Gabriel (IA orquestrada: Claude Opus 5.5)

- **Branch:** `feature/analytics-cutover` (a partir de `origin/develop@fbe086d`, depois do PR #105), worktree `/home/gabri/wt-h3`
- **Objetivo da sessão:** Etapa H.3 da T-01.4: cutover do analytics-service (CA-01.4.k, n, o, p, q). Meta M7-b: 14/11
- **Delegação:** `docs/PAINEL_DE_ANDAMENTO_MVP.md` §8.1 e `docs/delegacoes/rodada3_gabriel_04out2026.md`, etapa H
- **Contrato:** catálogo de eventos v1.1.5, sem alteração (nenhum evento muda)
- **Ambiente de teste:** `pg-h3` (5462) e `rmq-h3` (5698, `--user rabbitmq`, topologia do `infra/k8s/rabbitmq-setup.sh`);
  compose local `-p h3` (nginx em 8093, backend em 3054, override fora do repo para liberar a 15672). Tudo derrubado no fim.
- **PR:** não aberto. O Gabriel roda o qa-redteam e abre.

#### O que foi feito

| Entrega | Onde | CA |
|---|---|---|
| As 7 consultas sobre as projeções: `tenant_id` do JWT em toda tabela, inclusive nos JOINs; mesmas permissões do core (ADMIN e RECEPTIONIST, top-guests só ADMIN); dinheiro em `numeric(14,2)` até a resposta (string); D-1; D-3 refinada; 400 para data, months e limit inválidos | `services/analytics-service/app/Controllers/AnalyticsApi/`, `app/utils/queryParams.js`, `app/utils/select.js`, `routes/router.js` | k |
| O core deixa de responder os 7 indicadores (404); só `/analytics/internal-consumption` fica (L-1); 7 controllers e entradas do swagger removidos | `services/core-service/routes/apis/analyticsRouter.js`, `config/swagger.js` | o |
| `tests/analytics.test.js` contra o novo serviço: sobe o analytics (processo e banco `gesway_analytics_pipeline_test` próprios), publica o outbox no RabbitMQ real e espera `processed_events` alcançar o outbox antes de cada leitura | `services/core-service/tests/analytics.test.js`, `tests/helpers/analyticsPipeline.js`, `.env.test.example` | p |
| OpenAPI das 7 rotas no analytics; `dump-openapi.mjs` junta os dois specs (falha se um caminho estiver nos dois); api-client regenerado | `services/analytics-service/config/openapi.js`, `frontend/packages/api-client/` | — |
| Tela /indicadores aceita a string DECIMAL (kpis, shares, ShareTable; receita por mês em centavos antes da barra) | `frontend/apps/pms/src/features/analytics/` | — |
| nginx: `upstream analytics_pool` + `location /analytics/` → analytics; `location /analytics/internal-consumption` → core. Feito nas duas cópias (regra 10) | `docker/nginx/default.conf`, `infra/k8s/nginx.yaml` | o |
| Compose: o nginx espera o analytics iniciado | `docker-compose.yml` | o |
| k8s: Deployment e Service do analytics, StatefulSet + PVC + Service do banco próprio, secret `analytics-db` gerado por ambiente (fora do repo), NetworkPolicy, build da imagem no `infra_up.sh` | `infra/k8s/analytics.yaml`, `networkpolicy.yaml`, `kustomization.yaml`, `scripts/k8s_garantir_secret_analytics.sh`, `scripts/infra_up.sh`, `start.sh`, `docs/infra/KUBERNETES.md` | n |
| qa_checks: regra 4 olha o router do analytics; nova 7b avisa rota de /analytics sem OpenAPI (pendência 9 da H.2) | `scripts/qa_checks.sh` | — |

#### Rotas

| Caminho público (não mudou) | Quem responde agora |
|---|---|
| `/analytics/revenue`, `/occupancy`, `/alerts`, `/seasonality`, `/revenue-by-category`, `/payment-mix`, `/top-guests` | **analytics-service** (core: 404) |
| `/analytics/internal-consumption` | **core** (depende da decisão L-1) |
| `/analytics/health` (saúde autenticada da H.2) | analytics-service, agora também pelo nginx (exige token ADMIN/RECEPTIONIST) |

#### Asserções alteradas (CA-01.4.p) e o motivo de cada uma

| Arquivo / caso | Antes | Agora | Decisão |
|---|---|---|---|
| `analytics.test.js`: occupancy | só a presença de adr e revpar | também `adr`/`revpar` em string `^\d+\.\d{2}$` (asserção acrescentada) | catálogo §9.1: dinheiro em NUMERIC, sem `::float` |
| receita/mix com estorno (veio de `payment-void.test.js`, CA-06.13.f) | `realized.total` 300; soma de `by_month` 300; mix `total: 300` | `'300.00'`; `by_month` = `[{ total: '300.00' }]`; mix `total: '300.00'` (`pct: 100` segue número) | catálogo §9.1 |
| "único pagamento anulado volta a aparecer" (CA-06.13.f) | mesma asserção | mesma asserção, lida do analytics. Fica a nota: em aberto agora é saldo > 0, e por isso a reserva paga por inteiro não aparece | D-3 |
| caso novo: sinal parcial | (no core a reserva saía da lista) | continua em `unpaid`, com `amount '500.00'`, `paid '150.00'`, `balance '350.00'` | D-3 refinada |
| no-show (veio de `payment-void.test.js`, 🟢-2): 3 casos | mesmas asserções | mesmas asserções; no "sem pagamento" entram também *sem `guest_phone`* e *com `guest_id`* | D-1 |
| `payment-void.test.js` 🟡-1 | `realized.total` 200 depois dos PUT inválidos | `status` continua PAID (o `paid_at` intacto já era conferido) | a receita realizada é "PAID com paid_at", agora calculada no analytics. As duas condições são conferidas direto |
| `backend-prep.test.js`, `waiter-least-privilege.test.js` | WAITER → 403 em `/analytics/revenue` no core | WAITER → 403 em `/analytics/internal-consumption`, que ficou no core | a rota saiu do core (CA-01.4.o). O mesmo 403 nos 7 indicadores fica coberto no analytics (`analytics-queries.test.js`) |
| caso novo: "o core não responde mais" | — | os 7 dão 404 no core; internal-consumption dá 200 | CA-01.4.o |

Os demais casos (7 endpoints 200, KPIs, 401, RT-51, sem e-mail, isolamento entre hotéis) continuam com a mesma asserção.

#### Verificação (saída real)

- **analytics** (`npx vitest run --coverage`, com RabbitMQ real): `Test Files 9 passed (9)` · `Tests 162 passed (162)` · Statements **96.58%**, Branches 92.49%, Functions 90.72%, Lines 96.52%
- **core** (`npx vitest run --coverage`, com o pipeline): `Test Files 52 passed (52)` · `Tests 1126 passed | 1 skipped (1127)` · Statements **86.05%**, Branches 82.75%, Functions 90.36%, Lines 87.92%. O pulado é o mesmo de antes (cancelamento de CONFIRMED)
- **frontend**: `apps/pms` com `Test Files 8 passed (8)` e `Tests 103 passed (103)`; `pnpm -r typecheck` sem erro
- **qa_checks**: `⚠ 3 aviso(s). Nenhum erro bloqueante.`, os mesmos 3 da develop
- **nginx/k8s**: `nginx -t` passou; `kubectl kustomize infra/k8s` renderizou 49 objetos. Não houve `apply` em cluster
- **Compose real pelo nginx (8093)**, logado como `admin@aurora.example` do seed: os 7 indicadores deram 200, com dinheiro em string; `internal-consumption` deu 200, vindo do core; o core direto (3054) respondeu `404 Cannot GET /analytics/revenue`
- **Playwright** (vite → nginx → serviços, `admin@aurora.example`):
  - desktop 1366×900: os 4 KPIs aparecem, nenhum bloco com erro, nenhum NaN/undefined, sem rolagem horizontal. As 7 chamadas `/api/analytics/*` deram 200, sem erro de console
  - 375×812: os 4 KPIs, 2 chamadas (occupancy e revenue) com 200, sem rolagem horizontal, sem erro de console

#### Decisões tomadas (precisam do aval do Gabriel)

1. **Contrato de resposta:** dinheiro é string com 2 casas. `occupancy_rate`, `pct`, `avg_nights` e `hours_pending` continuam número, porque não são dinheiro. `revenue.unpaid` ganha `guest_id`, `paid` e `balance`; os alertas ganham `guest_id` (D-1: abrir a ficha no core).
2. **RevPAR** = `ADR × ocupados / total`, com um único arredondamento. No core era `ADR × taxa já arredondada`. **Ticket médio** agora é arredondado para centavo.
3. **LEFT JOIN** em hóspede e categoria: os eventos chegam em qualquer ordem, então `guest`/`category` podem vir `null` por um instante, mas a linha não some.
4. **Validação:** data, months e limit inválidos → 400 (no core, data inválida virava 500). Período só com uma ponta continua ignorado, como no core.
5. **OpenAPI por serviço:** cada serviço documenta as próprias rotas, e o dump junta os dois num só cliente.
6. **k8s:** banco do analytics em StatefulSet próprio. A senha fica num secret `analytics-db` fora do repositório, aleatória por ambiente, porque um valor novo no `secret.yaml` seria segredo no diff. Uma réplica no MVP.
7. **CI sem broker:** o bloco do pipeline em `analytics.test.js` é pulado sem `RABBITMQ_HOST`; o bloco "o core não responde mais" roda sempre.

#### Commits gerados

| Hash | Mensagem |
|------|----------|
| `78db6a8` | `feat(analytics): as 7 consultas de indicadores sobre as projeções` |
| `be9f8a0` | `docs(analytics): retomada da H.3 (cutover do analytics)` |
| `6dc4763` | `feat(core)!: o core deixa de responder os 7 indicadores de /analytics` |
| `bfc5385` | `feat(analytics): OpenAPI das 7 rotas e cliente do frontend com dinheiro em string` |
| `35ae156` | `feat(infra): nginx roteia /analytics/ para o analytics-service e Deployment k8s` |
| (último) | `docs(spec): CA-01.4.k, n, o, p, q entregues na H.3 e relatório` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | **Decisão L-1**: `/analytics/internal-consumption` | 🟡 Média | Fica no core, com o nginx roteando o caminho específico. Se virar evento `account*.*`, a rota migra e o `location` do nginx sai |
| 2 | **[revisão do Weslley]** nginx (2 cópias), compose, `infra/k8s/analytics.yaml`, NetworkPolicy, `infra_up.sh`/`start.sh` | 🟡 Média | Falta `./start.sh up` num minikube/kind: só houve render (`kubectl kustomize`) |
| 3 | CI do core com RabbitMQ (Weslley, T-01.5) | 🟡 Média | Sem broker, o bloco do pipeline do `analytics.test.js` é pulado. Precisa de `services: rabbitmq` + `rabbitmq-setup.sh` + `npm ci` no analytics |
| 4 | Atraso de consumo como métrica (CA-01.4.f) | 🟡 Média | Continua aberto (histograma no consumidor) |
| 5 | `internal-consumption` devolve `total` em float | 🟢 Baixa | Fora do escopo (rota do core, T-04.7). Alinhar ao NUMERIC quando a L-1 for decidida |
| 6 | Card de alerta com link para a ficha (`guest_id`) | 🟢 Baixa | O frontend não consome `/analytics/alerts` hoje. Quando consumir, usar o `guest_id` (D-1) |
| 7 | Barra de navegação inferior no celular | 🟢 Baixa | Observada no passeio: os 6 rótulos ficam colados em 375 px. É da T-05.x, não desta etapa |

---

### 2026-11-02 a 04 — correções do qa-redteam e merge da develop

Relatório do qa-redteam: `docs/qa/redteam_analytics-cutover-h3_02112026.md` (APROVADO COM RESSALVAS, 0 🔴, 4 🟡, 6 🟢).

| Achado | O que foi feito | Commit |
|---|---|---|
| 🟡-1 testes não pegavam regressão de tenant | Hotel vizinho com categoria, quartos, hóspede, reserva e pagamento reais + 6 referências cruzadas forjadas; totais exatos nas 7 rotas. Mutações M4, M5, M8, M9, M10, M15, M16 (cada filtro separado), M17 e M18 rodadas uma a uma: todas morrem. O código já estava certo (sem commit de GREEN) | `8156322` |
| 🟢-1 RevPAR | 1000,00 em 3 noites, 1 de 3 quartos: ADR 333.33, RevPAR 111.11 (M24 dá 111.10 e morre) | `8156322` |
| 🟡-4 readiness | `/health`: banco fora → 503 `DOWN`; consumidor parado → 200 `DEGRADED` com o campo `consumer`. RED `6be55cb` (4 falhas), GREEN `15d37ce`. O helper do pipeline do core passou a esperar `consumer === 'consuming'` | `6be55cb`, `15d37ce` |
| 🟡-3 nginx | `resolver` + `set $analytics_upstream` + `proxy_pass` com variável (compose: 127.0.0.11; k8s: kube-dns e FQDN). Prova com backends de eco: 14 caminhos iguais antes e depois; analytics parado → config antiga sai com `[emerg] host not found`, a nova sobe e dá 502 só em `/analytics/*`. Regra 10 do qa_checks aceita só as linhas de DNS marcadas | `a4d7355` |
| 🟢-2 contrato | As 4 mudanças declaradas no CA-01.4.k da SPEC e na retomada | `6b470c1` |
| 🟡-2 CI | Do Weslley; a H.3 depende do merge da `feature/ci-analytics-service` (retomada) | — |

Pendências novas: 🟢-3 (datas em UTC), 🟢-4 (listas sem limite), 🟢-5 (INNER JOIN em revenue-by-category), 🟢-6
(prefixo do internal-consumption) — na retomada. [revisão do Weslley] nginx, regra 10 e readiness.

Nota de ambiente: duas rodadas do analytics falharam em 4 testes de tempo do `rabbitmq.integration` (DLQ/backoff);
um `timeout` sem `-k` deixou um vitest órfão consumindo a mesma fila. Com `timeout -k`, a rodada limpa passou 172/172.

**Merge da develop (04/11)** — `origin/develop@3e68e7f` (#106 T-05.1, #107, #108 T-05.2 com `GET /guests?q=`): sem
conflito textual. `openapi.json`/`schema.d.ts` regenerados com `pnpm gen:api` (49 paths), idênticos ao merge automático.

**🟢 do qa-redteam (04/11, aprovados pelo Gabriel)** — RED e GREEN em commits separados:

| Achado | O que foi feito | Commits |
|---|---|---|
| 🟢-3 dia em UTC | `app/utils/hotelTimezone.js` com a mesma constante do core (`HOTEL_TIMEZONE`, D-68). "Hoje" calculado no processo (Intl) para occupancy, no-show e seasonality; `(paid_at AT TIME ZONE :timezone)::date` em revenue e payment-mix. Testes com relógio fixo em 22h30 de Brasília. Resolve o repasse D-8 da T-05.3 | `8601c3c`, `cf087c1` |
| 🟢-4 listas sem teto | `?limit=` (padrão 50, máximo 100, como o `ListReservationController` do core; inválido → 400) em `revenue.unpaid` e nas 3 listas de alertas; `unpaid_total` e `totals` por `COUNT(*) OVER ()` | `50afa89`, `255f68b` |
| 🟢-5 reserva sumia da receita por categoria | LEFT JOIN em quarto e categoria (tenant nos dois ON), agrupado por `category_id`; linha "Sem categoria" com null. Mutações M16 `r`/`rm`/`rc` rodadas contra o código commitado: 2, 1 e 1 falhas | `5502ca3`, `c2d2608` |
| 🟢-6 prefixo do internal-consumption | `location = /analytics/internal-consumption` no compose e no k8s. `scripts/verificar_rotas_analytics_nginx.sh` (backends simulados) passou de 3 divergências para 13/13 | `d4710ac`, `e39737d` |

Verificação final (04/11, depois dos 🟢 e do merge): analytics `Test Files 9 passed (9)` · `Tests 182 passed (182)` ·
96.73% stmts (RabbitMQ real); core `Test Files 53 passed (53)` · `Tests 1135 passed | 1 skipped (1136)` · 86.16% stmts;
frontend typecheck sem erro, 238 testes (38 + 200), build OK; qa_checks `⚠ 3 aviso(s). Nenhum erro bloqueante.`;
`kubectl kustomize infra/k8s` 49 objetos; `scripts/verificar_rotas_analytics_nginx.sh` 13/13.
