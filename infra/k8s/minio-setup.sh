#!/bin/sh
# Provisiona o MinIO para o download de PDF por URL assinada (RNF-023). Idempotente: roda a
# cada subida — no compose, pelo serviço `minio-setup`; no k8s, pelo contêiner `setup` do pod do MinIO.
#
# Cria o bucket e um usuário que só tem s3:GetObject nele. É esse usuário — não o root — que o
# backend usa para ASSINAR as URLs de download: a URL que chega ao navegador carrega o access
# key de quem assinou, e o caminho até o MinIO passa pelo nginx. Com o root, quem conhecesse a
# senha poderia assinar o que quisesse (listar o bucket, ler qualquer objeto).
set -eu

: "${MINIO_URL:=http://minio:9000}"
: "${MINIO_BUCKET:=hotel-contracts}"
: "${MINIO_ROOT_USER:?defina MINIO_ROOT_USER}"
: "${MINIO_ROOT_PASSWORD:?defina MINIO_ROOT_PASSWORD}"
: "${MINIO_PRESIGN_USER:?defina MINIO_PRESIGN_USER}"
: "${MINIO_PRESIGN_PASSWORD:?defina MINIO_PRESIGN_PASSWORD}"
export MC_CONFIG_DIR=/tmp/.mc

tentativas=0
until mc alias set gesway "$MINIO_URL" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
    tentativas=$((tentativas + 1))
    if [ "$tentativas" -ge 30 ]; then
        echo "minio-setup: MinIO não respondeu em $MINIO_URL (ou a credencial root está errada)." >&2
        exit 1
    fi
    sleep 2
done

mc mb --ignore-existing "gesway/$MINIO_BUCKET"

cat > /tmp/gesway-pdf-read.json <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:GetObject"], "Resource": ["arn:aws:s3:::${MINIO_BUCKET}/*"] }
  ]
}
POLICY
mc admin policy create gesway gesway-pdf-read /tmp/gesway-pdf-read.json
mc admin user add gesway "$MINIO_PRESIGN_USER" "$MINIO_PRESIGN_PASSWORD"
# Anexar uma política já anexada é erro no mc — aceito só nesse caso.
if ! mc admin policy attach gesway gesway-pdf-read --user "$MINIO_PRESIGN_USER" 2>/tmp/attach.err; then
    mc admin user info gesway "$MINIO_PRESIGN_USER" | grep -q gesway-pdf-read || { cat /tmp/attach.err >&2; exit 1; }
fi

echo "minio-setup: bucket $MINIO_BUCKET e usuário de leitura $MINIO_PRESIGN_USER prontos."
