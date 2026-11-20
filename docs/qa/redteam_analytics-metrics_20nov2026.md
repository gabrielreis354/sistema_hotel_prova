# QA Red Team — analytics-metrics (RNF-029 / 🔴-7 da banca)
**Branch:** feature/analytics-metrics · **Dev:** Weslley · **Base:** develop@859cb30 · **Data:** 20/11/2026
**Arquivos auditados:** 17 (diff `develop...HEAD`, 6 commits) + vizinhos lidos inteiros: `consumer.js`, `routes/router.js`, `bootstrap/createApp.js`, `tenant.middleware.js`, `applyEvent.js`, `docker/nginx/default.conf`, `infra/k8s/nginx.yaml`, `infra/k8s/networkpolicy.yaml`, `infra/k8s/observability.yaml`, `grafana-alerting.yml`, `rabbitmq-dashboard.json`, `Dockerfile` do analytics, cópias do core (`metrics.js`, `metrics.middleware.js`, `GetMetricsController.js`)
**Achados no escopo:** 7 (🔴 0 · 🟡 2 · 🟢 5) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

O 🔴-7 de `docs/banca/CONTRADICOES_DOCUMENTACAO_19NOV2026.md` (branch `origin/docs/avaliacao-banca-simulada`) está fechado no código: o analytics tem `prom-client`, `GET /metrics` protegido, job `analytics-service` no Prometheus do compose e do k8s, e linha própria no painel. Não há achado 🔴. As duas 🟡 são de apresentação do painel e convém corrigir antes do ensaio de 24/11, porque a banca vai ver os números.

## Achados no escopo

### 🟡-1 [UI/demo] "Eventos aplicados (última hora)" mostra número quebrado
**Onde:** `infra/k8s/observability/gesway-dashboard.json`, painel id 13 (`expr: sum(increase(analytics_events_total{outcome="applied"}[1h])) or vector(0)`, `fieldConfig.defaults` só com `unit: "short"`, sem `decimals`)
**Cenário:** `increase()` extrapola até as bordas da janela. Ao vivo no compose, com 3 eventos aplicados, a consulta devolveu `3.048182222222222`. O stat com decimais automáticos mostra "3.05 eventos". No passo 8 (8–18 s), o roteiro manda dizer "esse número subiu durante a demonstração", e a banca vê um contador de eventos fracionado.
**Regra violada:** contrato do painel com o roteiro (`docs/roteiro/PASSO_8_GRAFANA.md:46`). É contagem de unidades discretas.
**Correção sugerida:** `"decimals": 0` no `fieldConfig.defaults` do painel 13, ou `round(sum(increase(...[1h])))`.

### 🟡-2 [Observabilidade] Vazão e p95 do analytics são dominados pelo healthcheck, mas a descrição fala em "tela Indicadores"
**Onde:** `services/analytics-service/middlewares/metrics.middleware.js:10` (só `/metrics` é excluído), `services/analytics-service/Dockerfile:30` (`HEALTHCHECK --interval=10s` em `/health`), `infra/k8s/analytics.yaml:192-197` (readiness em `/health` a cada 10 s). Painéis 14, 15 e 17 de `gesway-dashboard.json`.
**Cenário:** ninguém abre a tela Indicadores. Mesmo assim, o painel 14 ("Requisições por segundo", descrição "Consultas da tela Indicadores atendidas pelo analytics") mostra cerca de 0,1 req/s, e o p95 do painel 15 é a latência do `SELECT 1` do `/health`. Se a banca perguntar "o gerente está usando os indicadores agora?", o painel responde "sim" sem que seja verdade. O p95 baixo do `/health` também esconde uma consulta de indicador lenta.
**Regra violada:** a descrição do painel contradiz a métrica. O core tem o mesmo comportamento desde a T-02.4, mas lá a descrição não promete "tela Indicadores".
**Correção sugerida:** nos painéis 14, 15 e 17, filtrar `route!="/health"`, ou corrigir a descrição do painel 14. O middleware não precisa mudar.

### 🟢-1 [Observabilidade] "Analytics no ar" = 1 com o consumidor parado
**Onde:** `gesway-dashboard.json` painel 12 (`up{job="analytics-service"}`); `GetMetricsController.js` não depende do banco nem do broker.
**Cenário:** o broker cai, ou o banco do analytics cai e o `/health` vai a 503 (o pod sai do Service no k8s). O Prometheus raspa o pod direto (SD por pod, que ignora readiness), então `up` continua 1. O painel diz "no ar" com o consumo parado. Hoje isso só aparece de forma indireta: no painel do RabbitMQ (Consumidores do analytics) e na linha do roteiro em `PASSO_8_GRAFANA.md:77`.
**Correção sugerida (5º semestre ou pós-congelamento):** gauge `analytics_consumer_consuming` (0/1) a partir de `consumer.status()`, e um stat no painel. O doc já registra a falta de alerta em "Pendências conhecidas".

