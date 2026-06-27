# Módulo Analytics — Planejamento e Especificação
**Data:** 27/06/2026 | **Responsável:** Gabriel (orquestrador) | **Branch:** feature/analytics-module

---

## 1. Problema e Motivação

Hotéis de pequeno e médio porte (5–80 quartos) tomam decisões operacionais com base em memória ou planilhas manuais. O sistema já possui todos os dados necessários em `payments`, `reservations`, `rooms`, `room_categories` e `guests`, mas nenhum endpoint agrega essas informações em KPIs úteis.

**Perguntas que um hoteleiro faz diariamente e que hoje não têm resposta no sistema:**
- "Quanto entrou esta semana, e quando vai entrar o restante?"
- "Tem quarto parado em limpeza desde ontem?"
- "Quais hóspedes devo priorizar no atendimento?"
- "Meu mês de fevereiro foi melhor ou pior que o ano passado?"
- "Qual categoria de quarto é mais lucrativa?"

---

## 2. Abordagem Técnica

**Zero mudanças de schema.** Todos os KPIs são calculados via queries SQL sobre as tabelas existentes usando `sequelize.query()` com `QueryTypes.SELECT` — mesmo padrão de `tests/helpers/db.js`.

**Isolamento multi-tenant garantido:** toda query inclui `WHERE tenant_id = :tenantId` com named replacements do Sequelize (proteção contra SQL injection).

**Autenticação:** todos os endpoints protegidos por `authMiddleware + tenantMiddleware` — o mesmo padrão dos demais routers.

---

## 3. Endpoints Implementados

### 3.1 GET /analytics/revenue

**Parâmetros opcionais:** `?start=YYYY-MM-DD&end=YYYY-MM-DD`

| Campo | Descrição |
|-------|-----------|
| `realized.total` | Total recebido (SUM de `payments.amount`) |
| `realized.by_month` | Receita realizada agrupada por mês |
| `expected.total` | Total a receber de reservas CONFIRMED + CHECKED_IN |
| `unpaid` | Lista de reservas com hóspede e valor, sem nenhum pagamento associado |

**Cenário de uso:** recepcionista verifica quanto falta cobrar antes de fechar o turno.

---

### 3.2 GET /analytics/occupancy

**Parâmetros opcionais:** `?date=YYYY-MM-DD` (default: hoje)

| Campo | Descrição |
|-------|-----------|
| `total_rooms` | Total de quartos do tenant |
| `occupied` | Quartos com status OCCUPIED |
| `available` | Quartos com status AVAILABLE |
| `cleaning` | Quartos com status CLEANING |
| `occupancy_rate` | (occupied / total) × 100, 2 decimais |
| `adr` | Average Daily Rate = receita / diárias vendidas na data |
| `revpar` | Revenue Per Available Room = ADR × occupancy_rate / 100 |

**Cenário de uso:** dashboard do gerente na abertura do dia.

---

### 3.3 GET /analytics/alerts

**Sem parâmetros.**

| Campo | Descrição |
|-------|-----------|
| `no_show_risk` | Reservas CONFIRMED para hoje sem pagamento registrado |
| `cleaning_pending` | Quartos em status CLEANING (bloqueados para nova reserva) |
| `pending_too_long` | Reservas PENDING criadas há mais de 48h sem confirmação |

**Cenário de uso:** primeira coisa que o gerente vê ao abrir o sistema — ações urgentes.

---

### 3.4 GET /analytics/seasonality

**Parâmetros opcionais:** `?months=12` (1–60, default: 12)

Retorna array de objetos por mês com: `month` (YYYY-MM), `reservations`, `revenue`, `avg_nights`.

**Cenário de uso:** comparar sazonalidade, identificar meses fracos, planejar promoções.

---

### 3.5 GET /analytics/revenue-by-category

**Parâmetros opcionais:** `?start=YYYY-MM-DD&end=YYYY-MM-DD`

Retorna array ordenado por `revenue DESC` com: `category`, `reservations`, `revenue`, `avg_ticket`.

**Cenário de uso:** decidir em qual categoria investir em manutenção ou reforma.

---

### 3.6 GET /analytics/payment-mix

**Parâmetros opcionais:** `?start=YYYY-MM-DD&end=YYYY-MM-DD`

Retorna por método de pagamento: `method`, `count`, `total`, `pct` (percentual com window function).

**Cenário de uso:** verificar se PIX está crescendo para negociar com máquinas de cartão.

---

### 3.7 GET /analytics/top-guests

**Parâmetros opcionais:** `?limit=10` (1–100, default: 10)

Retorna hóspedes ordenados por `lifetime_value DESC` com: `guest_id`, `full_name`, `email`, `total_reservations`, `lifetime_value`, `last_stay`.

**Cenário de uso:** programa de fidelidade, oferecer upgrade para VIPs no check-in.

---

## 4. Estrutura de Arquivos

```
app/Controllers/AnalyticsApi/
  GetRevenueController.js
  GetOccupancyController.js
  GetAlertsController.js
  GetSeasonalityController.js
  GetRevenueByCategoryController.js
  GetPaymentMixController.js
  GetTopGuestsController.js

routes/apis/
  analyticsRouter.js        ← 7 endpoints com authMiddleware + tenantMiddleware

routes/router.js            ← +import analyticsRouter, +router.use('/analytics', ...)
docs/PRODUCT_ROADMAP.md     ← Módulo Analytics adicionado na Fase 2
```

---

## 5. Padrões de Qualidade Aplicados

| Padrão | Aplicação |
|--------|-----------|
| Multi-tenant | Toda query: `WHERE tenant_id = :tenantId` |
| SQL injection | Sempre `replacements: { tenantId }` com QueryTypes.SELECT |
| ESM | `import`/`export` em todos os arquivos |
| Validação de entrada | `months` (1–60), `limit` (1–100) com 400 retornado |
| Isolamento de erro | `console.error` + 500 genérico (sem vazar stack traces) |
| DRY | Padrão `dateFilter` condicional reutilizado em revenue, category, mix |

---

## 6. Verificação Pós-Deploy

```bash
# 1. Levantar ambiente
./start.sh tunnel   # porta 8080 ativa

# 2. Login
TOKEN=$(curl -s -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@aurora.example","password":"senha123","subdomain":"aurora"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 3. Testar todos os endpoints
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/analytics/revenue
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/analytics/occupancy
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/analytics/alerts
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/analytics/seasonality
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/analytics/revenue-by-category
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/analytics/payment-mix
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/analytics/top-guests

# 4. Verificar isolamento: trocar para admin@sol.example e repetir
#    Nenhum dado do Hotel Aurora deve aparecer
```

---

## 7. Próximos Passos (Backlog)

| Item | Prioridade | Fase |
|------|-----------|------|
| Swagger: documentar todos os 7 endpoints com schemas de resposta | Média | TCC |
| Cache Redis para `/analytics/seasonality` (query mais pesada) | Baixa | Produto |
| Filtro por `room_id` em `/analytics/occupancy` | Baixa | Produto |
| Export CSV/Excel das tabelas | Média | Produto |
| Dashboard frontend (React) com gráficos | Alta | Fase 3 |

---

*Relatório gerado em: 27/06/2026*
*Metodologia: RPI (Research → Plan → Implement)*
