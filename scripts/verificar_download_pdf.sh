#!/usr/bin/env bash
# =============================================================================
# verificar_download_pdf.sh — prova, contra o compose DE PÉ, que o download de PDF por URL
# assinada (RNF-023) funciona e que o MinIO não fica exposto pelo nginx.
#
# Cria um hotel, um cliente corporativo, um orçamento e um contrato de teste; baixa os dois
# PDFs pela URL que o backend devolve; e tenta, como atacante que tem o repositório (e portanto
# as credenciais do .env/secret.yaml), listar o bucket, ler subrecursos, escrever, reassinar
# com o root ou com validade longa. Sai com código ≠ 0 se algum caso divergir do esperado.
#
# Uso (na raiz do repositório, com o compose LOCAL no ar). O subshell carrega o .env só para o
# script — os segredos não ficam exportados no seu terminal:
#   ( set -a; . ./.env; set +a; BASE=http://localhost bash scripts/verificar_download_pdf.sh )
#
# BASE é obrigatório e explícito: o script cria um hotel e um ADMIN de teste e deixa PDFs no
# bucket — rode só contra o compose local, nunca contra um ambiente compartilhado.
# Requer: curl, python3 e o node_modules do core-service (npm ci em services/core-service).
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

: "${BASE:?defina BASE explicitamente (ex.: BASE=http://localhost) — só contra o compose local}"
: "${MINIO_ROOT_USER:=minioadmin}"
: "${MINIO_ROOT_PASSWORD:?carregue o .env do compose: set -a; . ./.env; set +a}"
: "${MINIO_PRESIGN_USER:=gesway-pdf-leitor}"
: "${MINIO_PRESIGN_PASSWORD:?carregue o .env do compose: set -a; . ./.env; set +a}"
export BASE MINIO_ROOT_USER MINIO_ROOT_PASSWORD MINIO_PRESIGN_USER MINIO_PRESIGN_PASSWORD

FALHAS=0
confere() {  # confere <descrição> <esperado> <obtido>
    if [ "$2" = "$3" ]; then printf '  ✓ %-62s %s\n' "$1" "$3"
    else printf '  ✗ %-62s esperado %s, veio %s\n' "$1" "$2" "$3"; FALHAS=$((FALHAS + 1)); fi
}
json() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

N=$(date +%s)
SENHA=$(python3 -c 'import secrets; print(secrets.token_urlsafe(18))')   # descartável, nunca publicada
curl -sf -o /dev/null -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
    -d "{\"tenantName\":\"Verificação PDF $N\",\"name\":\"Adm\",\"email\":\"verif$N@gesway.test\",\"password\":\"$SENHA\"}" \
    || { echo "Não consegui registrar um hotel em $BASE — o compose está no ar?"; exit 1; }
TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"verif$N@gesway.test\",\"password\":\"$SENHA\"}" | json '["token"]')
H="Authorization: Bearer $TOKEN"
CLIENTE=$(curl -s -X POST "$BASE/corporate-clients" -H "$H" -H 'Content-Type: application/json' \
    -d '{"razao_social":"Verificação PDF LTDA","representante_nome":"Fulana"}' | json '["id"]')
ORC=$(curl -s -X POST "$BASE/event-quotes" -H "$H" -H 'Content-Type: application/json' \
    -d "{\"corporate_client_id\":\"$CLIENTE\",\"check_in\":\"2027-05-01\",\"check_out\":\"2027-05-03\",\"pessoas\":4,\"valor_diaria_sem_refeicao\":120}" | json '["id"]')
CONTRATO=$(curl -s -X POST "$BASE/contracts" -H "$H" -H 'Content-Type: application/json' \
    -d "{\"corporate_client_id\":\"$CLIENTE\",\"objeto\":\"Evento\",\"check_in\":\"2027-05-01\",\"check_out\":\"2027-05-03\",\"pessoas\":4,\"total\":960,\"testemunha_1\":\"A\",\"testemunha_2\":\"B\"}" | json '["id"]')

URL_ORC=$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/event-quotes/$ORC/pdf" -H "$H")
URL_CONTRATO=$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/contracts/$CONTRATO/pdf" -H "$H")
[ -n "$URL_ORC" ] || { echo "O download do orçamento não redirecionou — o PDF foi persistido? (MinIO/minio-setup)"; exit 1; }

