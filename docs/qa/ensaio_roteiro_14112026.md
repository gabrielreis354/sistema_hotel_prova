# Ensaio do roteiro de demonstração — 14/11/2026

Ensaio da M8/M9: os 7 passos do `PLANO_MVP_ATE_10DEZ2026.md` §2, pela tela, num ambiente
subido do zero. Conduzido por Gabriel, orquestrando Claude Code.

## Ambiente

- Base: `origin/develop@4a9ecd6`. Worktree separado, projeto compose `gesway-ensaio`, volumes
  zerados (`docker compose down -v`).
- `.env` gerado a partir do `.env.example`, com segredos aleatórios só para a máquina local,
  `PIX_PROVIDER=fake` e `NGINX_PORT=8088`.
- Sequência do cabeçalho do `docker-compose.yml`: chaves JWT, `up -d`, `migrate`, `seed` e
  `outbox-initial-load`.
- PMS pelo Vite. Roteiro dirigido por Playwright (Chrome headless), com cada passo feito pelo
  usuário certo: admin, recepção, garçom no celular (375 px).
- Conferência no banco do core e nos indicadores do analytics, pelo nginx.

## Resultado

| Passo | Quem | Resultado | Tempo |
|---|---|---|---|
| 1. Cadastra categoria e quarto | admin | ✅ Gravados | 32 s (inclui a 1ª compilação do Vite) |
| 2. Cria a reserva, vê o valor e faz o check-in | recepção | ✅ Prévia de R$ 400,00 (2 diárias de R$ 200), `CHECKED_IN` | 1,5 s |
| 3. Lança consumo na suíte e numa mesa, inclusive sem rede | garçom, 375 px | ✅ O toque sem rede mostra "Aguardando envio" e chega ao servidor quando a rede volta. Mesa aberta e lançada | 12 s |
| 4. Abre o painel do dia | recepção | ✅ Hóspede na casa, alertas carregados | 2,5 s |
| 5. Check-out: conta, pagamento e fechamento | recepção | ✅ O consumo do garçom aparece na linha do tempo. Pagamento em dinheiro quita a conta. `CHECKED_OUT`, quarto em limpeza | 1,1 s |
| 6. Reserva direta com sinal PIX | hóspede (API pública) | ✅ Sinal de R$ 120 (30% da categoria do ensaio). O webhook simulado (`scripts/simular_pagamento_pix.js`) confirma a reserva | 2 s |
| 7. Indicadores servidos pelo analytics | admin | ✅ 21 chamadas 2xx. A receita de novembro (R$ 804,00) bate com os pagamentos do ensaio (3 sinais de R$ 120 e uma conta de R$ 444). A ocupação mostra o quarto ocupado e o quarto em limpeza do ensaio | 10 s |

Nenhum erro de página nas três sessões.

**Ressalva importante:** o passo 7 e os alertas do passo 4 só passaram porque o ensaio apontou
o proxy do Vite para o **nginx**. Com o `vite.config.ts` do repositório, os dois quebram
(achado 🔴-1).

## Achados

### 🔴-1 Com o `vite.config.ts` do repositório, os indicadores e os alertas do painel dão 404

- **Onde:** `frontend/apps/pms/vite.config.ts`. O proxy manda todo `/api/*` para o core em
  `localhost:3000`.
- **Causa:** desde a H.3 (#109), só o nginx encaminha `/analytics/` para o
  `analytics-service`. O core não responde mais os indicadores.
- **Evidência:** o mesmo navegador e o mesmo ambiente, só com o config do repositório.
  - As 9 chamadas ao analytics voltam 404: `occupancy`, `revenue`, `seasonality`,
    `revenue-by-category`, `payment-mix`, `top-guests` e `alerts`.
  - O painel do gerente mostra "Não foi possível carregar a ocupação" e "Não foi possível
    carregar a receita".
  - Pela API: `GET /analytics/occupancy` dá 200 no nginx e 404 na porta 3000.
    `internal-consumption` dá 200 nos dois, porque continua no core (decisão L-1).
- **Consequência:** subir a demonstração do jeito documentado (compose e Vite) derruba o passo 7,
  que é o passo em que a banca vê os microsserviços, além dos alertas do painel Hoje.
- **Correção proposta:** no proxy do Vite, uma regra `/api/analytics` antes da regra `/api`,
  apontando para o nginx do compose. O nginx já devolve o `internal-consumption` ao core. A
  porta sai do `NGINX_PORT` do `.env`, com 80 como padrão.

### 🟡-1 No primeiro `docker compose up` a frio, o RabbitMQ fica saudável tarde demais

- O compose desistiu com `dependency failed to start: container rabbitmq is unhealthy`.
- Por isso, o `rabbitmq-setup` (que cria os usuários do core e do analytics) e o nginx não
  subiram. Nesse meio-tempo, core e analytics registram `ACCESS_REFUSED` no broker.
- Um segundo `docker compose up -d` resolve tudo. O RabbitMQ levou 37 s para subir no WSL.
- **Correção proposta:** documentar o segundo `up` no roteiro do dia, ou aumentar `retries` ou
  `start_period` no healthcheck do `rabbitmq`.

### 🟢-1 O site de reserva (`apps/booking`) só tem README

O passo 6 é demonstrado pela API pública, como previa a pauta de 03/11 (decisão 5, ainda sem
registro no painel). O ensaio usou o PIX simulado, o plano B. O PIX no sandbox real do Asaas
foi ensaiado pelo Weslley em 12/11 (`docs/historico_sessao/weslley/ensaio_pix_asaas_sandbox_m6_12nov2026.md`).

### 🟢-2 Dois toques no mesmo produto em menos de 5 s viram uma linha com quantidade 2

Comportamento previsto (`features/accounts/queueCore.ts:67`), não é defeito. No roteiro falado,
vale dizer que o garçom pode tocar várias vezes e que o pedido soma.

## Não verificado

- O passo 6 com o Asaas real (não havia chave de sandbox nova; a de 12/11 precisa ser trocada).
- O roteiro no Kubernetes (`start.sh`). O MVP é em compose.
- O aviso de PIX pago para reserva fora de `PENDING`. Já é coberto por teste do core.

## Ambiente ao final

`docker compose -p gesway-ensaio down -v`: contêineres e volumes removidos. Nada em nuvem.
