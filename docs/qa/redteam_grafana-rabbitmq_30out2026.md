# QA Red Team — painel do RabbitMQ no Grafana (CA-01.4.f)
**Branch:** `feature/grafana-rabbitmq` · **Dev:** Weslley · **Base:** develop@a6dc1ea (merge-base; develop atual 093d14b, merge limpo) · **Data:** 30/10/2026
**Arquivos auditados:** 7 (diff) + 6 de contexto (`docker/prometheus/prometheus.yml`, `infra/k8s/observability.yaml` inteiro, `infra/k8s/rabbitmq.yaml`, `infra/k8s/networkpolicy.yaml`, `infra/k8s/rabbitmq-setup.sh`, catálogo de eventos §3/§5.3)
**Achados no escopo:** 6 (🔴 0 · 🟡 3 · 🟢 3) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴. As consultas PromQL batem com o que o `rabbitmq_prometheus` do RabbitMQ 4 expõe
(validado em contêiner, ver "O que foi verificado"). As ressalvas são de honestidade do critério
(CA-01.4.f marcado como feito sem o atraso de consumo existir de fato, e com o caminho de correção
documentado inviável para fila quorum) e de diagnóstico do alerta de broker fora.

## Achados no escopo

### 🟡 [Critério / honestidade] CA-01.4.f marcado `[x]` sem "atraso de consumo" observável
**Onde:** `docs/specs/SPEC-01-microsservicos.md:244`; `infra/k8s/observability/rabbitmq-dashboard.json:305` (painel 6) e `:349` (painel 7)
**Cenário:** o critério C8 pede "profundidade de fila **e atraso de consumo** aparecem no Grafana". Hoje
não há consumidor na develop (`feature/analytics-service` não entrou — o próprio relatório admite,
pendência 4). Com consumidor zero, "prontas" só cresce e "em processamento" é 0 para sempre: o
painel mostra *acúmulo*, não *atraso*. Mesmo com consumidor, contagem de mensagens é proxy — 1000
prontas pode ser 2 s ou 2 h de atraso conforme a vazão. A versão anterior da linha dizia
corretamente "Atraso de consumo só existe com o consumidor (H.2)"; a nova marca `[x]`.
**Regra violada:** CLAUDE.md §1 (registrar pendência em vez de declarar feito); critério C8 da SPEC-01.
**Correção sugerida:** manter `[ ]` (ou marcar parcial, "profundidade ✔, atraso pendente H.2") até
haver medida em tempo. Alternativa barata no painel atual: estimativa
`sum(rabbitmq_queue_messages_ready{queue="analytics.core-events"}) / clamp_min(sum(rate(rabbitmq_global_messages_acknowledged_total{queue_type="rabbit_quorum_queue"}[5m])), 0.001)`
(segundos para esvaziar), deixando claro que é estimativa.

### 🟡 [Critério / documentação] O caminho para "atraso em segundos" não funciona para fila quorum
**Onde:** `docs/specs/SPEC-01-microsservicos.md:244` ("o atraso em segundos exige o core publicar com a propriedade `timestamp`"); `docs/historico_sessao/weslley/painel_rabbitmq_grafana_28out2026.md:57`
**Cenário:** validado em `rabbitmq:4-management-alpine` com a topologia do `rabbitmq-setup.sh`:
`/metrics/per-object` só emite `rabbitmq_queue_head_message_timestamp` para
`analytics.core-events.retry` (classic, valor `NaN`); para `analytics.core-events` e `.dlq` (quorum)
a série **não existe**, e `rabbitmqctl list_queues head_message_timestamp` sai vazio para as quorum.
Ou seja: mesmo que o core passe a publicar com `timestamp`, `time() - rabbitmq_queue_head_message_timestamp`
continua sem dado na fila principal. A SPEC registra como fato uma solução que não resolve; o
relatório ao menos diz "conferir".
**Regra violada:** CLAUDE.md §4-R (pesquisar antes de planejar); pendência com contexto enganoso para o próximo dev.
**Correção sugerida:** trocar o texto da SPEC e da pendência 2 para: o atraso em segundos sai do
**consumidor** — o analytics expõe um histograma `now() - occurred_at` (campo obrigatório do envelope,
catálogo §2) no `/metrics` dele, raspado pelo Prometheus. Não depende de propriedade AMQP nem do tipo de fila.

