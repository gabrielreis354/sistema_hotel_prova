# Repasses para o Weslley — 29/10/2026

Origem: reauditoria delta do qa-redteam da `feature/analytics-service` (H.2), relatório
`docs/qa/redteam_analytics-service-h2_delta_24out2026.md`. Área: topologia do RabbitMQ
(`infra/k8s/rabbitmq-setup.sh`, dono pelo §3.3/§7 da divisão de trabalho).

### 🟡 [infra] A fila *quorum* `analytics.core-events` usa o `delivery-limit` padrão (20), e a mensagem que passa dele some sem aviso
**Onde:** `infra/k8s/rabbitmq-setup.sh:42-43` (declaração de `analytics.core-events` sem `x-delivery-limit`)
**Cenário (reproduzido, RabbitMQ 4.3.6, topologia oficial):** o consumidor do analytics, com o banco
"fora do ar", fecha a conexão sem *ack* nem *nack* (catálogo §5.3, v1.1). Cada devolução soma 1 no
`x-delivery-count` da fila *quorum*. Na 21ª entrega, o broker faz *dead-letter* com motivo
`delivery_limit` para `analytics.retry`. A fila de espera, ao expirar, devolve a mensagem a
`analytics.core-events`. O RabbitMQ vê um ciclo de *dead-letter* sem nenhum `rejected` e **descarta
a mensagem**. O log do broker registra: `Message dropped because the following list of queues ...
contains a dead letter cycle without reason 'rejected'`. As três filas terminaram vazias, sem nada
na DLQ.
**Regra violada:** catálogo §5.3 ("perder o evento é pior que repeti-lo"), SPEC-01 CA-01.4.i (o
que falha vai para a DLQ, não some).
**Correção sugerida (parte da infra):** definir o `delivery-limit` de forma explícita por *policy*.
Argumento de fila não muda numa fila já declarada. Também não deixar que o *dead-letter* por
`delivery_limit` volte em ciclo: ou a fila principal manda para `analytics.dlx`, ou o limite fica
alto e o consumidor se encarrega do teto (ver o achado 🟡-A do relatório, que é do dono da branch).
Combinar com o repasse de 23/10 (`at-least-once`), porque os dois mexem nos mesmos argumentos da
fila.
