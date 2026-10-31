#!/usr/bin/env bash
# =============================================================================
# k8s_garantir_secret_analytics.sh — garante o secret `analytics-db` (T-01.4/H.3) antes do apply
#
# [revisão do Weslley] O banco próprio do analytics (infra/k8s/analytics.yaml) e o analytics-service
# leem usuário e senha do secret `analytics-db`. Ele NÃO está no infra/k8s/secret.yaml versionado:
# é criado aqui, por ambiente, com senha aleatória — o mesmo padrão do `jwt-rsa-keys`
# (scripts/k8s_garantir_secret_jwt.sh). Sem ele, os pods do analytics ficam em
# CreateContainerConfigError.
#
# Chamado por scripts/infra_up.sh e ./start.sh up, antes do `kubectl apply -k`. Idempotente:
#   1. aplica o namespace (num cluster novo ele ainda não existe);
#   2. se o secret já existe, não mexe — trocar a senha exige trocar também a do PostgreSQL já
#      inicializado no volume (ALTER ROLE), senão o analytics perde o banco;
#   3. se não existe, cria com usuário `analytics_user` e senha aleatória de 24 bytes.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

NS="hotel-system"

kubectl apply -f infra/k8s/namespace.yaml >/dev/null

if kubectl get secret analytics-db -n "$NS" >/dev/null 2>&1; then
    echo "[OK]    Secret analytics-db já existe no namespace '$NS' — mantido."
    exit 0
fi

SENHA=$(openssl rand -hex 24)
kubectl create secret generic analytics-db \
    --from-literal=POSTGRES_USER=analytics_user \
    --from-literal=POSTGRES_PASSWORD="$SENHA" \
    -n "$NS" >/dev/null
echo "[OK]    Secret analytics-db criado (senha aleatória, só no cluster)."