### 🟡 [Alerta] "RabbitMQ fora do ar" não distingue broker fora de scrape falhando, e afirma consequência que pode ser falsa
**Onde:** `infra/k8s/observability/grafana-alerting.yml:47` (título), `:55` (expr), `:66` (`noDataState: Alerting`), `:71-73` (description); `infra/k8s/observability/rabbitmq-dashboard.json:26`
**Cenário:** `up{job="rabbitmq"} == 0` significa "o Prometheus não conseguiu raspar", não "broker fora".
Casos que disparam o alerta **critical** com o broker saudável e o core publicando normalmente:
(1) NetworkPolicy alterada sem a regra `app: prometheus → 15692` (`networkpolicy.yaml:87-93`);
(2) `/metrics/per-object` passando do `scrape_timeout` padrão (10 s) com o broker carregado — o
endpoint per-object é o mais caro do plugin; (3) plugin `rabbitmq_prometheus` desabilitado ou porta
15692 fora do Service. Nesses casos a description afirma "o publicador do core acumula eventos no
outbox e o analytics para de atualizar", o que manda o operador investigar o lugar errado. O
`summary` está honesto ("O Prometheus não alcança…"); título e description não.
Não testado parando o broker (nem pelo dev, pendência 1, nem por mim); a lógica `up < 1` + `for: 2m`
+ intervalo 1 m está correta para o caso "broker fora".
**Regra violada:** observabilidade — alerta critical deve apontar a causa ou dizer que não sabe.
**Correção sugerida:** menor ajuste: renomear para "Prometheus não raspa o RabbitMQ" e reescrever a
description listando as duas causas (broker fora **ou** scrape bloqueado/lento) e como separar
(`kubectl get pod -l app=rabbitmq` / `docker compose ps rabbitmq`; `scrape_duration_seconds{job="rabbitmq"}`).
Distinção real exige um segundo sinal independente do scrape — p.ex. métrica de falha de publicação/
pendentes do outbox no core-service (hoje não existe nenhuma métrica do outbox em `services/core-service/app/`),
ou probe TCP em 5672. Registrar como pendência.

### 🟢 [Alerta] Alerta da DLQ fica "firing" contínuo e não sinaliza mensagem nova
**Onde:** `infra/k8s/observability/grafana-alerting.yml:21` e `:33-35`
**Cenário:** com 1 mensagem na DLQ em investigação, o alerta fica `Firing` indefinidamente (não é
ruído — é estado real, a mensagem não volta sozinha). Mas se chegar uma 2ª mensagem dias depois, a
regra já está em `Firing` e nada muda além do número no summary: sem contact point (pendência 3),
ninguém percebe o novo evento perdido. `noDataState: OK` está correto (o alerta de broker cobre),
mas também cala o caso "broker no ar, fila `.dlq` não declarada porque o setup falhou".
**Correção sugerida:** segunda regra de chegada, com a métrica que o per-object já expõe (validada):
`sum(increase(rabbitmq_queue_exchange_messages_published_total{queue="analytics.core-events.dlq"}[5m])) > 0`.

### 🟢 [Dashboard] "Vazão do broker" usa contadores globais e rotula como "core" e "analytics"
**Onde:** `infra/k8s/observability/rabbitmq-dashboard.json:349` (description), `:363`, `:372`, `:381`
**Cenário:** `rabbitmq_global_messages_*_total` somam **todo** o broker. "Publicadas pelo core" inclui
a publicação do próprio analytics em `analytics.dlx` (e qualquer publicação manual pela UI — no teste,
a mensagem enviada a `analytics.dlx` entrou em `received_total`). "Entregues" inclui as reentregas do
ciclo de nova tentativa. Com uma fila só o erro é pequeno; cresce com o b2b-service (T-01.6).
**Correção sugerida:** para "publicadas", usar o contador por fila (existe no per-object):
`sum(rate(rabbitmq_queue_exchange_messages_published_total{queue="analytics.core-events",exchange="gesway.core.events"}[5m]))`;
para entregues/ack, filtrar `queue_type="rabbit_quorum_queue"` e ajustar a description para "global do broker".

