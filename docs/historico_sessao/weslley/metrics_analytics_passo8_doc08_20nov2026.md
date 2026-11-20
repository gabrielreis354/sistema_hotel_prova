# Sessão de 20/11/2026 — `/metrics` do analytics, passo 8 no Grafana e Doc 08 v1.3

**Dev:** Weslley (com Claude Code) · **Pedido:** os três itens do caminho crítico até o congelamento de 24/11 (revisão de 19/11), mais a confirmação da chave do Asaas.

## Entregue

| Item | Onde | Situação |
|---|---|---|
| 1. `/metrics` no `analytics-service` (RNF-029, 🔴-7) | PR #193, branch `feature/analytics-metrics` | Aberto para a `develop`, CI rodando |
| 2. Passo 8 no roteiro | `docs/roteiro/PASSO_8_GRAFANA.md`, no PR #193 | Aberto |
| 3. Doc 08 v1.3 | PR #11 do fork (`docs/doc08-v1.3`); a v1.2 subiu na `entrega-8-sprints` | Aberto para a `main` do fork |
| Chave do Asaas | `PASSO_6_RESERVA_DIRETA_PIX.md` | Trocada em 16/11, vale até 31/07/2027; primeiro ensaio com ela em 24/11 |

## Item 1 em detalhe

- `prom-client` no analytics, com o mesmo desenho do core: `app/utils/metrics.js`, `middlewares/metrics.middleware.js`, `app/Controllers/MetricsApi/GetMetricsController.js` e o Router `caseSensitive`/`strict`.
- Novo: `analytics_events_total{outcome}` no consumidor, com as séries nascendo em 0.
- Prometheus do compose e do k8s, `METRICS_TOKEN` no analytics, NetworkPolicy e painel do Grafana (os painéis do core passam a filtrar `job="core-service"`).
- TDD: RED em `c707100`; 190 testes verdes no analytics.
- Conferido no compose com `--profile observability`: alvos up, 401 sem token, 404 pelo nginx, eventos do outbox aplicados e painéis com dados.
- Achado no teste ao vivo: sem as séries em 0, o painel "Eventos aplicados" mostrava 0 com 196 eventos (`increase()` não enxerga a série nascendo). Corrigido em `54a2bad`.
- qa-redteam: APROVADO COM RESSALVAS; 🟡-1 e 🟡-2 corrigidas (`0b8d133`). `/security-review`: sem achados.

## Armadilhas do ambiente

- O `docker compose build` falhou duas vezes no credential helper do Docker Desktop pelo WSL (`error getting credentials`). Contorno: `DOCKER_CONFIG` temporário com `{}` (imagens públicas).
- O primeiro `up` que falhou deixou o contêiner do RabbitMQ **sem rede** (`no such host`). Contorno: `docker compose up -d --force-recreate rabbitmq rabbitmq-setup`.
- O `.env` da raiz não tinha `METRICS_TOKEN` nem `GRAFANA_ADMIN_PASSWORD`. Para o teste foram usados valores aleatórios passados pelo ambiente do shell; o `.env` não foi alterado. **Antes do ensaio de 24/11, defina os dois no `.env`.**
- O `.env.test` do analytics foi criado (não versionado), apontando para o `hotel-test-pg` na 55432.

## Pendências para o próximo dev

- Merge do PR #193 na `develop` depois do CI verde, e anotar no `PASSO_8_GRAFANA.md` a execução verde do Actions que vai ser aberta na apresentação.
- Merge do PR #11 do fork (Doc 08) e, junto com o PR #10, decidir o PR ao professor.
- 🟢 do qa-redteam do analytics (estado do consumidor como gauge, contagem da falha de envio à DLQ, teste da pausa por infraestrutura): pós-congelamento.
- 🟢 do qa-redteam do Doc 08 que ficaram: replanejamentos na coluna "Sprint planejada", atraso das metas vencidas, DoD × §8, ata de 03/11.
- A branch local `fix/sazonalidade-meses-vazios` (`35fe391`) continua só local, sem push.
