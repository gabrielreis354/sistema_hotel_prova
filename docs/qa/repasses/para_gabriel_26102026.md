# Repasses para Gabriel — 26/10/2026

Origem: `docs/qa/redteam_t047-consumo-interno_26out2026.md` (branch `feature/t047-consumo-interno-seed`, Sirlande).

### 🟡 [Data/fuso] Analytics de receita agrupa por dia UTC, não pelo dia do hotel
**Onde:** `services/core-service/app/Controllers/AnalyticsApi/GetRevenueController.js:10` e `GetPaymentMixController.js:10` (`paid_at::date BETWEEN :start AND :end`). Causa: `database/connections/sequelize.js` não define `timezone`, então o Sequelize põe a sessão em `+00:00` (`SET TIME ZONE INTERVAL '+00:00'`).
**Cenário:** um pagamento PIX feito em 31/10 às 22:30 BRT é gravado como `2026-11-01 01:30Z`. `('2026-10-31 22:30-03'::timestamptz)::date` devolve `2026-11-01` (confirmado no banco de teste). Por isso a receita de outubro sai sem esse pagamento e a de novembro sai com ele. O mesmo vale para todo pagamento feito entre 21:00 e 23:59.
**Regra violada:** checklist do qa-redteam §7 (data sem fuso explícito `America/Sao_Paulo`). Relatório financeiro com o período errado.
**Correção sugerida:** `(paid_at AT TIME ZONE 'America/Sao_Paulo')::date`, ou fixar `timezone` na conexão Sequelize, avaliando o impacto no resto do sistema. Vale levar para o `analytics-service` da T-01.4.

> **Nota do autor (26/10):** a T-04.7 corrigiu o mesmo problema no relatório dela (D-68) com `HOTEL_TIMEZONE` em `services/core-service/app/utils/hotelTimezone.js`: `(paid_at AT TIME ZONE :timezone)::date`, com `replacements: { timezone: HOTEL_TIMEZONE }`. A conexão do Sequelize continua sem `timezone` fixo, de propósito: fixar mudaria a leitura e a escrita de datas no sistema inteiro.
