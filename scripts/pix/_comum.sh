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

# Fecha o túnel desta máquina. `pkill -x` casa só com o nome do processo: o `pkill -f` antigo
# casava também com o shell que chamou o script (o texto do comando tem "cloudflared tunnel") e
# o matava, daí o código de saída 144 do ensaio de 24/11.
fechar_tunel() {
    if [ -f "$PIDF" ]; then
        kill "$(cat "$PIDF")" 2>/dev/null && echo "Túnel fechado."
        rm -f "$PIDF"
    fi
    pkill -x cloudflared 2>/dev/null || true
}
