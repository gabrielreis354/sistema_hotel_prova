# Painel do RabbitMQ no Grafana (CA-01.4.f) — 28/10/2026

**Branch:** `feature/grafana-rabbitmq` (a partir de `origin/develop`)
**Origem:** pendência 1 de `docs/historico_sessao/gabriel/outbox_core_15102026.md`; item 4 do painel de andamento (semana 1, Weslley)

## Contexto

O Prometheus já raspava o RabbitMQ em `rabbitmq:15692/metrics/per-object` (compose e k8s), mas nenhum
dashboard mostrava as filas. O catálogo de eventos (§5.3) também pede alerta no Grafana quando a fila
de mensagens mortas recebe algo, porque a mensagem não volta sozinha.

## O que foi feito

| Arquivo | Mudança |
|---|---|
| `infra/k8s/observability/rabbitmq-dashboard.json` | Dashboard novo `gesway-rabbitmq` — "Gesway — Mensageria (RabbitMQ)", pasta Gesway |
| `infra/k8s/observability/grafana-alerting.yml` | 2 regras: mensagens na DLQ (> 0 por 1 min, warning) e RabbitMQ fora (`up` < 1 ou sem dado por 2 min, critical) |
| `docker-compose.yml` | Serviço `grafana` monta o dashboard novo e o arquivo de alertas |
| `infra/k8s/kustomization.yaml` · `observability.yaml` | Dashboard no configMap `grafana-dashboards`; configMap `grafana-alerting` montado em `/etc/grafana/provisioning/alerting` |
| `docs/specs/SPEC-01-microsservicos.md` | CA-01.4.f marcado, com a ressalva do atraso em segundos |

Painéis do dashboard:

1. **Broker no ar** — `up{job="rabbitmq"}`.
2. **Mensagens mortas (DLQ)** — vermelho a partir de 1.
3. **Consumidores do analytics** — vermelho em 0 (ninguém aplica os eventos).
4. **Eventos esperando consumo** — prontas na fila principal; amarelo em 100, vermelho em 1000.
5. **Profundidade por fila** — principal, `.retry` e `.dlq`.
6. **Fila principal — prontas × em processamento** — o atraso de consumo aparece aqui.
7. **Vazão do broker** — publicadas × entregues × confirmadas (msg/s).
8. **Ciclo de nova tentativa** — dead-letter do broker: rejeitadas (nack → espera de 10 s) e expiradas (voltam à fila). A ida para a DLQ não passa por aqui, porque o analytics publica em `analytics.dlx`.

O dashboard do core-service, o `prometheus.yml` e a topologia das filas não mudaram.

## Evidências

Ambiente descartável (rede Docker própria, removido no fim): `rabbitmq:4-management-alpine` com o
`infra/k8s/rabbitmq-setup.sh` do repositório, `prom/prometheus:v3.1.0` raspando o job `rabbitmq` do
`docker/prometheus/prometheus.yml`, e `grafana/grafana:11.4.0` com os arquivos de provisionamento do repositório.

- Os 2 dashboards e as 2 regras carregaram pelo provisionamento (`/api/search`, `/api/v1/provisioning/alert-rules`).
- 5 eventos publicados em `gesway.core.events` e 1 em `analytics.dlx`: o Prometheus viu 6 na fila principal e 1 na DLQ.
- 3 mensagens rejeitadas sem requeue foram para `.retry` e voltaram à fila principal em cerca de 10 s, como o catálogo prevê.
- Todas as 13 consultas do dashboard retornaram valor pela proxy do datasource do Grafana.
- O alerta da DLQ passou a `firing` com o resumo `1 mensagem(ns) em analytics.core-events.dlq`.
- `docker compose --profile observability config` e `kubectl kustomize infra/k8s` renderizam com os arquivos novos.

**Não verificado:** o alerta "RabbitMQ fora do ar" não foi testado parando o broker (o teste foi
interrompido). O print do dashboard no navegador também não foi feito: o Playwright travou e a ponte
WSL → Windows para abrir o Edge estava fora (`UtilAcceptVsock: accept4 failed 110`).

## Pendências

| # | Pendência | Dono | Observação |
|---|---|---|---|
| 1 | Testar o alerta "RabbitMQ fora do ar" parando o broker | Weslley | `for: 2m` + intervalo de 1 min: cerca de 3 min até `firing` |
| 2 | Atraso de consumo em segundos | Gabriel/Weslley | O core publica sem a propriedade `timestamp` (`app/services/outbox/publisher.js`). Com ela, `time() - rabbitmq_queue_head_message_timestamp` dá a idade da mensagem mais antiga — conferir se a métrica sai para fila quorum |
| 3 | Contact point dos alertas | Weslley | Hoje o alerta só aparece em Alerting → Alert rules; não notifica ninguém |
| 4 | Conferir o painel com o consumidor real (H.2) | Weslley | "Consumidores do analytics" fica vermelho até a `feature/analytics-service` entrar na develop |
| 5 | qa-redteam antes do merge em develop | — | Branch com push, sem merge |
