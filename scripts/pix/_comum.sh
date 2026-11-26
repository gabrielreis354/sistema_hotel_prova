#!/usr/bin/env bash
# Variáveis comuns aos scripts do passo 6 (plano A e plano B). Não roda sozinho: é lido pelos
# outros com `source`. Nenhum segredo fica aqui: a chave do Asaas e o token do webhook são lidos
# do ambiente do container do backend, que vem do .env.

PIX_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd "$PIX_DIR/../.." && pwd)

# Log e pid do túnel ficam fora do git (.gitignore).
ESTADO="$REPO/.tmp-pix-ensaio"
LOG="$ESTADO/cloudflared.log"
PIDF="$ESTADO/cloudflared.pid"

# A porta do backend no host: a do shell, senão a do .env (o compose lê o .env, o shell não),
# senão 3000.
porta_do_env() {
    [ -f "$REPO/.env" ] || return 0
    sed -n 's/^[[:space:]]*BACKEND_HOST_PORT[[:space:]]*=[[:space:]]*["'\'']\{0,1\}\([0-9]\{1,5\}\).*/\1/p' "$REPO/.env" | tail -1
}
BACKEND_HOST_PORT="${BACKEND_HOST_PORT:-$(porta_do_env)}"
BACKEND_URL="http://localhost:${BACKEND_HOST_PORT:-3000}"

# O cloudflared do PATH, senão o de ~/.local/bin (onde foi instalado no ensaio de 12/11).
CLOUDFLARED="${CLOUDFLARED:-$(command -v cloudflared || echo "$HOME/.local/bin/cloudflared")}"

backend_saudavel() {
    [ "$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/health" || true)" = 200 ]
}

esperar_backend() {
    for _ in $(seq 1 60); do
        backend_saudavel && return 0
        sleep 2
    done
    echo "   o backend não ficou saudável em 2 min: docker compose logs backend"
    return 1
}

# Fecha só o túnel que o 1_preparar_plano_a.sh subiu, pelo PID. Um túnel subido à mão e passado
# como URL fica como está. O `pkill -f "cloudflared tunnel"` antigo casava também com o shell que
# chamou o script (o texto do comando tem essas palavras) e o matava: código 144 em 24/11.
fechar_tunel() {
    if [ -f "$PIDF" ]; then
        kill "$(cat "$PIDF")" 2>/dev/null && echo "Túnel fechado."
        rm -f "$PIDF"
    fi
}
