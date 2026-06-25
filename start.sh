
#!/usr/bin/env bash
# =============================================================================
# start.sh — Script de inicializacao do Sistema de Gestao de Hotel
# Stack: Node.js 24, Express 4, Sequelize 6, PostgreSQL 17, Redis 7, Nginx
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")"

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[ERRO]${NC} $1"; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }

# Detectar docker compose (v2) ou docker-compose (v1)
if docker compose version &>/dev/null; then
    DC="docker compose"
elif command -v docker-compose &>/dev/null; then
    DC="docker-compose"
else
    DC=""
fi

# =============================================================================
# Funcao: mostrar uso
# =============================================================================
usage() {
    echo ""
    echo "Uso: ./start.sh [OPCAO]"
    echo ""
    echo "Opcoes:"
    echo "  docker       Sobe o ambiente completo via Docker Compose (4 servicos)"
    echo "  local        Sobe o backend localmente (requer PostgreSQL e Redis rodando)"
    echo "  setup-db     Cria banco, role, extensoes e roda migrations + seed"
    echo "  seed         Roda apenas o seed de dados (165 registros)"
    echo "  test         Roda a suite de testes (78 testes de integracao)"
    echo "  stop         Para e remove os containers Docker"
    echo "  logs         Mostra logs dos containers"
    echo "  status       Mostra status dos containers"
    echo "  k8s          Aplica manifests Kubernetes (namespace hotel-system)"
    echo "  help         Mostra esta mensagem"
    echo ""
}

# =============================================================================
# Verificar .env
# =============================================================================
check_env() {
    if [ ! -f .env ]; then
        warn "Arquivo .env nao encontrado."
        info "Criando .env a partir de .env.example..."
        cp .env.example .env
        warn "EDITE o .env e defina JWT_SECRET antes de continuar!"
        exit 1
    fi

    if grep -q "sua_chave_secreta_aqui" .env 2>/dev/null; then
        err "JWT_SECRET ainda esta com valor padrao no .env"
        warn "Defina um valor seguro para JWT_SECRET antes de iniciar."
        exit 1
    fi

    log ".env encontrado e validado."
}

# =============================================================================
# Docker Compose — ambiente completo (4 servicos)
# Postgres (:5432) + Redis (:6379) + Node.js (:3000) + Nginx (:80)
# =============================================================================
start_docker() {
    info "Subindo ambiente Docker Compose..."
    info "Servicos: PostgreSQL 17 | Redis 7 | Node.js 24 | Nginx"
    echo ""

    check_env

    if [ -z "$DC" ]; then
        err "Docker Compose nao encontrado. Instale docker compose (v2) ou docker-compose (v1)."
        exit 1
    fi

    $DC build
    $DC up -d

    info "Aguardando healthchecks..."
    sleep 5

    echo ""
    log "Ambiente Docker iniciado com sucesso!"
    echo ""
    info "Endpoints:"
    info "  API:         http://localhost/api"
    info "  Swagger:     http://localhost/api-docs"
    info "  Health:      http://localhost/health"
    echo ""
    info "Para ver os logs: ./start.sh logs"
    info "Para parar:       ./start.sh stop"
}

# =============================================================================
# Local — backend sem Docker (requer Postgres + Redis ja rodando)
# =============================================================================
start_local() {
    info "Iniciando backend localmente..."
    echo ""

    check_env

    if ! command -v node &> /dev/null; then
        err "Node.js nao encontrado. Instale Node.js 24."
        exit 1
    fi

    NODE_VERSION=$(node -v)
    log "Node.js: $NODE_VERSION"

    if [ ! -d node_modules ]; then
        info "Instalando dependencias..."
        npm install
    fi

    log "Dependencias instaladas."
    info "Iniciando servidor na porta ${NODE_WEB_PORT:-3000}..."
    echo ""

    npm start
}

