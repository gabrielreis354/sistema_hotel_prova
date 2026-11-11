# QA Red Team — analytics-service H.2 (verificação estreita, delta 4)
**Branch:** feature/analytics-service · **Dev:** Gabriel (executor) · **Delta:** f3789e8..7387d26 · **Data:** 31/10/2026
**Escopo:** verificação estreita do 🟡-A3 e do 🟢-E da reauditoria delta 3, mais uma regressão rápida da queda real do banco. Não é auditoria completa. Arquivos lidos: `app/consumer/consumer.js` e `database/connections/sequelize.js`.
**Achados novos:** 0 · **Repassados:** 0

## Veredito
**APROVADO**

Os 4 itens pedidos passam. Reproduzi com PostgreSQL 17 (`pg-qah2b`:5456) e RabbitMQ 4.3.6 (`rmq-qah2b`:5696), com a topologia de `infra/k8s/rabbitmq-setup.sh` e o consumidor real na ponta 7387d26.

## 1. 🟡-A3: `race` com `A_MS=1500 STOP_MS=500`
É o mesmo cenário que derrubava A na rodada 3. Agora a pausa drena com `pauseDrainTimeoutMs` (60 s), e o `stopTimeoutMs` 500 ms só vale no `stop()`.
```
[1.6s] entrega A: x-delivery-count=undefined previousFailures=0
[18.3s] entrega A: x-delivery-count=10 previousFailures=0
[30.4s] entrega A: x-delivery-count=10 previousFailures=1
[65.0s] entrega A: x-delivery-count=10 previousFailures=4
[66.5s] ERROR Analytics: guest.created 2b2fb63f-… → fila de mensagens mortas (5 tentativas): A conexão
entregas de A: 15 (0,1,2,3,4,5,6,7,8,9,10,10,10,10,10)
filas no fim: {'analytics.core-events': 0, 'analytics.core-events.dlq': 66, 'analytics.core-events.retry': 0}   ← 65 F + A
dead letter cycle: 0
```
A chegou à DLQ com **15 entregas = teto 10 + 5 tentativas**. Na rodada 3 eram 21 entregas e um descarte. (A linha "A na DLQ: false" do script vem de uma leitura aos 33 s, antes das tentativas.)

## 2. 🟢-E: `stop-broker-paused`
```
[2.4s] PAUSE-AGORA                      (docker pause rmq-qah2b)
[10.4s] stop() com broker congelado: resolveu em 4005 ms; status stopped
```
Resolveu em 4,0 s (`brokerTimeoutMs` de 2 s no cancel mais 2 s no close). Na rodada 3 levava 83,3 s. Fica dentro da *grace* do compose, que é de 10 s.

## 3. Regressão: `db-down` (`docker stop pg-qah2b` por 44 s)
```
[9.9s] WARN … não aplicado — banco do analytics indisponível (connect ECONNREFUSED 127.0.0.1:5456); pausando o consumo.
[11.0s] WARN Analytics: consumidor aguardando (connect ECONNREFUSED 127.0.0.1:5456); tentando de novo.
[12.0s] status connecting {"q":"0/u0","q.dlq":"0/u0","q.retry":"0/u0"}
[53.2s] status connecting {"q":"21/u0","q.dlq":"0/u0","q.retry":"0/u0"}
[70.8s] INFO Analytics: consumindo analytics.core-events (prefetch 10).
[71.6s] aplicados 30/30; status consuming; filas: {… "q.dlq":"0/u0","q.retry":"0/u0"}
dead letter cycle: 0
```
Pausou uma vez. Nada foi para a fila de espera nem para a DLQ, e os 30 eventos foram aplicados quando o banco voltou.

## 4. `statement_timeout` × queda real do banco (leitura do diff)
- **Onde o limite age.** O `statement_timeout` (`dialectOptions`, 5 s) é aplicado **pelo servidor** a um comando que está rodando, e produz `57014`. O código deixa `57014` de propósito fora de `SQLSTATE_CONEXAO` (`consumer.js:70-72`), então ele conta tentativa.
- **Por que a queda real não passa por ali.** Nela, as falhas são `ECONNREFUSED` (`SequelizeConnectionRefusedError`) ou `57P01` (*admin shutdown*, no `docker stop`), as duas na *allowlist* de infraestrutura. Não existe comando em execução para o servidor cancelar, então não sai `57014`. A reprodução 3 confirma isso: só aparecem `ECONNREFUSED` e a pausa.
- **`pool.acquire` de 5 s.** Com o banco fora, a criação da conexão falha na hora, com `ECONNREFUSED`. Com o *pool* esgotado, sai `SequelizeConnectionAcquireTimeoutError`, que já era infraestrutura (pausa com teto). O `ready()` (`SELECT 1`) não é afetado. `msDoEnv` cai no padrão de 5 s quando o valor do env é inválido, então o limite nunca fica desligado.
- O pior `apply` passa a levar cerca de 10 s (5 s de *acquire* mais 5 s de comando), bem abaixo do `pauseDrainTimeoutMs` de 60 s.

## Pendências pós-merge (🟢, sem reprodução, não bloqueiam)
- Uma rede particionada sem RST (banco sumindo sem fechar o TCP) não gera `57014`, porque o servidor não alcança o cliente, e o `pg` não tem `query_timeout` do lado do cliente. Um `apply` nessa situação fica preso até o *keepalive* do TCP. A pausa desiste aos 60 s e a mensagem volta sem decidir. É o mesmo mecanismo do 🟡-A3, só que exige uma partição de rede longa e repetida. Sugestão: `dialectOptions.query_timeout` (do lado do cliente) com o mesmo valor.

## Suíte
Analytics na ponta 7387d26: `Test Files 8 passed`, `Tests 104 passed`, com RabbitMQ real. Statements 95,66 %.

Ambiente removido ao final (`pg-qah2b`, `rmq-qah2b`), e o `.env.test` foi restaurado.
