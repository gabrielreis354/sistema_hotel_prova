# QA Red Team — analytics-service H.2 (reauditoria delta 3)
**Branch:** feature/analytics-service · **Dev:** Gabriel (executor) · **Base:** develop@a6dc1ea (merge 35cf86f) · **Delta:** 9d797dd..c854f60 · **Data:** 31/10/2026
**Arquivos auditados:** 4: `app/consumer/consumer.js`, `tests/rabbitmq.integration.test.js`, `tests/consumer-resilience.test.js` e SPEC-01 catálogo 1.1.3 (§5.3)
**Achados no escopo:** 2 (🔴 0 · 🟡 1 · 🟢 1) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

O 🟡-A2 está fechado no cenário reproduzido: a mensagem lenta convive com um fluxo de mensagens que pausam e chega à DLQ depois de 15 entregas, sem nenhum `dead letter cycle` no broker. Não houve regressão nas outras reproduções (`misclassified`, `db-down` de 43 s e `stop-*`).

O que sobra é estreito. Quando a drenagem estoura o prazo (`stopTimeoutMs`, padrão 10 s), a mensagem que ainda está em andamento volta a ser devolvida sem decidir nada. Se isso se repete 20 vezes, o broker a descarta (🟡-A3, reproduzido em escala reduzida). O gatilho exige um `apply` mais lento que o prazo de drenagem a cada ciclo. Isso é plausível com o *pool* do Sequelize saturado (`acquire` padrão de 60 s, não configurado em `database/connections/sequelize.js`), mas não acontece numa queda real nem com falhas rápidas.

## As 4 perguntas — saída real

Ambiente: PostgreSQL 17 `pg-qah2b` (5456) e RabbitMQ 4.3.6 `rmq-qah2b` (5696/15696), com a topologia de `infra/k8s/rabbitmq-setup.sh`. Consumidor real na ponta c854f60. Obs.: o RabbitMQ desta máquina passou a falhar com `.erlang.cookie: eacces` depois de uma atualização do Docker Desktop (29.0.1). Rodei com `--user rabbitmq`, o que não muda a fila nem o broker.

**1. `race` (A leva 300 ms; fluxo de F a cada 400 ms, todas falhando com conexão): A chega à DLQ, com 0 `dead letter cycle`.**
```
[1.6s] entrega A: x-delivery-count=undefined previousFailures=0
[6.2s] entrega A: x-delivery-count=10 previousFailures=0
[16.6s] entrega A: x-delivery-count=10 previousFailures=1
...
[47.6s] entrega A: x-delivery-count=10 previousFailures=4
[47.9s] ERROR Analytics: guest.created c9aa4180-… → fila de mensagens mortas (5 tentativas): A conexão
entregas de A: 15 (0,1,…,10,10,10,10,10)
filas no fim: {"q":"0/u0","q.dlq":"66/u0","q.retry":"0/u0"}   ← 65 F + A
broker: grep -c "dead letter cycle" → 0
```
(As linhas "A na DLQ: false / DLQ total: 0" do script vêm de uma leitura feita aos 33 s, antes das tentativas acabarem. A contagem final da fila e o log de A indo para a DLQ são o que vale.)

**2. Sem regressão.**
- `misclassified`: 10 pausas, depois 4 voltas pela fila de espera, e `→ fila de mensagens mortas (5 tentativas)`. Saída: `DLQ: [{"nome":"VENENO","kind":"transient","attempts":5}]`. O evento inocente foi aplicado.
- `db-down`: `docker stop pg-qah2b` por 43 s.
  ```
  [9.7s] WARN … indisponível (connect ECONNREFUSED 127.0.0.1:5456); pausando o consumo.   (2 mensagens em andamento, uma pausa)
  [11.8s] status connecting {"q":"2/u0","q.dlq":"0/u0","q.retry":"0/u0"}
  [53.0s] status connecting {"q":"21/u0","q.dlq":"0/u0","q.retry":"0/u0"}
  [70.5s] INFO Analytics: consumindo analytics.core-events (prefetch 10).
  [71.2s] aplicados 30/30; … q.dlq 0, q.retry 0
  ```
- `stop-*`:
  ```
  stop() durante connect: resolveu | status: stopped | conexão fechada: true
  stop() durante backoff resolveu em 1 ms; status stopped
  stop() com ready() pendurado resolveu em 2008 ms; status stopped
  stop() com mensagem em andamento: 2065 ms; projeção 1; status stopped
  stop() durante reconexão: 1264 ms; status stopped; conexões do analytics abertas 3 s depois: 0
  ```

**3. Invariante de 10 pausas + 5 tentativas.**
- **Com a drenagem terminando no prazo, vale.** São 11 entregas na primeira passagem (contagem de 0 a 9 pausa, a contagem 10 recebe `nack`) mais 4 voltas da fila de espera, ou seja, **15 entregas**. Sobra margem de 5 até o `delivery-limit` 20, ou de 10 devoluções na primeira passagem para as quedas do broker. Medido no `race` e no `misclassified`.
- **Com a drenagem estourando o `stopTimeoutMs`, não há teto.** Ver 🟡-A3: A chegou a 21 entregas e foi descartada.
- O `x-delivery-count` vem **copiado** depois da fila de espera (fica em 10). Não verifiquei se o contador interno do broker segue a partir de 10 numa mensagem pós-espera. Se seguir, sobram 10 devoluções para ela, e uma mensagem pós-espera só é devolvida por estouro de drenagem ou por queda do broker.