### 🟢-2 [Consumer] Caminhos sem contagem, ou com contagem dupla, sem teste
**Onde:** `services/analytics-service/app/consumer/consumer.js`
- `:151-155` pausa por infraestrutura: não conta nada. Está correto, porque a mensagem volta e é contada no desfecho final. Mas nenhum teste garante que a pausa **não** conta.
- `:166-171` falha ao publicar na DLQ: nack sem contagem. A falha mais grave do consumidor fica invisível no painel; só aparece no log.
- `:160-161` `retry` é contado mesmo quando o nack se perde (canal fechado). O broker reentrega sem `x-death`, e a mesma tentativa é contada de novo.
- `:173-174` `dead_letter` é contado mesmo quando o ack se perde. A reentrega publica outra cópia na DLQ e conta de novo. Isso bate com a profundidade real da DLQ, então é aceitável.
**Cenário de dano:** baixo. É só métrica, sem efeito em projeção ou dinheiro. O sucesso (`:138-139`, contagem depois do ack, `applied`/`stale`/`duplicate` vindos de `applyEvent.js:77/89/98`) está certo. Ack perdido nesse caminho conta `applied` uma vez e depois `duplicate`, o que é coerente.
**Correção sugerida:** um outcome `dead_letter_failed` na allowlist para o caminho `:166-171`, e testes de "pausa não conta" e "falha da DLQ não conta como dead_letter".

### 🟢-3 [Roteiro] Correção de "token diferente" não recria o Prometheus
**Onde:** `docs/roteiro/PASSO_8_GRAFANA.md:75`; `docker-compose.yml:301-302` (o token é gravado em `/prometheus/metrics_token` só quando o contêiner do Prometheus inicia).
**Cenário:** o operador troca `METRICS_TOKEN` no `.env` e roda o comando da tabela, `docker compose up -d backend analytics-service`. Os serviços passam a usar o token novo, e o Prometheus continua com o antigo. Os dois "no ar" vão a 0 (401).
**Correção sugerida:** trocar o comando por `docker compose --profile observability up -d`, que recria quem teve o ambiente alterado, inclusive o Prometheus.

### 🟢-4 [Painel] Títulos repetidos entre as linhas do core e do analytics
**Onde:** `gesway-dashboard.json`, painéis 3 e 14 ("Requisições por segundo"); 4 ("Latência p95 (geral)") e 15 ("Latência p95").
**Cenário:** na busca de painel do Grafana, ou num print fora de contexto, não se sabe de qual serviço é o número. O roteiro resolve isso pela posição ("linha de cima", "role a página"), o que basta para a demo.
**Correção sugerida:** sufixo "(analytics)" nos painéis 14 e 15, como já existe no 17.

