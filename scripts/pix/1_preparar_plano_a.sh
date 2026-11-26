#!/usr/bin/env bash
# Prepara o passo 6 com o Asaas (plano A): confere o backend, sobe o túnel, aponta o webhook
# "gesway-ensaio-plano-a" do sandbox para ele e testa se o sandbox está gerando o QR.
#
# Uso, da raiz do repositório, com o compose no ar e PIX_PROVIDER=asaas no .env:
#   bash scripts/pix/1_preparar_plano_a.sh            # sobe um quick tunnel do cloudflared
#   bash scripts/pix/1_preparar_plano_a.sh <URL>      # usa um túnel que já está no ar (ngrok etc.)
#
# Saída: 0 = plano A pronto; 2 = o sandbox não gera o QR (use o plano B); 1 = outra falha.
set -uo pipefail
source "$(dirname "$0")/_comum.sh"
cd "$REPO" || exit 1

echo "1/4 Backend no ar?"
if ! backend_saudavel; then
    echo "   NÃO. Suba antes: ./start.sh compose-up"
    exit 1
fi
echo "   sim"

echo "2/4 Backend com o Asaas (provider, chave e token)?"
if ! docker compose exec -T backend sh -c '[ "$PIX_PROVIDER" = asaas ] && [ -n "$ASAAS_API_KEY" ] && [ -n "$ASAAS_WEBHOOK_TOKEN" ]'; then
    echo "   NÃO. Confira PIX_PROVIDER=asaas, ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN no .env e rode: docker compose up -d backend"
    exit 1
fi
echo "   sim"

echo "3/4 Túnel"
URL="${1:-}"
URL="${URL%/}"
URL="${URL%/webhooks/pix}"   # aceita a URL do webhook inteira também
if [ -z "$URL" ]; then
    if [ ! -x "$CLOUDFLARED" ]; then
        echo "   cloudflared não encontrado. Instale (docs/pagamentos/ASAAS_SANDBOX.md §5) ou passe a URL de um túnel: $0 <URL>"
        exit 1
    fi
    mkdir -p "$ESTADO"
    if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then
        echo "   já estava rodando"
    else
        : > "$LOG"
        setsid nohup "$CLOUDFLARED" tunnel --no-autoupdate --url "$BACKEND_URL" > "$LOG" 2>&1 < /dev/null &
        echo $! > "$PIDF"
    fi
    for _ in $(seq 1 60); do
        URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
        [ -n "$URL" ] && break
        sleep 1
    done
    [ -n "$URL" ] || { echo "   o túnel não subiu; veja $LOG"; exit 1; }
fi
c=000
for _ in $(seq 1 30); do
    c=$(curl -s -o /dev/null -w "%{http_code}" "$URL/health" || true)
    [ "$c" = 200 ] && break
    sleep 2
done
[ "$c" = 200 ] || { echo "   o túnel não responde ($c): $URL"; exit 1; }
echo "   $URL"

echo "4/4 Webhook do Asaas e teste do QR"
docker compose exec -T -e NOVA="$URL/webhooks/pix" backend node --input-type=module - < "$PIX_DIR/asaas_webhook_e_qr.mjs"
rc=$?
echo
if [ $rc -eq 0 ]; then
    echo "PRONTO: plano A. Siga o passo 6 no Swagger ($BACKEND_URL/api-docs)."
    echo "No fim: bash scripts/pix/3_fechar.sh"
elif [ $rc -eq 2 ]; then
    echo "O sandbox não está gerando o QR. Use o plano B: bash scripts/pix/2_plano_b.sh"
else
    echo "Falhou no webhook. Veja a mensagem acima."
fi
exit $rc