**4. Fechamento ordenado com o broker congelado (`docker pause rmq-qah2b`).**
- Pausa por banco fora com o broker congelado por 72 s no meio: **não trava**. Ao descongelar, o laço reconecta em cerca de 3 s e aplica (`[75.2s] consumindo … aplicado: 1; status consuming`).
- `stop()` com o broker congelado: `resolveu em 83276 ms`. Não trava para sempre, mas passa da *grace* do compose (10 s) e do k8s (30 s): é o 🟢-E.

## Achados no escopo

### 🟡-A3 [resiliência / perda silenciosa] Quando a drenagem estoura o prazo, a mensagem ainda em andamento volta sem decidir, e o teto não a protege
**Onde:** `services/analytics-service/app/consumer/consumer.js:208` (`comPrazo(Promise.allSettled([...emAndamento]), stopTimeoutMs)` na pausa) e `database/connections/sequelize.js` (sem `pool.acquire` nem `statement_timeout`, então um `apply` pode levar até 60 s esperando o *pool*)
**Cenário (reproduzido em escala reduzida):** a mesma reprodução `race`, com A levando 1500 ms e `stopTimeoutMs` 500 ms, isto é, A mais lenta que a drenagem.
```
[1.6s] entrega A: x-delivery-count=undefined previousFailures=0
[8.4s] entrega A: x-delivery-count=10 previousFailures=0
[15.0s] entrega A: x-delivery-count=20 previousFailures=0
entregas de A: 21 (0,1,…,20)
filas no fim: {"q":"0/u0","q.dlq":"65/u0","q.retry":"0/u0"}   ← só as 65 F; A sumiu
broker: grep -c "dead letter cycle" → 1
```
Em produção, o equivalente é um `apply` com mais de 10 s enquanto as vizinhas pausam. Isso acontece, por exemplo, com conexões presas e o *pool* (máximo 5, *prefetch* 10) esperando `acquire` por até 60 s, enquanto as conexões novas recebem `ECONNREFUSED` na hora. É o banco "meio no ar" que o próprio §5.3 diz cobrir.
**Regra violada:** catálogo §5.3 v1.1.3 ("Invariante: nenhuma mensagem passa de 10 pausas + 5 tentativas") e CA-01.4.i.
**Correção sugerida (a menor):** na **pausa**, que não tem a pressa do SIGTERM, drenar sem prazo, ou com um prazo maior que o pior `apply`. O prazo curto fica só no `stop()`. Também limitar o `apply` de forma explícita no Sequelize do analytics: `pool: { acquire: 5000 }` e `dialectOptions: { statement_timeout: 5000 }`. Assim todo `apply` termina e a drenagem sempre acaba. Teste: o `race` com A mais lenta que o prazo atual tem de chegar à DLQ.

### 🟢-E [SIGTERM] `stop()` com o broker sem responder leva cerca de 83 s
**Onde:** `consumer.js:282` (`channel.cancel` aguardado sem prazo, que já existia) e `consumer.js:295-297` (`fecharComOrdem`: `channel.close()` espera o *close-ok* sem prazo, o que é novo neste delta)
**Cenário (reproduzido):** com uma mensagem em andamento, o broker é congelado (`docker pause`) e o `stop()` é chamado. Resultado: `resolveu em 83276 ms`, o tempo até o *heartbeat* (30 s) derrubar a conexão. O SIGKILL chega antes, aos 10 s no compose e aos 30 s no k8s. Não há perda: a mensagem sem *ack* volta e cai em `duplicate`.
**Correção sugerida:** envolver `cancel` e `fecharComOrdem` no `stop()` com `comPrazo(…, 2000)` e, estourado o prazo, `conexao.close()` sem esperar o canal.

## O que foi verificado e está correto

- A drenagem da pausa usa o mesmo `emAndamento` do `stop()`. A promessa da própria mensagem que pausa termina logo depois de `onInfrastructureFailure`, então não há *deadlock*. `comPrazo` não rejeita e `fecharComOrdem` captura tudo, então a IIFE da pausa não gera *unhandled rejection*.
- `pausando` é marcado na conexão antes da IIFE, então várias falhas juntas disparam uma única drenagem.
- O teste de integração novo (`🟡-A2`) confere a invariante de forma correta para a mensagem lenta e para cada F, com o broker real.
- **Suíte do analytics na ponta c854f60**: `Test Files 7 passed`, `Tests 95 passed`, 0 skipped. Statements 95,79 %, Branches 89,54 %, `consumer.js` 93,6 %. O core não mudou neste delta.

## Não foi possível verificar

- Se o contador interno de entregas da fila *quorum* zera quando a mensagem é reenfileirada pela fila de espera (o cabeçalho vem copiado).

Ambiente removido ao final (`pg-qah2b`, `rmq-qah2b`), e o `.env.test` foi restaurado. Os scripts (`qah2b_repro.mjs`, modos `race`, `misclassified`, `db-down`, `stop-*`, `stop-broker-paused` e `pause-broker-paused`; variáveis `A_MS`, `STOP_MS` e `TAIL_MS`) ficaram no *scratchpad* da sessão.
