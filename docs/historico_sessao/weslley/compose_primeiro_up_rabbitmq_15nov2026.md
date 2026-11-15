# 1º up a frio do compose sem desistir do RabbitMQ — 15/11/2026

Dev: Weslley (IA orquestrada). Branch: `fix/compose-primeiro-up`, que parte do `develop@9a3727c`.

## Objetivo

Validar o fix do 🟡-1 do ensaio de 14/11 e abrir o PR para o `develop`. No 1º
`docker compose up` a frio (volumes vazios), o healthcheck do RabbitMQ estourava o prazo no WSL. O
compose desistia com `container rabbitmq is unhealthy`, e o `rabbitmq-setup` e o `nginx` não subiam.

## O que mudou (commit `3359f07`)

| Arquivo | Mudança |
|---|---|
| `docker-compose.yml` | `rabbitmq-setup` depende do broker com `service_started`, não mais `service_healthy` |
| `infra/k8s/rabbitmq-setup.sh` | o script já espera a API do RabbitMQ; o prazo subiu de 60 para 90 tentativas de 2 s (3 min) |

## Validação

O teste foram 3 ciclos seguidos de `docker compose down -v && docker compose up -d --build`. O status
foi lido 90 s depois de cada `up`.

**1ª rodada: falhou antes de testar o fix.** Nos 3 ciclos, o `up` parou na interpolação:
`required variable RABBITMQ_CORE_PASSWORD is missing a value`. O `.env` da raiz não tinha nenhuma das
variáveis obrigatórias (`:?`) do compose.

**Correção do `.env` local** (o arquivo não é versionado). As variáveis foram acrescentadas no final,
sem mexer nas que já existiam:

- usuários iguais ao `.env.example`: `RABBITMQ_CORE_USER`, `RABBITMQ_ANALYTICS_USER`, `MINIO_ROOT_USER`
  e `MINIO_PRESIGN_USER`;
- senhas geradas com `openssl rand -hex 16`: `RABBITMQ_CORE_PASSWORD`, `RABBITMQ_ANALYTICS_PASSWORD`,
  `MINIO_ROOT_PASSWORD`, `MINIO_PRESIGN_PASSWORD` e `PIX_WEBHOOK_SECRET`.

Depois disso, `docker compose config -q` passou.

**2ª rodada: passou nos 3 ciclos.**

| Ciclo | `rabbitmq-setup` | `backend` | `nginx` |
|---|---|---|---|
| 1 | `Exited (0)` | `Up (healthy)` | `Up (healthy)` |
| 2 | `Exited (0)` | `Up (healthy)` | `Up (healthy)` |
| 3 | `Exited (0)` | `Up (healthy)` | `Up (healthy)` |

Nenhum ciclo falhou no `up`. O stack do ciclo 3 ficou de pé.

## Entregas

- PR #148 (`fix/compose-primeiro-up` → `develop`):
  https://github.com/gabrielreis354/sistema_hotel_prova/pull/148
- Texto do aviso para o grupo Gesway no WhatsApp, colado manualmente pelo Weslley.

## Commits

| Hash | Mensagem |
|---|---|
| `3359f07` | `fix(compose): 1º up a frio não desiste mais do RabbitMQ (🟡-1 do ensaio de 14/11)` |

## Pendências

| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | Revisão e merge do PR #148 | 🟡 Média | Cobre o 1º up do roteiro do M6 (17/11) |
| 2 | Cada dev conferir o próprio `.env` com `docker compose config -q` | 🟡 Média | Quem estiver sem as 5 senhas obrigatórias não consegue subir o compose. O aviso está no PR e na mensagem do grupo |
| 3 | `docker compose down -v` apaga os volumes | 🟢 Baixa | Nesta máquina, os dados do banco e da fila do compose anteriores a 15/11 foram apagados |
