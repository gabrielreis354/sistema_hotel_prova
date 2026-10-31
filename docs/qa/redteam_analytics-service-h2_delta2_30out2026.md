# QA Red Team — analytics-service H.2 (reauditoria delta 2)
**Branch:** feature/analytics-service · **Dev:** Gabriel (executor) · **Base:** develop@a6dc1ea (merge 35cf86f) · **Delta:** 8c74407..cb3d7dc · **Data:** 30/10/2026
**Arquivos auditados:** 7: `app/consumer/consumer.js`, `tests/consumer-resilience.test.js`, `tests/rabbitmq.integration.test.js`, `Dockerfile`, `docs/infra/KUBERNETES.md`, SPEC-01 catálogo 1.1.2 (§5.3) e os 2 repasses commitados
**Achados no escopo:** 1 (🔴 0 · 🟡 1 · 🟢 0) · **Repassados:** 0 novos

## Veredito
**APROVADO COM RESSALVAS**

As ressalvas 🟢-B, 🟢-C e 🟢-D da rodada anterior estão fechadas. O 🟡-A ficou fechado **para a mensagem isolada**: a venenosa classificada como conexão agora chega à DLQ e não é mais descartada. Mas a soma "pausas + tentativas" **ainda passa de 20** quando há outras mensagens em andamento. O teto vale para cada mensagem, mas quem fecha a conexão é a pausa de **qualquer** mensagem. Por isso uma mensagem que nunca chega a decidir nada (lenta, em andamento) é devolvida pelas pausas das vizinhas, até o broker descartá-la. Reproduzi com RabbitMQ real (🟡-A2). O impacto é o mesmo do 🟡-A, perda silenciosa fora da DLQ. O gatilho é o mesmo também: banco "meio no ar", não uma queda real, que continua correta. Por isso fica em 🟡.

## As 4 perguntas da rodada — saída real

Ambiente: PostgreSQL 17 `pg-qah2b` (5456) e RabbitMQ 4.3.6 `rmq-qah2b` (5696/15696), com a topologia de `infra/k8s/rabbitmq-setup.sh` e o consumidor real (`createConsumer` + `rabbitConnectFromEnv` + `applyEvent`) na ponta cb3d7dc.

**1. A reprodução do 🟡-A vai para a DLQ: SIM, para a mensagem isolada.** A mensagem sempre lança `08P01`, o `ready()` passa e o teto fica no padrão 10.
```
[1.6s] entrega VENENO: x-delivery-count=undefined x-death=undefined previousFailures=0
...                         (1 a 9)
[3.4s] entrega VENENO: x-delivery-count=10 x-death=undefined previousFailures=0
[13.4s] entrega VENENO: x-delivery-count=10 x-death=[["analytics.core-events.retry","expired",1],["analytics.core-events","rejected",1]] previousFailures=1
...
[43.5s] entrega VENENO: x-delivery-count=10 x-death=[...,["analytics.core-events","rejected",4]] previousFailures=4
[43.5s] ERROR Analytics: guest.created 603ae8e3-… → fila de mensagens mortas (5 tentativas): simulado 08P01
[76.8s] pausas por "infra": 10; inocente aplicado: 1; filas: {"q":"0/u0","q.dlq":"1/u0","q.retry":"0/u0"}
[76.9s] DLQ: [{"nome":"VENENO","kind":"transient","attempts":5}]
```
São 15 entregas no total (10 pausas + 5 tentativas), e o broker não registrou nenhum `dead letter cycle`. Observação: o `x-delivery-count` **vem copiado** depois da volta pela fila de espera (fica em 10). Não importa para a mensagem isolada, porque com `previousFailures > 0` ela não pausa mais.

**2. Queda real do banco, com o `ready()` falhando: continua certa.** O `docker stop pg-qah2b` durou 44 s, com 1 evento publicado a cada 2 s.
```
[7.8s] WARN … não aplicado — banco do analytics indisponível (connect ECONNREFUSED 127.0.0.1:5456); pausando o consumo.
[8.8s] WARN Analytics: consumidor aguardando (connect ECONNREFUSED 127.0.0.1:5456); tentando de novo.
[12.0s] status connecting {"q":"2/u0","q.dlq":"0/u0","q.retry":"0/u0"}
[53.6s] status connecting {"q":"21/u0","q.dlq":"0/u0","q.retry":"0/u0"}
[69.1s] INFO Analytics: consumindo analytics.core-events (prefetch 10).
[69.9s] aplicados 30/30; status consuming; filas: {… "q.dlq":"0/u0","q.retry":"0/u0"}
```
Houve uma pausa só. Nenhuma mensagem passou pela fila de espera nem foi para a DLQ, e nenhum descarte novo apareceu no log do broker. O `q 27` do final é atraso da estatística da API de gestão; a projeção tem os 30.

**3. `stop()` sem regressão.**
```
stop() durante connect:                 resolveu | status: stopped | conexão fechada: true   (era TRAVOU na rodada anterior)
stop() durante backoff (ready falhando): resolveu em 1 ms; status stopped
stop() com ready() pendurado:           resolveu em 2002 ms (stopTimeoutMs 2000); status stopped
stop() com mensagem em andamento:       2020 ms; projeção 1; status stopped; filas q 0, dlq 0, retry 0
stop() durante reconexão (broker caiu, connect lento): 1272 ms; status stopped; conexões do analytics abertas 3 s depois: 0
```
O `connect()` ou `ready()` que resolve depois do prazo encontra `running = false` e sai (`consumer.js:208-214`). A conexão que chega tarde é fechada.

