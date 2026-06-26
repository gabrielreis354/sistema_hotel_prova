#!/usr/bin/env bash
# =============================================================================
# start.sh — Utilitário de operação do Sistema de Gestão de Hotel (Kubernetes)
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }

NS="hotel-system"

# =============================================================================
usage() {
    echo ""
    echo "Uso: ./start.sh <comando>"
    echo ""
    echo "Comandos:"
    echo "  up        Aplica os manifests K8s e aguarda pods ficarem prontos"
    echo "  down      Remove o namespace hotel-system (destrói tudo)"
    echo "  status    Mostra pods, services e deployments"
    echo "  logs      Streaming de logs do backend (ctrl+c para sair)"
    echo "  migrate   Executa migrations no cluster"
    echo "  seed      Aplica o seed de 165 registros no banco"
    echo "  test      Expõe postgres via port-forward e roda a suite de testes"
    echo "  tunnel    Inicia port-forward nginx → localhost:8080"
    echo "  health    Verifica o endpoint /health (requer tunnel ativo)"
    echo "  help      Mostra esta mensagem"
    echo ""
}

# =============================================================================
check_kubectl() {
    command -v kubectl &>/dev/null || err "kubectl não encontrado. Instale o kubectl."
    kubectl cluster-info &>/dev/null || err "Cluster Kubernetes não está acessível. Verifique se o Docker Desktop ou Minikube está rodando."
}

# =============================================================================
cmd_up() {
    check_kubectl
    info "Aplicando manifests Kubernetes (namespace: $NS)..."
    kubectl apply -k k8s/
    echo ""
    info "Aguardando todos os pods ficarem prontos (timeout: 120s)..."
    kubectl wait --for=condition=ready pod --all -n "$NS" --timeout=120s
    echo ""
    log "Ambiente K8s no ar."
    echo ""
    info "Para acessar a API:"
    info "  Docker Desktop: curl http://localhost/health"
    info "  Minikube:       ./start.sh tunnel  →  curl http://localhost:8080/health"
}

# =============================================================================
cmd_down() {
    check_kubectl
    warn "Isso vai destruir o namespace '$NS' e todos os seus recursos (incluindo dados do banco)."
    read -rp "Confirma? (s/N): " confirm
    [[ "$confirm" =~ ^[sS]$ ]] || { info "Cancelado."; exit 0; }
    kubectl delete namespace "$NS" --ignore-not-found
    log "Namespace '$NS' removido."
}

# =============================================================================
cmd_status() {
    check_kubectl
    info "=== Pods ==="
    kubectl get pods -n "$NS"
    echo ""
    info "=== Services ==="
    kubectl get services -n "$NS"
    echo ""
    info "=== Deployments / StatefulSets ==="
    kubectl get deployments,statefulsets -n "$NS"
}

# =============================================================================
cmd_logs() {
    check_kubectl
    info "Streaming de logs do backend (ctrl+c para sair)..."
    kubectl logs -n "$NS" -l app=backend -f --prefix --max-log-requests=3
}

# =============================================================================
cmd_migrate() {
    check_kubectl
    info "Executando migrations no cluster..."
    kubectl exec -n "$NS" deploy/backend -- node command.js migrate
    log "Migrations executadas."
}

# =============================================================================
cmd_seed() {
    check_kubectl
    [ -f seed/seed_hotels.sql ] || err "seed/seed_hotels.sql não encontrado."
    info "Aplicando seed (165 registros — Hotel Aurora + Pousada Sol)..."
    kubectl exec -n "$NS" -i statefulset/postgres -- \
        psql -U hotel_user -d gestao_hotel < seed/seed_hotels.sql
    log "Seed aplicado. Login: admin@aurora.example / senha123 (subdomain: aurora)"
}

# =============================================================================
cmd_test() {
    check_kubectl
    command -v node &>/dev/null || err "Node.js não encontrado. Instale Node.js 24."

    info "Abrindo port-forward postgres → localhost:5432..."
    kubectl port-forward -n "$NS" svc/postgres 5432:5432 &
    PF_PID=$!
    trap "kill $PF_PID 2>/dev/null" EXIT
    sleep 2

    info "Rodando suite de testes..."
    npm test
}

# =============================================================================
cmd_tunnel() {
    check_kubectl
    info "Port-forward nginx → localhost:8080 (ctrl+c para encerrar)..."
    info "Acesse: http://localhost:8080/health  |  http://localhost:8080/api-docs"
    kubectl port-forward -n "$NS" svc/nginx 8080:80
}

# =============================================================================
cmd_health() {
    BASE="${BASE_URL:-http://localhost:8080}"
    info "Verificando $BASE/health ..."
    curl -s "$BASE/health" | python3 -m json.tool 2>/dev/null || curl -s "$BASE/health"
    echo ""
}

# =============================================================================
case "${1:-help}" in
    up)      cmd_up ;;
    down)    cmd_down ;;
    status)  cmd_status ;;
    logs)    cmd_logs ;;
    migrate) cmd_migrate ;;
    seed)    cmd_seed ;;
    test)    cmd_test ;;
    tunnel)  cmd_tunnel ;;
    health)  cmd_health ;;
    help|*)  usage ;;
esac
