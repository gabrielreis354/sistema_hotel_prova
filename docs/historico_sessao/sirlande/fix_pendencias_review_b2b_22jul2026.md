# Fix das pendências do review B2B (PR #71) — 22/07/2026

## Contexto

O PR #71 (mergeado em `develop` em 22/07/2026) documentou um review funcional do
módulo B2B (orçamentos/contratos), testado ao vivo contra Postgres+MinIO reais, e
encontrou 4 problemas que **não** haviam sido corrigidos pelo ciclo de fixes do
PR #70 (já em `main`). Esta sessão fecha as 4 pendências.

**Importante — não validado localmente:** este ambiente (WSL) não tinha Postgres
nem Docker disponíveis (Docker Desktop instalado no Windows, mas sem a integração
WSL ligada, e `sudo` pede senha interativa — não consegui instalar o
`postgresql` local sem interação). Todo o trabalho abaixo foi implementado e
revisado por leitura de código, mas **precisa ser validado** — pelo CI (que já
sobe um Postgres efêmero) e manualmente para as partes que o CI não cobre
(MinIO). Roteiro completo na seção "Como testar" abaixo.

## O que foi corrigido

### 1. Total do contrato sem validar contra o orçamento vinculado
**Antes:** `CreateContractController` e `UpdateContractController` aceitavam
`total` do body sem checar contra `quote.total` quando `quote_id` estava
presente — risco financeiro (contrato podia ser gerado/alterado com valor
diferente do orçamento que originou o negócio).
**Depois:** ambos rejeitam com `409` quando `total` diverge de `quote.total`
(tolerância de R$0,01 por arredondamento). Contratos sem `quote_id` não mudam.
**Arquivos:** `app/Controllers/ContractApi/CreateContractController.js`,
`app/Controllers/ContractApi/UpdateContractController.js`

### 2. Orçamento sem trava de transição de status
**Antes:** `PUT /event-quotes/:id` aceitava `status` direto no body, sem
nenhuma validação de máquina de estados — `CANCELLED → CONFIRMED` era aceito.
**Depois:** `status` saiu do update genérico. Dois endpoints dedicados, mesmo
padrão allowlist de `CancelReservationController.js`:
- `PUT /event-quotes/:id/confirm` — só `SENT → CONFIRMED`
- `PUT /event-quotes/:id/cancel` — só `SENT|CONFIRMED → CANCELLED`

Qualquer outra transição retorna `409` com mensagem explicando o motivo.
**Arquivos:** `app/Controllers/EventQuoteApi/UpdateEventQuoteController.js`,
`app/Controllers/EventQuoteApi/ConfirmEventQuoteController.js` (novo),
`app/Controllers/EventQuoteApi/CancelEventQuoteController.js` (novo),
`routes/apis/eventQuoteRouter.js`

### 3. Download do PDF do contrato retornava 403
**Antes:** `DownloadContractPdfController` redirecionava direto pra `pdf_url`
salva no MinIO — como o bucket é privado por padrão (`ensureBucket()` não
define policy pública), esse link cru sem assinatura retorna 403.
**Depois:** gera uma URL assinada (presigned, expira em 5 min) via
`@aws-sdk/s3-request-presigner` a cada download, em vez de reusar o link
público fixo. Bucket continua privado — nada mudou na política do MinIO.
**Arquivos:** `app/utils/uploadToMinIO.js` (novo `getPresignedDownloadUrl`),
`app/Controllers/ContractApi/DownloadContractPdfController.js`,
`package.json` (nova dependência `@aws-sdk/s3-request-presigner`)

### 4. `dotenv.config()` rodava tarde demais em `_web.js`
**Causa raiz:** em ESM, todos os `import` estáticos de um módulo são avaliados
**antes** do corpo desse módulo rodar — não importa a ordem textual das
linhas. `_web.js` importava `router.js` estaticamente (que puxa toda a cadeia
controllers → models → `sequelize.js`/`minio.js`, e esses módulos leem
`process.env.POSTGRES_*`/`MINIO_*` na própria avaliação) — essa cadeia
inteira já executava, com env vars indefinidas, antes da linha que chamava
`dotenv.config()` (dentro de `bootstrap/app.js`).
**Depois:** `_web.js` chama `dotenv.config()` primeiro e só depois faz
`await import(...)` (dinâmico) pro resto — mesmo padrão que `command.js` já
usava corretamente. `bootstrap/app.js` ficou só com `initRelations()`.
**Arquivos:** `_web.js`, `bootstrap/app.js`

## Como testar

### 1 e 2 — cobertos por teste automatizado
`tests/b2b-smoke.test.js` ganhou casos novos:
- `POST /contracts` e `PUT /contracts/:id` com `quote_id` + `total` divergente → 409
- `PUT /event-quotes/:id` com `status` no body → ignorado (fica `SENT`)
- `PUT /event-quotes/:id/confirm` e `/cancel` — todas as transições válidas e
  bloqueadas (`SENT→CONFIRMED→CANCELLED`, reconfirmar, recancelar, confirmar
  cancelado, id inexistente)

Rodar quando tiver Postgres disponível (local ou `docker compose up -d postgres`):
```bash
cp .env.test.example .env.test   # ajustar se necessário
npm test
```
Ou simplesmente abrir o PR desta branch — o CI já sobe um Postgres efêmero e
roda a suíte completa automaticamente.

### 3 — PDF assinado (precisa de MinIO, fora do CI)
```bash
# Com o cluster/compose com Postgres + MinIO rodando:
# 1. Criar cliente corporativo, orçamento e um contrato com quote_id (total batendo)
# 2. Pegar o pdf_url retornado no POST /contracts
curl -i http://localhost:3000/contracts/<id>/pdf -H "Authorization: Bearer <jwt>"
# Esperado: 302 redirect pra uma URL do MinIO com querystring de assinatura
# (X-Amz-Signature, X-Amz-Expires=300 etc.) — seguir o redirect deve baixar o PDF (200).
# Antes do fix: redirect pra URL sem assinatura, MinIO respondia 403 na sequência.
```

### 4 — dotenv (não precisa de MinIO, só Postgres)
```bash
# Simular ambiente onde só o .env existe (nada exportado no shell):
env -i PATH="$PATH" node _web.js
# Esperado: conecta no Postgres normalmente e sobe o servidor.
# Antes do fix: falhava (POSTGRES_HOST/POSTGRES_DB chegavam undefined em sequelize.js
# porque router.js/models já tinham sido avaliados antes do dotenv.config() rodar).
```

## Pendências / próximos passos
- Validar via CI (branch `fix/b2b-review-pendencias`, PR a abrir)
- Rodar o roteiro manual do item 3 (PDF assinado) e item 4 (dotenv) assim que
  Postgres/MinIO estiverem disponíveis neste ambiente ou em outro com Docker
- Nenhuma migração de schema foi necessária — todas as correções são de
  lógica de controller/rota, sem mudança de modelo