**4. "Pausas + tentativas" nunca passam de 20? NÃO.** Ver 🟡-A2.

## Achados no escopo

### 🟡-A2 [resiliência / perda silenciosa] Uma mensagem em andamento é devolvida pela pausa das vizinhas sem passar pelo próprio teto, e o broker a descarta na 21ª entrega
**Onde:** `services/analytics-service/app/consumer/consumer.js:188-193` (`pausarPorInfraestrutura` fecha a conexão **na hora**, com as outras até 9 mensagens ainda em andamento) e `consumer.js:135` (o teto `deliveryCount(msg) < maxInfraRedeliveries` só é avaliado quando **a própria** mensagem falha)
**Cenário (reproduzido):** a mensagem A sempre falha com erro de conexão, mas leva 300 ms, como uma conexão que espera o *pool*. Junto chegam mensagens novas F, uma a cada 400 ms, que falham com conexão na hora, como o `ECONNREFUSED`. Cada F com contagem abaixo de 10 pausa e fecha a conexão antes de A terminar. A é devolvida sem `rejected` a cada ciclo e nunca chega ao `tratarFalha`.
```
[1.6s] entrega A: x-delivery-count=undefined previousFailures=0
[3.3s] entrega A: x-delivery-count=10 previousFailures=0
[5.0s] entrega A: x-delivery-count=20 previousFailures=0
[33.9s] entregas de A: 21 (0,1,…,20); A na DLQ: false; F publicadas: 64; DLQ total: 0
broker: Message dropped because the following list of queues … contains a dead letter cycle without reason 'rejected'.   (2×)
```
A some sem passar pela DLQ. O log do broker teve **2** descartes: além de A, uma F cujo `nack` (com contagem de 10 ou mais) perdeu a corrida para o fechamento disparado por outra F. Não é preciso que A seja lenta. Basta que, a cada ciclo, alguma mensagem com contagem abaixo de 10 falhe antes, o que é o normal com tráfego chegando e o banco meio no ar. O teste de integração novo não pega isso porque publica uma mensagem por vez.
**Regra violada:** catálogo §5.3 v1.1.2, que promete "acima do teto … DLQ na 5ª tentativa" e "evita o descarte silencioso", e CA-01.4.i.
**Correção sugerida (a menor):** a pausa precisa **drenar antes de fechar**, como o `stop()` já faz. No `pausarPorInfraestrutura`: `channel.cancel(consumerTag)`, depois `await comPrazo(Promise.allSettled([...emAndamento]), stopTimeoutMs)`, e só então `close()`. Assim cada mensagem em andamento decide sozinha (*ack*, *nack* `rejected` acima do teto, ou pausa), e uma devolução só soma para quem escolheu pausar. Como cada mensagem pausa no máximo 10 vezes, a soma fica limitada a 10 + 5. Teste de integração: a mensagem A lenta e um fluxo de mensagens novas que falham rápido (o modo `race` do script da auditoria), com A obrigada a chegar à DLQ. Complemento de infra, já repassado ao Weslley: um `delivery-limit` explícito alto dá folga, mas não substitui a drenagem.

## O que foi verificado e está correto

- **🟢-B fechado**: os 5 cenários de `stop()` acima.
- **🟢-C fechado**: `backoff = 0` quando o consumo volta (`consumer.js:228`), e o aumento só vale para falhas seguidas de `ready()`/`connect()`. Na queda de 44 s, a volta veio sem a espera acumulada.
- **🟢-D fechado**: `docs/infra/KUBERNETES.md` traz uma tabela de readiness e liveness, e o Swarm é citado. O `Dockerfile` ganhou comentário no `HEALTHCHECK`.
- **Teto da mensagem isolada**: `previousFailures === 0 && deliveryCount < 10`. A mensagem que já voltou da fila de espera nunca pausa, então uma mensagem venenosa sozinha não fica em laço. São 15 entregas no total, e o teste de integração (`TETO_INFRA + MAX_ATTEMPTS` chamadas, DLQ `transient`/5) confere isso com o broker real.
- **Catálogo 1.1.2 (§5.3)**: o texto bate com o código. A ressalva sobre o Weslley é coerente com o repasse commitado em 47e7fb8.
- **Suíte do analytics na ponta cb3d7dc**: `Test Files 7 passed`, `Tests 93 passed`, 0 skipped (com a integração real do RabbitMQ). Statements 95,4 %, Branches 89,44 %, `consumer.js` 92,63 %. O core não mudou neste delta: vale a rodada anterior, com 1006 testes.

## Não foi possível verificar

- Se o RabbitMQ zera o contador **interno** de entregas quando a mensagem volta da fila de espera, já que o cabeçalho vem copiado com 10. Só importa para uma mensagem pós-espera devolvida por vizinhas, e a correção do 🟡-A2 tira esse caminho.

Ambiente removido ao final (`pg-qah2b`, `rmq-qah2b`), e o `.env.test` do analytics foi restaurado. Os scripts de reprodução (`qah2b_repro.mjs`, modos `misclassified`, `race`, `db-down` e `stop-*`) ficaram no *scratchpad* da sessão, fora do repositório.