# =============================================================================
# Setup do banco — cria role, banco, extensoes, migrations e seed
# =============================================================================
setup_db() {
    info "Configurando banco de dados..."
    echo ""

    PASSWORD='Ew8/kDNfo46M3~*~PV;dv273N!pU'

    # Criar role hotel_app se nao existir
    sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'hotel_app'" | grep -q 1 || \
        sudo -u postgres psql -c "CREATE ROLE hotel_app WITH LOGIN PASSWORD '$PASSWORD';"

    sudo -u postgres psql -c "ALTER ROLE hotel_app WITH LOGIN PASSWORD '$PASSWORD';"
    log "Role hotel_app configurada."

    # Criar banco se nao existir
    sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'hotel_db'" | grep -q 1 || \
        sudo -u postgres createdb hotel_db
    log "Banco hotel_db verificado."

    # Permissoes
    sudo -u postgres psql -d hotel_db -c "GRANT CONNECT ON DATABASE hotel_db TO hotel_app;"
    sudo -u postgres psql -d hotel_db -c "GRANT USAGE, CREATE ON SCHEMA public TO hotel_app;"
    sudo -u postgres psql -d hotel_db -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hotel_app;"
    sudo -u postgres psql -d hotel_db -c "GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO hotel_app;"
    sudo -u postgres psql -d hotel_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hotel_app;"
    sudo -u postgres psql -d hotel_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO hotel_app;"
    log "Permissoes concedidas."

    # Extensoes
    sudo -u postgres psql -d hotel_db -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
    sudo -u postgres psql -d hotel_db -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"
    log "Extensoes uuid-ossp e btree_gist ativadas."

    # Instalar dependencias
    npm install
    log "Dependencias instaladas."

    # Migrations (Sequelize sync)
    node command.js migrate
    log "Migrations executadas."

    # Seed
    npm run seed:db
    log "Seed aplicado (165 registros em 2 tenants)."

    echo ""
    log "Banco de dados configurado com sucesso!"
}

# =============================================================================
# Seed — apenas dados de teste (2 tenants, 165 registros)
# =============================================================================
run_seed() {
    info "Aplicando seed de dados..."
    npm run seed:db
    log "Seed aplicado: 2 tenants (Hotel Aurora + Pousada Sol), 165 registros."
}

# =============================================================================
# Testes — 78 testes de integracao com banco real
# =============================================================================
run_tests() {
    info "Rodando suite de testes (Vitest + Supertest)..."
    echo ""
    npm test
}

# =============================================================================
# Docker Compose — parar containers
# =============================================================================
stop_docker() {
    info "Parando containers..."
    $DC down
    log "Containers parados e removidos."
}

# =============================================================================
# Docker Compose — logs
# =============================================================================
show_logs() {
    $DC logs -f --tail=100
}

# =============================================================================
# Docker Compose — status
# =============================================================================
show_status() {
    info "Status dos containers:"
    echo ""
    $DC ps
}

# =============================================================================
# Kubernetes — aplicar manifests no cluster
# =============================================================================
apply_k8s() {
    info "Aplicando manifests Kubernetes..."
    echo ""

    if ! command -v kubectl &> /dev/null; then
        err "kubectl nao encontrado. Instale o kubectl."
        exit 1
    fi

    warn "IMPORTANTE: Edite k8s/secret.yaml e substitua os placeholders antes de aplicar!"
    echo ""

    kubectl apply -k k8s/
    log "Manifests aplicados no namespace hotel-system."
    echo ""
    info "Verificando pods:"
    kubectl get pods -n hotel-system
}

# =============================================================================
# Main
# =============================================================================
case "${1:-help}" in
    docker)    start_docker ;;
    local)     start_local ;;
    setup-db)  setup_db ;;
    seed)      run_seed ;;
    test)      run_tests ;;
    stop)      stop_docker ;;
    logs)      show_logs ;;
    status)    show_status ;;
    k8s)       apply_k8s ;;
    help|*)    usage ;;
esac