echo "Fluxo legítimo"
confere "orçamento pela URL do backend"            "200 application/pdf" "$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$URL_ORC")"
confere "contrato pela URL do backend"             "200 application/pdf" "$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$URL_CONTRATO")"
confere "URL legítima com Authorization do cliente" "200" "$(curl -s -o /dev/null -w '%{http_code}' -H "$H" "$URL_ORC")"
confere "assinatura adulterada"                    "403" "$(curl -s -o /dev/null -w '%{http_code}' "${URL_ORC/X-Amz-Signature=/X-Amz-Signature=0}")"
confere "sem assinatura"                           "403" "$(curl -s -o /dev/null -w '%{http_code}' "${URL_ORC%%\?*}")"
# O método faz parte da assinatura SigV4: a URL é de GET, então HEAD passa pelo nginx e o MinIO
# recusa (SignatureDoesNotMatch). Confirma que o nginx não reescreve o método.
confere "HEAD com URL assinada para GET"           "403" "$(curl -s -o /dev/null -w '%{http_code}' -I "$URL_ORC")"
confere "GET parcial (Range) na URL legítima"      "206" "$(curl -s -o /dev/null -w '%{http_code}' -r 0-0 "$URL_ORC")"
confere "quebra de linha codificada no caminho"    "403" "$(curl -s -o /dev/null -w '%{http_code}' "${URL_ORC/.pdf\?/.pdf%0A?}")"
for exp in 0 301 0300; do
    confere "X-Amz-Expires=$exp na URL legítima"      "403" "$(curl -s -o /dev/null -w '%{http_code}' "$(sed -E "s/X-Amz-Expires=[0-9]+/X-Amz-Expires=$exp/" <<< "$URL_ORC")")"
done

echo "Atacante com as credenciais do repositório"
CHAVE=$(python3 -c "import sys,urllib.parse as u; print(u.urlparse(sys.argv[1]).path.split('/',2)[2])" "$URL_ORC")
resultado=$(cd services/core-service && CHAVE="$CHAVE" node --input-type=module -e '
import { S3Client, ListObjectsV2Command, GetObjectCommand, GetObjectAclCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
const e = process.env, B = e.MINIO_BUCKET || "hotel-contracts", K = e.CHAVE;
const mk = (u, p) => new S3Client({ endpoint: e.BASE, region: "us-east-1", credentials: { accessKeyId: u, secretAccessKey: p }, forcePathStyle: true, maxAttempts: 1 });
const root = mk(e.MINIO_ROOT_USER, e.MINIO_ROOT_PASSWORD), leitor = mk(e.MINIO_PRESIGN_USER, e.MINIO_PRESIGN_PASSWORD);
const st = async (u, o = {}) => (await fetch(u, o)).status;
const casos = [
  ["root pré-assina a listagem do bucket", "403", () => getSignedUrl(root, new ListObjectsV2Command({ Bucket: B }))],
  ["root pré-assina ?acl do objeto", "403", () => getSignedUrl(root, new GetObjectAclCommand({ Bucket: B, Key: K }))],
  ["root pré-assina GetObject da chave conhecida", "403", () => getSignedUrl(root, new GetObjectCommand({ Bucket: B, Key: K }))],
  ["leitor pré-assina a listagem", "403", () => getSignedUrl(leitor, new ListObjectsV2Command({ Bucket: B }))],
  ["leitor pré-assina chave fora do formato", "403", () => getSignedUrl(leitor, new GetObjectCommand({ Bucket: B, Key: "x/qualquer.txt" }))],
  ["leitor reassina a chave com validade de 7 dias", "403", () => getSignedUrl(leitor, new GetObjectCommand({ Bucket: B, Key: K }), { expiresIn: 604800 })],
  // Achado 🟡-23: o nginx aceitava se QUALQUER ocorrência casasse; o MinIO valida a primeira.
  ["root 7 dias + credencial/expiração do leitor repetidas", "403", async () => (await getSignedUrl(root, new GetObjectCommand({ Bucket: B, Key: K }), { expiresIn: 604800 })) + `&X-Amz-Credential=${e.MINIO_PRESIGN_USER}%2Fx&X-Amz-Expires=300`],
  ["idem, repetidas em minúsculas", "403", async () => (await getSignedUrl(root, new GetObjectCommand({ Bucket: B, Key: K }), { expiresIn: 604800 })) + `&x-amz-credential=${e.MINIO_PRESIGN_USER}%2Fx&x-amz-expires=300`],
];
for (const [n, esperado, f] of casos) console.log(`${n}\t${esperado}\t${await st(await f())}`);
console.log(`PUT pré-assinado sobre o PDF\t403\t${await st(await getSignedUrl(leitor, new PutObjectCommand({ Bucket: B, Key: K })), { method: "PUT", body: "x" })}`);
for (const [n, c] of [["root com credencial no cabeçalho — listagem", new ListObjectsV2Command({ Bucket: B })], ["root com credencial no cabeçalho — GetObject", new GetObjectCommand({ Bucket: B, Key: K })]]) {
  let s; try { await root.send(c); s = "200"; } catch (x) { s = String(x.$metadata?.httpStatusCode ?? x.name); }
  console.log(`${n}\t403\t${s}`);
}')
while IFS=$'\t' read -r nome esperado obtido; do confere "$nome" "$esperado" "$obtido"; done <<< "$resultado"
confere "API admin do MinIO pelo nginx"            "404" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/minio/admin/v3/info")"
confere "traversal cru para a saúde do MinIO"      "404" "$(curl -s -o /dev/null -w '%{http_code}' --path-as-is "$BASE/hotel-contracts/../minio/health/live")"

echo
if [ "$FALHAS" -eq 0 ]; then echo "✓ Todos os casos conforme o esperado."; else echo "✗ $FALHAS caso(s) divergente(s)."; fi
[ "$FALHAS" -eq 0 ]
