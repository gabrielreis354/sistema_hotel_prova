#!/usr/bin/env bash
# =============================================================================
# infra_up.sh — Pipeline completo: build → tag → deploy → migrate
# Opção A: Docker / Orquestração Local (Avaliação Técnica Cloud)
# =============================================================================
set -euo pipefail

IMAGE_NAME="sistema-gestao-hotel-backend"
COMPOSE_FILE="docker-compose.yml"
NETWORK_NAME="sistema_hotel_prova_hotel_network"

# ── Cores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Cabeçalho ──────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Sistema de Gestão de Hotel — Infraestrutura Docker"
echo "  Opção A: Docker Compose (Avaliação Técnica Cloud)"
echo "============================================================"
echo ""

# ── Pré-requisitos ─────────────────────────────────────────────────────────
info "Verificando pré-requisitos..."

command -v docker >/dev/null 2>&1  || error "Docker não encontrado. Instale Docker Desktop."
docker compose version >/dev/null 2>&1 || error "Docker Compose plugin não encontrado."

[ -f "$COMPOSE_FILE" ] || error "docker-compose.yml não encontrado. Execute a partir da raiz do projeto."

if [ ! -f ".env" ]; then
    warn ".env não encontrado — copiando de .env.example"
    cp .env.example .env
    warn "Edite .env e defina POSTGRES_PASSWORD e JWT_SECRET antes de continuar."
    error "Defina as variáveis obrigatórias no .env e execute novamente."
fi

# Verificar variáveis obrigatórias
source .env 2>/dev/null || true
[ -n "${POSTGRES_PASSWORD:-}" ] || error "POSTGRES_PASSWORD não definida no .env"
[ -n "${JWT_SECRET:-}" ]        || error "JWT_SECRET não definida no .env"

success "Pré-requisitos verificados."

# ── FASE 1: Build ───────────────────────────────────────────────────────────
VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "build-$(date +%Y%m%d-%H%M%S)")
echo ""
info "=== FASE 1: BUILD DA IMAGEM ==="
info "Versão: $VERSION"
info "Imagem: $IMAGE_NAME:$VERSION"
echo ""

docker build \
    --tag "$IMAGE_NAME:$VERSION" \
    --tag "$IMAGE_NAME:latest" \
    --progress=plain \
    .

success "Build concluído: $IMAGE_NAME:$VERSION"

# Mostrar tamanho da imagem
IMAGE_SIZE=$(docker image inspect "$IMAGE_NAME:latest" --format='{{.Size}}' | awk '{printf "%.0f MB", $1/1024/1024}')
info "Tamanho da imagem: $IMAGE_SIZE (multi-stage build)"

# ── FASE 2: Image Generation (tagging) ─────────────────────────────────────
echo ""
info "=== FASE 2: REGISTRO DE TAGS ==="
docker images "$IMAGE_NAME"

# ── FASE 3: Deploy ─────────────────────────────────────────────────────────
echo ""
info "=== FASE 3: DEPLOY — docker compose up ==="

# Parar serviços anteriores se estiverem rodando (sem apagar volumes)
if docker compose ps --services --filter "status=running" 2>/dev/null | grep -q .; then
    warn "Serviços já em execução — parando para atualizar..."
    docker compose down
fi

docker compose up -d --build=false
success "Serviços iniciados."

# ── Aguardar saúde dos serviços ─────────────────────────────────────────────
echo ""
info "Aguardando serviços ficarem saudáveis..."

WAIT_SEC=0
MAX_WAIT=90

# Aguardar postgres
info "  → postgres (PostgreSQL)..."
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-hotel_user}" -q 2>/dev/null; do
    sleep 2; WAIT_SEC=$((WAIT_SEC + 2))
    [ $WAIT_SEC -ge $MAX_WAIT ] && error "Timeout aguardando postgres. Veja: docker compose logs postgres"
done
success "  postgres healthy"

# Aguardar redis
info "  → redis (Redis)..."
WAIT_SEC=0
until docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
    sleep 2; WAIT_SEC=$((WAIT_SEC + 2))
    [ $WAIT_SEC -ge $MAX_WAIT ] && error "Timeout aguardando redis. Veja: docker compose logs redis"
done
success "  redis healthy"

# Aguardar node_web
info "  → node_web (API Node.js)..."
WAIT_SEC=0
until docker compose exec -T node_web node -e \
    "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))" \
    2>/dev/null; do
    sleep 3; WAIT_SEC=$((WAIT_SEC + 3))
    [ $WAIT_SEC -ge $MAX_WAIT ] && error "Timeout aguardando node_web. Veja: docker compose logs node_web"
done
success "  node_web healthy"

# Aguardar nginx
info "  → nginx (Proxy Reverso)..."
WAIT_SEC=0
until curl -sf http://localhost/health >/dev/null 2>&1; do
    sleep 2; WAIT_SEC=$((WAIT_SEC + 2))
    [ $WAIT_SEC -ge 30 ] && error "Timeout aguardando nginx. Veja: docker compose logs nginx"
done
success "  nginx healthy"

# ── FASE 4: Migrations ─────────────────────────────────────────────────────
echo ""
info "=== FASE 4: MIGRATIONS ==="
docker compose exec -T node_web node command.js migrate
success "Migrations executadas com sucesso."

# ── Status Final ───────────────────────────────────────────────────────────
echo ""
echo "============================================================"
success "INFRAESTRUTURA PRONTA"
echo "============================================================"
echo ""
docker compose ps
echo ""
info "Endpoints:"
info "  API / Sistema:   http://localhost"
info "  Health Check:    http://localhost/health"
info "  Swagger (docs):  http://localhost/api-docs"
echo ""
info "Rede interna (DNS Bridge):"
docker network inspect "$NETWORK_NAME" \
    --format '{{range .Containers}}  • {{.Name}} → {{.IPv4Address}}{{println}}{{end}}' 2>/dev/null \
    || docker network inspect hotel_network \
        --format '{{range .Containers}}  • {{.Name}} → {{.IPv4Address}}{{println}}{{end}}' 2>/dev/null \
    || warn "Inspecione manualmente: docker network inspect hotel_network"
echo ""
info "Volumes persistentes:"
docker volume ls | grep -E "postgres_data|redis_data" || true
echo ""
info "Comandos úteis:"
info "  Logs:     docker compose logs -f"
info "  Parar:    docker compose down"
info "  Limpar:   docker compose down -v   (apaga dados do banco)"
echo ""
echo "============================================================"