### 🟢-5 [Métrica] A série em 0 só resolve se o Prometheus raspar antes do primeiro evento
**Onde:** `services/analytics-service/app/utils/metrics.js:58` (`eventsTotal.inc({ outcome }, 0)`); `docker-compose.yml` (o Prometheus depende só de `backend: service_healthy` e sobe em paralelo com o consumo).
**Cenário:** primeiro `up` com backlog na fila (o volume `rabbitmq_data` guarda eventos de outra sessão). O consumidor drena em menos de 15 s, antes do primeiro scrape. A primeira amostra já é N, e `increase()` não conta esse lote. Na demo isso não pesa, porque o roteiro sobe tudo antes do passo 1 e esse backlog não é da demonstração. Fica registrado para ninguém achar que o fix de 54a2bad cobre todo caso.
**Correção sugerida:** nenhuma no código. Uma linha no roteiro basta.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- **RNF-029 / 🔴-7:** `prom-client ^15.1.3` em `package.json`, `GET /metrics` no analytics, job `analytics-service` em `docker/prometheus/prometheus.yml:18-26` e `infra/k8s/observability.yaml:82-100`, linha no painel. Ao vivo: os 3 alvos `up`, e `analytics_events_total` vem com `job="analytics-service"`.
- **Fail-closed e timing-safe** (`GetMetricsController.js:14-25`): token vazio dá 503; o tamanho é conferido antes do `timingSafeEqual` (sem exceção); o JWT de usuário não abre (teste). O tamanho do token vaza por tempo, mas é o mesmo desenho do core e não é explorável com token de 64 hex.
- **Variações de caminho:** `metricsRouter` com `caseSensitive`+`strict` (`router.js:80-82`). Os testes cobrem `/METRICS`, `/Metrics` e `/metrics/` (404 com token certo). No nginx ao vivo: `/metrics`, `/METRICS`, `/metrics/`, `/analytics/../metrics`, `/analytics/%2e%2e/metrics` e `/analytics/%2E%2E/metrics` dão 404, e `/analytics/metrics` dá 401 (auth do analyticsRouter, sem tocar o `/metrics`). A regex `~* ^/metrics(/|$)` vence o prefixo `/analytics/` no compose e no k8s (`nginx.yaml:46`).
- **Rede:** analytics sem porta no host (compose); NetworkPolicy `analytics-service-ingress` só para nginx e prometheus na porta 3001 (`networkpolicy.yaml:200-209`); o label `app: prometheus` existe no Deployment; o secret é montado em `/etc/prometheus/secrets/METRICS_TOKEN`; o regex de relabel `analytics-service` é ancorado e não pega `analytics-postgres`; `containerPort: 3001` está declarado (`analytics.yaml:140`), então o SD por pod gera o alvo.
- **Cardinalidade:** `routeLabel` com caixa baixa no `baseUrl` (`metrics.js:69-75`), padrão da rota, `/analytics/*` para barrado no auth e `unmatched` para o resto (testes cobrem `/ANALYTICS/xyz…` e `/wp-admin`). O analytics não tem mount com parâmetro, então não precisa do `replace` do `/public/:subdomain` do core. `tenant_id` só entra depois do `tenantMiddleware` validar UUID + tenant ACTIVE na projeção (`tenant.middleware.js:17-32`), o que limita a série ao número de hotéis. `outcome` é allowlist com `other` (`metrics.js:60-62`, teste).
- **Painel:** as 9 queries do core agora têm `job="core-service"`. Antes da branch elas iam somar o analytics, porque os nomes de métrica são iguais. Sem sobreposição de `gridPos` nem `id` duplicado (verificado por script). `analytics_events_total` só existe no analytics, então dispensa o filtro de job. Os alertas (`grafana-alerting.yml`) usam só métricas do RabbitMQ e não são afetados pela métrica homônima.
- **Roteiro:** pasta "Gesway", títulos "Gesway — Saúde do core e do analytics" / "Gesway — Mensageria (RabbitMQ)", painéis "Broker no ar", "Mensagens mortas (DLQ)", "Consumidores do analytics", "Requisições por hotel (tenant)" e porta 3002 conferem com os arquivos. **Plano B executado ao vivo:** a imagem é `node:24-alpine` (tem o `wget` do busybox), a saída traz `analytics_events_total{outcome="applied",...} 3`, e o mesmo comando sem header dá 401.
- **ESM:** nenhum `require()` no diff. Nenhuma escrita em banco nova, então transação não se aplica.
- **DRY:** a cópia de `metrics.js`, do middleware e do controller entre core e analytics é justificável. Os dois serviços têm `package.json` e deploy separados, e não existe pacote compartilhado entre backends (`services/` só tem os dois). O `diff` mostra que as cópias divergem só no rótulo `service`, no `/public/:subdomain` (que o analytics não precisa) e no contador de eventos. O cabeçalho avisa "Mudou um, confira o outro".
- **Testes:** `tests/metrics.test.js` 18/18 verdes nesta auditoria (hotel-test-pg na 55432). Cobrem fail-closed, 401, JWT, variações de caminho, rota, 401 no mount, caixa, unmatched, tenant, scrape não medido, séries em 0, applied/duplicate com o `applyEvent` real, retry/dead_letter e allowlist.

## Não foi possível verificar
- Suíte completa do analytics (190 testes) e cobertura: rodei só `tests/metrics.test.js`. O número de 190 verdes é do autor.
- Manifests k8s aplicados num cluster real: a revisão foi estática. O SD por pod, a NetworkPolicy e o mount do secret foram conferidos por leitura, comparando com o job `core-service`, que já funciona no mesmo cluster.
- Renderização visual do Grafana (decimais, legenda): a 🟡-1 foi deduzida do valor que o Prometheus devolveu ao vivo (`3.048…`) e do `fieldConfig` sem `decimals`. Não abri o navegador.

---

## Desfecho (20/11/2026, commit `667db2b`)

- 🟡-1 corrigido: `round(...)` e `decimals: 0` no painel 13. Conferido no Prometheus: `3`.
- 🟡-2 corrigido: `route!="/health"` nos painéis 14, 15 e 17, com a descrição ajustada.
- 🟢-3 corrigido: o roteiro manda `docker compose --profile observability up -d`.
- 🟢-4 corrigido: painéis 14 e 15 renomeados para "Analytics — …".
- 🟢-1, 🟢-2 e 🟢-5 ficam como pendência pós-congelamento: estado do consumidor como gauge, contagem da falha de envio à DLQ e teste da pausa por infraestrutura. Nenhum afeta o passo 8.
