#!/usr/bin/env bash
# Troca o passo 6 para o PIX simulado (plano B) sem mexer no .env: fecha o túnel e sobe o backend
# com PIX_PROVIDER=fake passado pelo shell, que vale mais que o .env no compose.
#
# Uso, da raiz do repositório: bash scripts/pix/2_plano_b.sh
set -uo pipefail
source "$(dirname "$0")/_comum.sh"
cd "$REPO" || exit 1

fechar_tunel

echo "Subindo o backend com PIX_PROVIDER=fake..."
PIX_PROVIDER=fake docker compose up -d backend
esperar_backend || exit 1
docker compose exec -T backend sh -c 'echo "Backend com PIX_PROVIDER=$PIX_PROVIDER"'
echo
echo "Faça uma reserva NOVA no Swagger e, no lugar do painel do Asaas, rode:"
echo "  docker compose exec backend node scripts/simular_pagamento_pix.js <pix.provider_charge_id> http://localhost:3000"
echo "No fim: bash scripts/pix/3_fechar.sh"
