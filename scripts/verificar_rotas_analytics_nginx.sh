#!/usr/bin/env bash
# =============================================================================
# verificar_rotas_analytics_nginx.sh — prova o roteamento de /analytics/ do nginx do compose
# (docker/nginx/default.conf) com backends SIMULADOS: cada um devolve "<quem> <URI recebido>".
# Não precisa do compose de pé nem de banco; só do Docker.
#
# Confere (T-01.4/H.3, qa-redteam 🟡-3 e 🟢-6):
# - só o caminho EXATO /analytics/internal-consumption (com ou sem query) vai para o core (L-1);
#   /analytics/internal-consumptionX, com barra final ou com subcaminho vão para o analytics;
# - o URI chega ao serviço igual ao pedido (query string inclusive);
# - com o analytics PARADO o nginx sobe, /analytics/* dá 502 e o resto do PMS segue no core.
#
# O ConfigMap do k8s (infra/k8s/nginx.yaml) tem as mesmas diretivas — a regra 10 do
# scripts/qa_checks.sh garante —, salvo o DNS de cada ambiente (resolver e FQDN).
#
# Uso, na raiz do repositório:  bash scripts/verificar_rotas_analytics_nginx.sh
# Sai com código ≠ 0 se algum caso divergir. Remove tudo o que criou.
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

P="gesway-verif-nginx-$$"
CONF="$PWD/docker/nginx/default.conf"
PORTA="${PORTA:-18193}"
FALHAS=0

limpar() {
    docker rm -f "$P-nginx" "$P-backend" "$P-analytics-service" "$P-minio" >/dev/null 2>&1
    docker network rm "$P" >/dev/null 2>&1
}
trap limpar EXIT

confere() {  # confere <descrição> <esperado> <obtido>
    if [ "$2" = "$3" ]; then printf '  ✓ %-58s %s\n' "$1" "$3"
    else printf '  ✗ %-58s esperado [%s], veio [%s]\n' "$1" "$2" "$3"; FALHAS=$((FALHAS + 1)); fi
}

eco() {  # eco <nome do serviço> <porta>
    docker run -d --rm --name "$P-$1" --network "$P" --network-alias "$1" -e QUEM="$1" -e PORTA="$2" \
        node:24-alpine node -e \
        "require('http').createServer((q,s)=>s.end(process.env.QUEM+' '+q.url)).listen(process.env.PORTA)" >/dev/null
}

pedir() { curl -s --path-as-is "http://localhost:$PORTA$1"; }
status() { curl -s -o /dev/null -w '%{http_code}' --path-as-is "http://localhost:$PORTA$1"; }

docker network create "$P" >/dev/null || { echo "Docker indisponível"; exit 1; }
eco backend 3000
eco analytics-service 3001
eco minio 9000
sleep 2
docker run -d --name "$P-nginx" --network "$P" -p "$PORTA:80" -v "$CONF:/etc/nginx/conf.d/default.conf:ro" nginx:alpine >/dev/null
sleep 2

echo "── Roteamento (analytics no ar)"
confere "exato → core"                         "backend /analytics/internal-consumption" "$(pedir /analytics/internal-consumption)"
confere "exato com query → core, query mantida" "backend /analytics/internal-consumption?start=2026-11-01&end=2026-11-30" \
    "$(pedir '/analytics/internal-consumption?start=2026-11-01&end=2026-11-30')"
confere "internal-consumptionX → analytics"   "analytics-service /analytics/internal-consumptionX" "$(pedir /analytics/internal-consumptionX)"
confere "barra final → analytics"             "analytics-service /analytics/internal-consumption/" "$(pedir /analytics/internal-consumption/)"
confere "subcaminho → analytics"              "analytics-service /analytics/internal-consumption/x" "$(pedir /analytics/internal-consumption/x)"
confere "revenue → analytics"                 "analytics-service /analytics/revenue" "$(pedir /analytics/revenue)"
confere "revenue com query → analytics"       "analytics-service /analytics/revenue?start=2026-11-01&end=2026-11-30&limit=10" \
    "$(pedir '/analytics/revenue?start=2026-11-01&end=2026-11-30&limit=10')"
confere "resto do PMS → core"                 "backend /reservations" "$(pedir /reservations)"

echo "── Analytics parado: nginx reiniciado"
docker stop "$P-analytics-service" >/dev/null
docker restart "$P-nginx" >/dev/null
sleep 2
confere "nginx sobe"                          "running" "$(docker inspect -f '{{.State.Status}}' "$P-nginx")"
confere "/analytics/revenue → 502"            "502" "$(status /analytics/revenue)"
confere "internal-consumption segue no core"  "backend /analytics/internal-consumption" "$(pedir /analytics/internal-consumption)"
confere "resto do PMS segue no core"          "backend /auth/login" "$(pedir /auth/login)"

echo "── Analytics volta (sem reiniciar o nginx)"
eco analytics-service 3001
sleep 12   # resolver valid=10s
confere "/analytics/revenue → analytics"      "analytics-service /analytics/revenue" "$(pedir /analytics/revenue)"

if [ "$FALHAS" -eq 0 ]; then echo "OK — nenhum caso divergiu."; else echo "FALHOU — $FALHAS caso(s) divergiram."; exit 1; fi