### 🟢 [Dashboard / testes] Ciclo de nova tentativa omite `delivery_limit`; nenhum check automatizado dos arquivos
**Onde:** `infra/k8s/observability/rabbitmq-dashboard.json:405-430`; CI/`scripts/qa_checks.sh` (sem menção a dashboard ou alerting)
**Cenário:** (a) fila quorum no RabbitMQ 4 tem `delivery-limit` padrão 20: se o consumidor cair
repetidamente com mensagem em voo, ela é dead-lettered para `analytics.retry` com motivo
`delivery_limit` — série `rabbitmq_global_messages_dead_lettered_delivery_limit_total` (exposta,
validada), ausente do painel. (b) Um JSON quebrado ou expr com nome de métrica errado só aparece
quando alguém abre o Grafana.
**Correção sugerida:** (a) 3ª série no painel 8; (b) passo no CI com `jq empty` no JSON e
`promtool`/regex de nomes de métrica contra uma lista conhecida (opcional).

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- **Métricas reais do RabbitMQ 4** (contêiner `rabbitmq:4-management-alpine` + `rabbitmq-setup.sh` do
  repo, 3 mensagens na principal e 1 na DLQ): `/metrics/per-object` emite `rabbitmq_queue_messages`,
  `_messages_ready`, `_messages_unacked` e `_consumers` com labels `{vhost, queue}` para as 3 filas,
  valores 3/1/0 corretos; os 5 `rabbitmq_global_messages_*_total` usados existem no per-object (labels
  `protocol`/`queue_type`/`dead_letter_strategy`, todos agregados por `sum`). O endpoint agregado
  `/metrics` só tem `rabbitmq_queue_messages 4` sem label — por isso o per-object é necessário, e ele
  já é raspado nos dois ambientes (`docker/prometheus/prometheus.yml:21-24`, `infra/k8s/observability.yaml:83-86`).
  `/metrics/detailed` não é necessário. Plugin `rabbitmq_prometheus` vem habilitado na imagem.
- Regex `analytics\\.core-events.*` (painel 5): escapamento JSON → PromQL → regex resulta em `analytics\.core-events.*`, correto.
- Datasource UID `prometheus` em todos os painéis e nas 2 regras = `grafana-datasource.yml` (`uid: prometheus`).
- Provisionamento consistente: compose monta dashboard e alerting (`docker-compose.yml:257-258`); k8s
  gera `grafana-dashboards` com os 2 JSON e `grafana-alerting` (`kustomization.yaml:26-32`), montado
  em `/etc/grafana/provisioning/alerting` como diretório irmão dos outros (`observability.yaml:228-243`);
  o hash do configMapGenerator é reescrito no volume, então mudança no arquivo faz rollout.
- NetworkPolicy já libera Prometheus → RabbitMQ 15692; Service `rabbitmq` expõe 15692 (`rabbitmq.yaml:171-173`).
- Alerta DLQ: `sum(...) > 0`, `for: 1m`, `noDataState: OK` — não oscila (gauge de estado, sem `rate`), não dispara com fila vazia.
- Sem segredo no diff (grep por password/secret/token no diff: nada). Sem PII: métricas de fila não carregam payload.
- Nenhum código de aplicação mudou — itens de tenant, transação, ESM e Swagger não se aplicam.

## Não foi possível verificar
- Disparo real do alerta "RabbitMQ fora" parando o broker (exige Prometheus + Grafana de pé por ~3 min; a lógica foi conferida, o comportamento não).
- Render visual do dashboard no navegador.
- `$values.A` no summary: o dev relata o texto renderizado ("1 mensagem(ns)…"); não reproduzi no Grafana.
- Aplicação real no cluster (`kubectl apply -k`); conferido só por leitura dos manifests.
