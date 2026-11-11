# Repasse para a H.3 (trilha Gabriel) — 04/11/2026

Origem: T-05.3 (painel "Hoje"), decisão **D-8** do Gabriel de 04/11/2026 — o defeito abaixo **não**
é corrigido na `feature/t053-painel-hoje`, porque o `/analytics/*` está sendo movido para o
analytics-service no PR #109 (H.3) e qualquer mudança no core seria descartada no cutover.

---

### 🟡 [Analytics / data] `/analytics/alerts` usa `CURRENT_DATE` do banco (UTC), não o dia do hotel
**Onde:**
- core (hoje): `services/core-service/app/Controllers/AnalyticsApi/GetAlertsController.js` — `r.check_in_date = CURRENT_DATE` no `no_show_risk`;
- analytics-service (H.3, `origin/feature/analytics-cutover`): `services/analytics-service/app/Controllers/AnalyticsApi/GetAlertsController.js` — mesma condição sobre `proj_reservations`. O `GetOccupancyController` da H.3 também cai no dia em UTC quando não recebe `date` (o painel sempre manda).

**Cenário:** o PostgreSQL roda em UTC (nenhum `TZ`/`timezone` no compose, no k8s nem no Sequelize). Entre **21h e 23h59 de Brasília**, `CURRENT_DATE` já é o dia seguinte: o `no_show_risk` passa a listar as chegadas de **amanhã** e some com as de hoje. Conferido em 04/11 às 20h01 (BRT): `SELECT current_date, now()` → `2026-11-04 | 2026-11-04 23:01:25+00` — a uma hora de virar.

**Efeito no painel:** nenhum selo falso. O painel cruza o `no_show_risk` pelo id com as chegadas do dia **do hotel** (`todayISO()`, America/Sao_Paulo), então à noite o selo "Sem pagamento · risco de no-show" simplesmente some — justamente no horário do *late check-in*, quando o recepcionista decide se segura o quarto.

**Regra violada:** "Data é dia, não instante. Diária ancorada em `America/Sao_Paulo`" (`frontend/DESIGN_PMS.md` §5; SPEC-05 §3).

**Correção sugerida (na H.3):** aceitar `?date=YYYY-MM-DD` no `/analytics/alerts` (validado como no `occupancy`) e usar `CAST(:refDate AS date)` no lugar de `CURRENT_DATE`; o painel passa a mandar `todayISO()`. Alternativa: `(now() AT TIME ZONE 'America/Sao_Paulo')::date`. Teste: congelar o relógio em 22h BRT e conferir que a chegada de hoje continua no `no_show_risk`.

---

### 🟢 [Analytics] consistência eventual da lista de limpeza depois do cutover
**Onde:** painel "Hoje", bloco "Em limpeza" — lê `cleaning_pending` do `/analytics/alerts`.
**Cenário:** com a H.3, o quarto que vai para `CLEANING` no check-out (core) só aparece na lista quando o consumidor projetar o evento; o "Liberar quarto" idem para sair. Hoje, no core, é imediato. O painel recarrega a cada 60 s e invalida os alertas depois de cada ação, então a defasagem é de segundos, mas pode aparecer na demonstração.
**Correção sugerida:** nenhuma no analytics; se incomodar no ensaio, o painel pode tirar o quarto da lista em cache no sucesso do `release` (otimista). Registrado para não surpreender.
