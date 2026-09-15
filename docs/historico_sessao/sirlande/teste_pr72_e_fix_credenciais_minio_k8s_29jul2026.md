# Teste ao vivo do PR #72 + fix de credenciais MinIO no K8s — 29/07/2026

## Contexto

O PR #72 (`fix/b2b-review-pendencias` → `develop`) fechou as 4 pendências do
review B2B (#71), mas não tinha sido validado localmente — a sessão anterior
não tinha Postgres nem Docker disponíveis. Nesta sessão, com Docker Desktop e
Kubernetes habilitados, subi o ambiente completo (`kubectl apply -k k8s/`) e
testei os 4 itens ao vivo, reproduzindo os mesmos cenários de bug do review
original antes/depois do fix.

## Resultado da validação do PR #72

| Item | Teste | Resultado |
|---|---|---|
| 1. Total do contrato vs orçamento | `POST`/`PUT /contracts` com `quote_id` de orçamento de R$10.000 e `total: 1` | ✅ `409` nos dois casos |
| 2. Transição de status do orçamento | `PUT /event-quotes/:id` com `status` no body (ignorado) + `/:id/cancel` então `/:id/confirm` num orçamento `CANCELLED` | ✅ `status` ignorado no PUT genérico; `409` ao tentar confirmar orçamento cancelado |
| 3. Download do PDF (presigned URL) | `GET /contracts/:id/pdf` → seguir o redirect até o MinIO de verdade | ✅ `302` com `X-Amz-Signature`/`X-Amz-Expires=300`; PDF real baixado (200), documento válido |
| 4. `dotenv.config()` tardio | `env -i PATH="$PATH" node _web.js` com Postgres numa porta não-padrão (via `kubectl port-forward` em `15432`) | ✅ pré-fix: `ECONNREFUSED 127.0.0.1:5432` (ignorava o `.env`); pós-fix: conecta na porta certa |

As 4 pendências do PR #72 estão de fato corrigidas. Nenhuma alteração de
código foi necessária nessa branch — só validação.

## Bug encontrado durante o teste (fora do escopo do PR #72)

Pra validar o item 3, o primeiro contrato criado teve o upload do PDF pro
MinIO falhando silenciosamente (`CreateContractController: contrato criado,
mas PDF/MinIO falhou: Resolved credential object is not valid`), deixando
`pdf_url: null` pra sempre — o que faz o código do presigned URL nunca rodar
de verdade em produção (cai sempre no fallback on-demand).

**Causa raiz:** `k8s/backend.yaml` nunca injetava `MINIO_ROOT_USER` /
`MINIO_ROOT_PASSWORD` no pod do backend — só `POSTGRES_PASSWORD` e
`JWT_SECRET` vinham do `Secret`. O `k8s/minio.yaml` injeta essas duas
variáveis corretamente, mas só pro próprio servidor MinIO usar como
credenciais administrativas — o backend, que atua como *cliente* S3
(`database/connections/minio.js`), nunca as recebia. Bug existente desde o
commit `d928a08` (estrutura inicial do K8s), anterior ao módulo B2B inteiro.

**Fix:** adicionadas as duas entradas `env` faltantes em `k8s/backend.yaml`,
mesmo padrão já usado em `k8s/minio.yaml`. Validado: derrubei o namespace
(`kubectl delete -k k8s/`), reapliquei com o fix, recriei um contrato do
zero — upload no MinIO funcionou sem nenhum patch manual, `pdf_url` setado
automaticamente, download com presigned URL funcionando de ponta a ponta.

**Arquivo:** `k8s/backend.yaml`
**Branch:** `fix/k8s-backend-minio-credentials` (a partir de `develop`)

## Ambiente de teste

Kubernetes local via Docker Desktop (`docker-desktop` context). Namespace
`hotel-system` criado e destruído duas vezes nesta sessão (uma pra validar o
PR #72 com um patch temporário via `kubectl set env`, não commitado; outra
pra validar o fix do `backend.yaml` do zero). Nenhum dado de produção foi
tocado. `.env` local foi temporariamente sobrescrito para o teste do item 4
(`node _web.js` fora do cluster, contra Postgres exposto via
`kubectl port-forward`) e restaurado ao original ao final.

## Pendências / próximos passos

- Abrir PR de `fix/k8s-backend-minio-credentials` → `develop`.
- PR #72 pode ser mergeado com confiança — todos os 4 itens validados ao
  vivo, não só por leitura de código.
