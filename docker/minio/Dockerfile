# MinIO (servidor) + mc (cliente) compilados do código-fonte do GitHub.
#
# Por quê: em 2026 as imagens prontas deixaram de baixar numa máquina limpa — minio/minio
# (Docker Hub) e quay.io/minio/minio dão 401 no pull anônimo. Quem já tinha a imagem em cache
# não percebia; quem clonava o repo do zero não subia o compose. O código-fonte segue público
# (AGPLv3), então a imagem passa a nascer aqui.
#
# Fixos: código do minio e do mc (tag + commit) e imagens base (digest). Os pacotes do apk
# (git, curl, ca-certificates) acompanham o repositório da alpine 3.24 no dia do build. Trocar de
# versão é decisão consciente, nunca um `latest` que muda sozinho.
# - A tag da imagem é gesway/minio:<MINIO_RELEASE> — só o ARG MINIO_RELEASE entra nela, e ele é
#   a fonte única da tag. Ela aparece também no docker-compose.yml e no infra/k8s/minio.yaml, e
#   o scripts/verificar_imagem_minio.sh confere que as quatro linhas batem com o ARG (o
#   start.sh e o CI rodam o script). Ao trocar a RELEASE, troque o commit também e rode o script.
# - Trocar SÓ o mc, um digest ou o Go mantém a tag: o compose recompila com `--build`, mas o
#   k8s não vê mudança no manifest e o pod segue com a imagem velha. Depois do build, rode
#   `kubectl -n hotel-system rollout restart statefulset/minio` (ou suba a RELEASE).
# - Tags do GitHub podem ser movidas: o build confere o commit esperado depois do clone.
# - Imagens base por digest. Go 1.27: a linha 1.24 do go.mod já não recebe correção de
#   segurança, e a imagem do Go roda com GOTOOLCHAIN=local (ignora o `toolchain` do go.mod).
# Atualizar um digest: docker buildx imagetools inspect golang:1.27-alpine (ou alpine:3.24).

FROM golang:1.27-alpine@sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280 AS build
ARG MINIO_RELEASE=RELEASE.2025-10-15T17-29-55Z
ARG MINIO_COMMIT=9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a
ARG MC_RELEASE=RELEASE.2025-08-13T08-35-41Z
ARG MC_COMMIT=7394ce0dd2a80935aded936b09fa12cbb3cb8096
RUN apk add --no-cache git
# HTTP/1.1: o clone do repo do minio (grande) caía com "HTTP/2 stream reset" no build do WSL.
RUN git config --global http.version HTTP/1.1
ENV CGO_ENABLED=0

# O gen-ldflags.go de cada projeto lê o commit pelo git e grava versão/commit no binário
# (`minio --version` e `mc --version` mostram a RELEASE certa). O formato com ":" é o oficial.
WORKDIR /src/minio
RUN git clone --depth 1 --branch "$MINIO_RELEASE" https://github.com/minio/minio.git . \
    && { [ "$(git rev-parse HEAD)" = "$MINIO_COMMIT" ] || { echo "tag $MINIO_RELEASE não aponta para $MINIO_COMMIT" >&2; exit 1; }; } \
    && VERSAO=$(echo "${MINIO_RELEASE#RELEASE.}" | sed -E 's/T([0-9]{2})-([0-9]{2})-([0-9]{2})Z/T\1:\2:\3Z/') \
    && LDFLAGS=$(MINIO_RELEASE=RELEASE go run buildscripts/gen-ldflags.go "$VERSAO") \
    && go build -tags kqueue -trimpath -ldflags "$LDFLAGS" -o /out/minio

WORKDIR /src/mc
RUN git clone --depth 1 --branch "$MC_RELEASE" https://github.com/minio/mc.git . \
    && { [ "$(git rev-parse HEAD)" = "$MC_COMMIT" ] || { echo "tag $MC_RELEASE não aponta para $MC_COMMIT" >&2; exit 1; }; } \
    && VERSAO=$(echo "${MC_RELEASE#RELEASE.}" | sed -E 's/T([0-9]{2})-([0-9]{2})-([0-9]{2})Z/T\1:\2:\3Z/') \
    && LDFLAGS=$(MC_RELEASE=RELEASE go run buildscripts/gen-ldflags.go "$VERSAO") \
    && go build -tags kqueue -trimpath -ldflags "$LDFLAGS" -o /out/mc

FROM alpine:3.24@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf
# curl: healthcheck do compose (/minio/health/live). ca-certificates: TLS de saída do servidor.
RUN apk add --no-cache curl ca-certificates
COPY --from=build /out/minio /out/mc /usr/bin/
EXPOSE 9000 9001
VOLUME ["/data"]
ENTRYPOINT ["minio"]
