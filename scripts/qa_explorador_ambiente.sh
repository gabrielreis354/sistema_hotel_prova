#!/usr/bin/env bash
# Ambiente do subagente qa-explorador (.claude/agents/qa-explorador.md §5).
#
#   bash scripts/qa_explorador_ambiente.sh subir   # recria o banco gestao_hotel_qa, sobe backend e tela, cria os dados
#   bash scripts/qa_explorador_ambiente.sh parar   # derruba o backend e a tela que este script subiu
#
# Banco PRÓPRIO (gestao_hotel_qa): nunca o de desenvolvimento nem o dos testes automatizados.
# Usa as credenciais e as chaves JWT temporárias de services/core-service/.env.test
# (copie do .env.test.example; as chaves nascem na primeira rodada de `npm test` do backend).
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
CORE="$RAIZ/services/core-service"
PMS="$RAIZ/frontend/apps/pms"
ESTADO="${TMPDIR:-/tmp}/gesway-qa-explorador"
BANCO="gestao_hotel_qa"

falha() { echo "✘ $*" >&2; exit 1; }
porta_ocupada() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

parar() {
    for nome in backend tela; do
        if [ -f "$ESTADO/$nome.pid" ]; then
            kill "$(cat "$ESTADO/$nome.pid")" 2>/dev/null || true
            rm -f "$ESTADO/$nome.pid"
            echo "✔ $nome parado"
        fi
    done
}

esperar() { # url, nome
    for _ in $(seq 1 60); do curl -sf "$1" >/dev/null && return 0; sleep 1; done
    falha "$2 não respondeu em 60 s — veja $ESTADO/$2.log"
}

subir() {
    [ -f "$CORE/.env.test" ] || falha "falta services/core-service/.env.test (copie do .env.test.example)"
    porta_ocupada 3000 && falha "porta 3000 ocupada: pare o backend que está rodando antes"
    porta_ocupada 5173 && falha "porta 5173 ocupada: pare o Vite que está rodando antes"
    mkdir -p "$ESTADO"

    set -a; # shellcheck disable=SC1091
    source "$CORE/.env.test"; set +a
    export NODE_ENV=development POSTGRES_DB="$BANCO" NODE_WEB_PORT=3000
    # Os caminhos do .env.test são relativos ao core-service, de onde o backend roda.
    (cd "$CORE" && [ -f "$JWT_PRIVATE_KEY_PATH" ] && [ -f "$JWT_PUBLIC_KEY_PATH" ]) \
        || falha "faltam as chaves JWT do .env.test: rode 'npm test' uma vez em services/core-service"

    # Banco limpo a cada rodada: o que a rodada anterior gravou não contamina a próxima.
    export PGPASSWORD="$POSTGRES_PASSWORD"
    dropdb --if-exists -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" "$BANCO"
    createdb -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" "$BANCO"
    (cd "$CORE" && node command.js migrate >"$ESTADO/migrate.log" 2>&1) || falha "migrate falhou — veja $ESTADO/migrate.log"
    echo "✔ banco $BANCO recriado"

    (cd "$CORE" && nohup node _web.js >"$ESTADO/backend.log" 2>&1 & echo $! >"$ESTADO/backend.pid")
    esperar http://localhost:3000/health backend
    echo "✔ backend em http://localhost:3000 (banco $BANCO)"

    (cd "$PMS" && nohup node_modules/.bin/vite --port 5173 --strictPort >"$ESTADO/tela.log" 2>&1 & echo $! >"$ESTADO/tela.pid")
    esperar http://localhost:5173/ tela
    echo "✔ tela em http://localhost:5173"

    node "$RAIZ/scripts/qa_explorador_dados.mjs" http://localhost:3000 | tee "$ESTADO/dados.json"
    echo "✔ dados de teste em $ESTADO/dados.json"
}

case "${1:-}" in
    subir) subir ;;
    parar) parar ;;
    *) echo "uso: $0 subir|parar"; exit 2 ;;
esac
