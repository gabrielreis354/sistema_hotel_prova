# @hotel/e2e — roteiro de demonstração no navegador

Os 7 passos do roteiro da banca (`docs/PLANO_FECHAMENTO_MVP_15NOV2026.md` §3, `docs/roteiro/`),
pela tela, com Playwright: um `test` por passo, em série. Fica **fora** do `pnpm test` e do
`turbo run test`, porque precisa do compose no ar.

## Pré-requisitos

1. Compose de teste no ar e semeado, a partir da raiz do repositório (com `.env` e chaves JWT
   prontos; `PIX_PROVIDER=fake` para o passo 6 rodar sozinho):

   ```bash
   export COMPOSE_PROJECT_NAME=gesway-ensaio      # projeto isolado, não mexe no seu compose de dev
   # no .env: NGINX_PORT=8088 e MINIO_PUBLIC_ENDPOINT=http://localhost:8088
   ./start.sh compose-up --build
   docker compose exec -T backend node command.js migrate
   docker compose exec -T -e ALLOW_SEED=1 backend node command.js seed
   docker compose exec -T backend node command.js outbox-initial-load
   ```

2. Chromium do Playwright (uma vez): `pnpm --filter @hotel/e2e exec playwright install chromium`.

## Rodar

```bash
cd frontend && pnpm e2e
```

O Playwright sobe o Vite do `app-pms` com o proxy `/api` inteiro no nginx de `E2E_API_URL`, ou
reaproveita o servidor que já responder em `E2E_APP_URL`. Antes dos passos, o `globalSetup` confere
a API (sem compose, para na hora com a instrução de subir) e aquece o Vite, para a otimização de
dependências não recarregar a página no meio do roteiro.

Cada rodada grava dados próprios (tag do relógio, CPF novo): pode rodar de novo no mesmo ambiente.
O nginx limita o login a 5 por minuto por IP; uma rodada faz 4. Rodadas em sequência passam, mas
duas disparadas no mesmo minuto levam 429, com mensagem dizendo isso.

Capturas de cada passo, traces de falha e o relatório HTML ficam em `test-results/` e
`playwright-report/` (ignorados pelo git).

## Variáveis

| Variável | Padrão | Para quê |
|---|---|---|
| `E2E_APP_URL` | `http://127.0.0.1:5273` | Vite do PMS. Subido pelo Playwright nessa porta, ou reaproveitado se já estiver no ar. |
| `E2E_API_URL` | `http://localhost:8088` | nginx do compose. Conferências pela API e alvo do proxy do Vite (só a porta é usada pelo proxy: o host é `localhost`). |
| `COMPOSE_PROJECT_NAME` | `gesway-ensaio` | Projeto dos `docker compose exec` do passo 6. |
| `E2E_PASSWORD` | `senha123` | Senha dos usuários do seed (`services/core-service/seed/seed_hotels.sql`). |

O passo 6 simula o pagamento do PIX com `scripts/simular_pagamento_pix.js`, que só vale com
`PIX_PROVIDER=fake`. Com outro provedor, o passo é pulado com o motivo: no sandbox real ele é
manual (`docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md`).
