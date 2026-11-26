#!/usr/bin/env bash
# Fecha o túnel e devolve o backend ao que está no .env (desfaz o 2_plano_b.sh).
# O webhook do sandbox continua apontando para a URL do túnel, que morre aqui: o próximo
# 1_preparar_plano_a.sh aponta de novo.
#
# Uso, da raiz do repositório: bash scripts/pix/3_fechar.sh
set -uo pipefail
source "$(dirname "$0")/_comum.sh"
cd "$REPO" || exit 1

fechar_tunel

docker compose up -d backend
esperar_backend || exit 1
docker compose exec -T backend sh -c 'echo "Backend com PIX_PROVIDER=$PIX_PROVIDER"'
