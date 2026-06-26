#!/usr/bin/env bash
# =============================================================================
# infra_up.sh — Pipeline completo: build → deploy → migrate
# Kubernetes (Docker Desktop ou Minikube)
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="sistema-gestao-hotel-backend:latest"
NS="hotel-system"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

echo ""
echo "============================================================"
echo "  Sistema de Gestão de Hotel — Pipeline K8s"
echo "  build → apply → wait → migrate"
echo "============================================================"
echo ""

# ── Pré-requisitos ─────────────────────────────────────────────────────────
info "Verificando pré-requisitos..."
command -v docker  &>/dev/null || error "Docker não encontrado."
command -v kubectl &>/dev/null || error "kubectl não encontrado."
kubectl cluster-info &>/dev/null || error "Cluster Kubernetes não acessível."
success "Pré-requisitos OK."
echo ""

# ── Detectar ambiente: Docker Desktop ou Minikube ──────────────────────────
info "Detectando ambiente Kubernetes..."

if kubectl config current-context 2>/dev/null | grep -q "minikube"; then
    ENV="minikube"
    info "Ambiente: Minikube — build dentro do daemon interno."
    info "Executando: eval \$(minikube docker-env)"
    eval "$(minikube docker-env)"
else
    ENV="docker-desktop"
    info "Ambiente: Docker Desktop — daemon compartilhado com o host."
fi
echo ""

# ── FASE 1: Build da imagem ─────────────────────────────────────────────────
info "=== FASE 1: BUILD ==="
docker build -t "$IMAGE" .
success "Imagem '$IMAGE' construída."
echo ""

# ── FASE 2: Aplicar manifests ───────────────────────────────────────────────
info "=== FASE 2: APPLY ==="
kubectl apply -k k8s/
success "Manifests aplicados no namespace '$NS'."
echo ""

# ── FASE 3: Aguardar pods ───────────────────────────────────────────────────
info "=== FASE 3: WAIT ==="
info "Aguardando pods ficarem prontos (timeout: 120s)..."
kubectl wait --for=condition=ready pod --all -n "$NS" --timeout=120s
success "Todos os pods estão Running e Ready."
kubectl get pods -n "$NS"
echo ""

# ── FASE 4: Migrations ─────────────────────────────────────────────────────
info "=== FASE 4: MIGRATE ==="
kubectl exec -n "$NS" deploy/backend -- node command.js migrate
success "Migrations executadas."
echo ""

# ── Resultado ──────────────────────────────────────────────────────────────
echo "============================================================"
success "Pipeline concluído com sucesso!"
echo ""

if [ "$ENV" = "minikube" ]; then
    info "Minikube — inicie o tunnel para acessar a API:"
    info "  ./start.sh tunnel"
    info "  curl http://localhost:8080/health"
    info ""
    info "Ou use minikube tunnel (porta 80, requer sudo):"
    info "  minikube tunnel"
    info "  curl http://localhost/health"
else
    info "Docker Desktop — API acessível diretamente:"
    info "  curl http://localhost/health"
    info "  http://localhost/api-docs"
fi

echo ""
info "Próximos passos opcionais:"
info "  Seed:   ./start.sh seed"
info "  Status: ./start.sh status"
info "  Logs:   ./start.sh logs"
echo "============================================================"
echo ""
