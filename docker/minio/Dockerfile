# MinIO (servidor) + mc (cliente) compilados do código-fonte do GitHub.
#
# Por quê: em 2026 as imagens prontas deixaram de baixar numa máquina limpa — minio/minio
# (Docker Hub) e quay.io/minio/minio dão 401 no pull anônimo. Quem já tinha a imagem em cache
# não percebia; quem clonava o repo do zero não subia o compose. O código-fonte segue público
# (AGPLv3), então a imagem passa a nascer aqui.
#
# Tags RELEASE fixas: trocar de versão é decisão consciente (editar os ARG abaixo), nunca um
# `latest` que muda sozinho. Os dois serviços do compose (minio e minio-setup) usam esta imagem.

ARG GO_VERSION=1.24

FROM golang:${GO_VERSION}-alpine AS build
ARG MINIO_RELEASE=RELEASE.2025-10-15T17-29-55Z
ARG MC_RELEASE=RELEASE.2025-08-13T08-35-41Z
RUN apk add --no-cache git
# HTTP/1.1: o clone do repo do minio (grande) caía com "HTTP/2 stream reset" no build do WSL.
RUN git config --global http.version HTTP/1.1
ENV CGO_ENABLED=0

# O gen-ldflags.go de cada projeto lê o commit pelo git e grava versão/commit no binário
# (`minio --version` e `mc --version` mostram a RELEASE certa). O formato com ":" é o oficial.
WORKDIR /src/minio
RUN git clone --depth 1 --branch "$MINIO_RELEASE" https://github.com/minio/minio.git . \
    && VERSAO=$(echo "${MINIO_RELEASE#RELEASE.}" | sed -E 's/T([0-9]{2})-([0-9]{2})-([0-9]{2})Z/T\1:\2:\3Z/') \
    && LDFLAGS=$(MINIO_RELEASE=RELEASE go run buildscripts/gen-ldflags.go "$VERSAO") \
    && go build -tags kqueue -trimpath -ldflags "$LDFLAGS" -o /out/minio

WORKDIR /src/mc
RUN git clone --depth 1 --branch "$MC_RELEASE" https://github.com/minio/mc.git . \
    && VERSAO=$(echo "${MC_RELEASE#RELEASE.}" | sed -E 's/T([0-9]{2})-([0-9]{2})-([0-9]{2})Z/T\1:\2:\3Z/') \
    && LDFLAGS=$(MC_RELEASE=RELEASE go run buildscripts/gen-ldflags.go "$VERSAO") \
    && go build -tags kqueue -trimpath -ldflags "$LDFLAGS" -o /out/mc

FROM alpine:3
# curl: healthcheck do compose (/minio/health/live). ca-certificates: TLS de saída do servidor.
RUN apk add --no-cache curl ca-certificates
COPY --from=build /out/minio /out/mc /usr/bin/
EXPOSE 9000 9001
VOLUME ["/data"]
ENTRYPOINT ["minio"]
