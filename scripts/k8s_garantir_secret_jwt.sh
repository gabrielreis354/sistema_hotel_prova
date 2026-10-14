#!/usr/bin/env bash
# =============================================================================
# k8s_garantir_secret_jwt.sh — garante o secret `jwt-rsa-keys` (ADR-006) antes do backend
#
# O backend.yaml monta o secret `jwt-rsa-keys` em /app/keys. Sem ele, os pods do backend
# ficam presos em ContainerCreating e o `kubectl wait` do deploy estoura com uma mensagem de
# timeout que não diz o motivo. O secret NÃO está no infra/k8s/secret.yaml versionado — a
# chave privada nunca entra no repositório.
#
# Chamado por scripts/infra_up.sh e ./start.sh up, antes do `kubectl apply -k`. Idempotente:
#   1. aplica o namespace (o secret precisa dele — num cluster novo ele ainda não existe);
#   2. se o secret já existe, não mexe (trocar a chave é decisão explícita, ver README);
#   3. se não existe e há chaves em services/core-service/keys/, cria o secret com elas;
#   4. se não há chaves, aborta com o comando para gerá-las.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

NS="hotel-system"
KEYS_DIR="services/core-service/keys"
PRIVATE="$KEYS_DIR/jwt-private.pem"
PUBLIC="$KEYS_DIR/jwt-public.pem"

kubectl apply -f infra/k8s/namespace.yaml >/dev/null

if kubectl get secret jwt-rsa-keys -n "$NS" >/dev/null 2>&1; then
    echo "[OK]    Secret jwt-rsa-keys já existe no namespace '$NS' — mantido."
    exit 0
fi

if [ -f "$PRIVATE" ] && [ -f "$PUBLIC" ]; then
    # Os nomes das chaves do secret precisam ser exatamente jwt-private.pem/jwt-public.pem:
    # é o que o backend.yaml monta em /app/keys/ e o que JWT_*_KEY_PATH aponta.
    kubectl create secret generic jwt-rsa-keys \
        --from-file=jwt-private.pem="$PRIVATE" \
        --from-file=jwt-public.pem="$PUBLIC" \
        -n "$NS" >/dev/null
    echo "[OK]    Secret jwt-rsa-keys criado a partir de $KEYS_DIR."
    exit 0
fi

echo "[ERRO]  Secret jwt-rsa-keys não existe no namespace '$NS' e não há chaves em $KEYS_DIR." >&2
echo "        Gere o par RS256 do JWT e rode de novo:" >&2
echo "          node services/core-service/scripts/gerar_chaves_jwt.js" >&2
exit 1
