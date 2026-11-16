# @hotel/e2e — roteiro de demonstração no navegador

Os 7 passos do roteiro da banca (`docs/PLANO_FECHAMENTO_MVP_15NOV2026.md` §3, `docs/roteiro/`),
pela tela, com Playwright: um `test` por passo, em série. Fica **fora** do `pnpm test` e do
`turbo run test`, porque precisa do compose no ar.

> **Só no ambiente descartável `gesway-ensaio`, nunca no da apresentação.** Cada rodada grava no
> Hotel Aurora uma categoria, um quarto, hóspedes, reservas e uma conta de mesa aberta, todos com
> o prefixo "E2E". Apontado para o compose da banca, esse lixo aparece na demonstração. O
> `globalSetup` recusa `E2E_API_URL` fora de `localhost`.

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

## Depois de rodar

Derrube o ambiente e apague os volumes, sempre:

```bash
docker compose -p gesway-ensaio down -v --remove-orphans
```

## Artefatos no CI

O trace de falha grava a rede e o localStorage: o JWT dos 3 usuários e a senha do seed no POST
`/auth/login`. No CI, publique `playwright-report/` e `test-results/` **só em falha**, com
retenção curta (poucos dias), e só de rodadas contra o ambiente descartável.

O workflow `.github/workflows/ci-e2e.yml` segue essa regra: o artefato `e2e-playwright` sai só em
falha, com retenção de 3 dias. O job sobe o compose num runner descartável, com `.env` de senhas
aleatórias, chaves JWT geradas na hora e `PIX_PROVIDER=fake`. Ele roda em todo PR para `develop` e
`main` e avisa sem bloquear (`continue-on-error`, fora dos checks obrigatórios).

## Variáveis

| Variável | Padrão | Para quê |
|---|---|---|
| `E2E_APP_URL` | `http://127.0.0.1:5273` | Vite do PMS. Subido pelo Playwright nessa porta, ou reaproveitado se já estiver no ar. |
| `E2E_API_URL` | `http://localhost:8088` | nginx do compose descartável. Precisa ser local (o `globalSetup` recusa outro host). Conferências pela API e alvo do proxy do Vite. |
| `COMPOSE_PROJECT_NAME` | `gesway-ensaio` | Projeto dos `docker compose exec` do passo 6. |
| `E2E_PASSWORD` | `senha123` | Senha dos usuários do seed (`services/core-service/seed/seed_hotels.sql`). |

O passo 6 simula o pagamento do PIX com `scripts/simular_pagamento_pix.js`, que só vale com
`PIX_PROVIDER=fake`. Com outro provedor, ou quando o `docker compose exec` não alcança o backend
do projeto `COMPOSE_PROJECT_NAME` (sem CLI do docker, projeto errado), o passo é pulado com o
motivo: no sandbox real ele é manual (`docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md`).
