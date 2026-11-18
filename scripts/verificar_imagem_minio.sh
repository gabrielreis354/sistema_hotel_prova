#!/usr/bin/env bash
# Confere que a tag da imagem do MinIO é a mesma nos quatro lugares em que aparece e imprime a
# tag. A fonte única é o ARG MINIO_RELEASE de docker/minio/Dockerfile. Também aparece em:
#   - docker-compose.yml: serviços minio e minio-setup;
#   - infra/k8s/minio.yaml: contêineres minio e setup.
# Sem essa conferência, trocar o ARG e esquecer uma linha faria a imagem nova sair com o nome
# velho: o compose/kubelet reaproveitaria a imagem velha em cache, ou o sidecar ficaria sem imagem.
# Uso: tag=$(bash scripts/verificar_imagem_minio.sh) — sai com 1 e explica, se divergir.
set -euo pipefail
cd "$(dirname "$0")/.."

release=$(sed -n 's/^ARG MINIO_RELEASE=\(RELEASE\.[0-9TZ:-]*\)$/\1/p' docker/minio/Dockerfile)
[ -n "$release" ] || { echo "verificar_imagem_minio: ARG MINIO_RELEASE não achado em docker/minio/Dockerfile" >&2; exit 1; }
esperada="gesway/minio:$release"

erro=0
confere() { # arquivo, quantas linhas `image:` com gesway/minio devem existir
    local arquivo=$1 quantas=$2 achadas
    achadas=$(grep -E '^[[:space:]]*image:[[:space:]]*gesway/minio:' "$arquivo" | sed -E 's/^[[:space:]]*image:[[:space:]]*//; s/[[:space:]]+$//' || true)
    if [ "$(printf '%s\n' "$achadas" | grep -c .)" -ne "$quantas" ]; then
        echo "verificar_imagem_minio: $arquivo deveria ter $quantas linhas 'image: gesway/minio:...'" >&2; erro=1; return
    fi
    while IFS= read -r img; do
        [ "$img" = "$esperada" ] || { echo "verificar_imagem_minio: $arquivo usa $img; o Dockerfile pede $esperada" >&2; erro=1; }
    done <<< "$achadas"
}
confere docker-compose.yml 2
confere infra/k8s/minio.yaml 2
[ "$erro" -eq 0 ] || exit 1
echo "$esperada"
