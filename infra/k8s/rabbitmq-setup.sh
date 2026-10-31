#!/bin/sh
# Topologia e credenciais do RabbitMQ (T-01.4/H.1, CA-01.4.e e CA-01.3.d) — contrato no catálogo
# de eventos v1.0 (docs/specs/anexos/SPEC-01-catalogo-eventos.md §3 e §8). Idempotente: roda a cada
# subida — no compose, pelo serviço `rabbitmq-setup`; no k8s, pelo contêiner `setup` do pod.
#
# Quem declara é o ADMINISTRADOR, aqui e só aqui: os serviços não têm permissão de `configure`.
#   - core     → só publica na exchange do core
#   - analytics → só lê a própria fila e manda para a fila de mensagens mortas; não publica na
#                exchange do core, então não consegue fabricar evento de nenhum hotel
set -eu

: "${RABBITMQ_API_HOST:=localhost}"
: "${RABBITMQ_DEFAULT_USER:?defina RABBITMQ_DEFAULT_USER}"
: "${RABBITMQ_DEFAULT_PASS:?defina RABBITMQ_DEFAULT_PASS}"
: "${RABBITMQ_CORE_USER:?defina RABBITMQ_CORE_USER}"
: "${RABBITMQ_CORE_PASSWORD:?defina RABBITMQ_CORE_PASSWORD}"
: "${RABBITMQ_ANALYTICS_USER:?defina RABBITMQ_ANALYTICS_USER}"
: "${RABBITMQ_ANALYTICS_PASSWORD:?defina RABBITMQ_ANALYTICS_PASSWORD}"

adm() {
    rabbitmqadmin --non-interactive -H "$RABBITMQ_API_HOST" -P 15672 \
        -u "$RABBITMQ_DEFAULT_USER" -p "$RABBITMQ_DEFAULT_PASS" "$@" >/dev/null
}

tentativas=0
until adm show overview 2>/dev/null; do
    tentativas=$((tentativas + 1))
    if [ "$tentativas" -ge 60 ]; then
        echo "rabbitmq-setup: API do RabbitMQ não respondeu em $RABBITMQ_API_HOST:15672 (ou a credencial de administrador está errada)." >&2
        exit 1
    fi
    sleep 2
done

# Exchanges (§3)
adm declare exchange --name gesway.core.events --type topic  --durable true --auto-delete false
adm declare exchange --name analytics.retry    --type fanout --durable true --auto-delete false
adm declare exchange --name analytics.requeue  --type fanout --durable true --auto-delete false
adm declare exchange --name analytics.dlx      --type fanout --durable true --auto-delete false

# Filas (§3): a do analytics manda o que falhou para a espera de 10 s, que devolve só a ela
adm declare queue --name analytics.core-events       --type quorum  --durable true --auto-delete false \
    --arguments '{"x-dead-letter-exchange":"analytics.retry"}'
adm declare queue --name analytics.core-events.retry --type classic --durable true --auto-delete false \
    --arguments '{"x-message-ttl":10000,"x-dead-letter-exchange":"analytics.requeue"}'
adm declare queue --name analytics.core-events.dlq   --type quorum  --durable true --auto-delete false

# Garantias de entrega da fila do analytics (§5.3), por POLICY: argumento de fila não muda numa fila
# já declarada, e a policy vale também para a que já existe no volume, sem recriar.
#   - dead-letter-strategy at-least-once: o padrão da quorum (at-most-once) descarta sem aviso a
#     mensagem em nova tentativa se a fila de espera não a aceitar (nó reiniciando, alarme de memória
#     ou disco). O at-least-once só vale com overflow reject-publish (repasse de 23/10).
#   - delivery-limit explícito e bem acima do teto do consumidor (10 entregas, consumer.js): quem
#     desvia para a DLQ é o consumidor, com 'rejected' no x-death. No limite do broker o dead-letter
#     sai sem 'rejected', volta pela fila de espera e o RabbitMQ descarta o ciclo (repasse de 29/10).
adm declare policy --name analytics-core-events --pattern '^analytics\.core-events$' \
    --apply-to quorum_queues --priority 10 \
    --definition '{"dead-letter-strategy":"at-least-once","overflow":"reject-publish","delivery-limit":50}'

adm declare binding --source gesway.core.events --destination-type queue --destination analytics.core-events       --routing-key '#'
adm declare binding --source analytics.retry    --destination-type queue --destination analytics.core-events.retry --routing-key ''
adm declare binding --source analytics.requeue  --destination-type queue --destination analytics.core-events       --routing-key ''
adm declare binding --source analytics.dlx      --destination-type queue --destination analytics.core-events.dlq   --routing-key ''

# Usuários por serviço, com menor privilégio (§8). Sem tags: nenhum acessa a UI de gestão.
adm declare user --name "$RABBITMQ_CORE_USER" --password "$RABBITMQ_CORE_PASSWORD" --tags ""
adm declare permissions --username "$RABBITMQ_CORE_USER" \
    --configure '^$' --write '^gesway\.core\.events$' --read '^$'

adm declare user --name "$RABBITMQ_ANALYTICS_USER" --password "$RABBITMQ_ANALYTICS_PASSWORD" --tags ""
adm declare permissions --username "$RABBITMQ_ANALYTICS_USER" \
    --configure '^$' --write '^analytics\.dlx$' --read '^analytics\.core-events(\.dlq)?$'

echo "rabbitmq-setup: topologia do catálogo e usuários $RABBITMQ_CORE_USER / $RABBITMQ_ANALYTICS_USER prontos."
