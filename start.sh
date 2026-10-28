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
    echo "  migrate   Executa migrations no cluster (Job com a imagem do backend)"
    echo "  deploy    Atualiza o backend: migrate, rollout e migrate de novo [imagem opcional]"
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
    # Secret jwt-rsa-keys (ADR-006) antes do backend — ver scripts/k8s_garantir_secret_jwt.sh.
    bash scripts/k8s_garantir_secret_jwt.sh
    kubectl apply -k infra/k8s/
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
# Roda o migrate num Job (infra/k8s/jobs/backend-migrate.yaml) com a imagem dada e espera o
# fim. Job, e não `kubectl exec deploy/backend`: o exec usa o código dos pods que já estão no
# ar, e antes de um rollout esse código é o antigo (repasse de 19/10). Código 1 do migrate =
# reservas com dado inválido, listadas no log — tratado como falha (o deploy para aqui).
run_migrate_job() {
    local image="$1" job status
    info "Migrate com a imagem $image..."
    job=$(sed "s|__IMAGE__|$image|" infra/k8s/jobs/backend-migrate.yaml | kubectl create -f - -o name)
    # Sem `kubectl wait`: esperar só por complete ficaria preso até o timeout num Job falho.
    while :; do
        status=$(kubectl get -n "$NS" "$job" -o jsonpath='{.status.succeeded}/{.status.failed}')
        case "$status" in
            1/*) break ;;
            */1) kubectl logs -n "$NS" "$job" --tail=100 || true
                 err "Migrate falhou ($job). Corrija a causa no log acima e rode de novo." ;;
        esac
        sleep 3
    done
    kubectl logs -n "$NS" "$job" --tail=100 || true
    log "Migrate concluído ($job)."
}

backend_image() {
    kubectl get deploy/backend -n "$NS" -o jsonpath='{.spec.template.spec.containers[0].image}'
}

cmd_migrate() {
    check_kubectl
    run_migrate_job "$(backend_image)"
}

# =============================================================================
# Atualização do backend sem janela de dado fora do lugar (repasse de 19/10):
#   1. migrate com a imagem NOVA, antes de os pods novos receberem tráfego;
#   2. rollout e espera terminar;
#   3. migrate de novo: durante o rollout os pods ANTIGOS ainda gravam no formato velho
#      (ex.: consumo em `consumptions`). O migrate é idempotente e só pega esse intervalo.
# Sem imagem, reinicia com a do manifest (tag latest: a imagem local recém-construída).
cmd_deploy() {
    check_kubectl
    local image="${1:-$(backend_image)}"
    run_migrate_job "$image"
    if [ -n "${1:-}" ]; then
        kubectl set image deploy/backend backend="$image" -n "$NS"
    else
        kubectl rollout restart deploy/backend -n "$NS"
    fi
    info "Aguardando o rollout do backend..."
    kubectl rollout status deploy/backend -n "$NS" --timeout=300s
    run_migrate_job "$image"
    log "Backend atualizado com $image."
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
    warn "Download de PDF (URL assinada, RNF-023) só abre pelo tunnel com MINIO_PUBLIC_ENDPOINT=http://localhost:8080"
    warn "no infra/k8s/configmap.yaml (o padrão http://localhost é o do Docker Desktop, porta 80)."
    warn "Depois de editar: kubectl apply -k infra/k8s/ && kubectl rollout restart deploy/backend -n $NS"
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
    deploy)  cmd_deploy "${2:-}" ;;
    seed)    cmd_seed ;;
    test)    cmd_test ;;
    tunnel)  cmd_tunnel ;;
    health)  cmd_health ;;
    help|*)  usage ;;
esac
