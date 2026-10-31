# Retomada — H.2 analytics-service (feature/analytics-service)

**Atualizado:** 31/10/2026 · **Por:** agente executor (Claude Opus 5.5), trilha do Gabriel
**Worktree:** /home/gabri/wt-h2-analytics · **Portas (integração de 28–29/10):** PG 5460 · RabbitMQ 5697
**Containers:** pg-h2int, rmq-h2int — derrubados ao fim de cada sessão (subir com os comandos abaixo; o
rmq-h2int precisa da topologia). NÃO usar pg-qah2b/rmq-qah2b (reauditoria delta).

## Objetivo
T-01.4 etapa H.2 — `services/analytics-service` (CA-01.4.g, h, i, j, l, m), contrato no catálogo de
eventos v1.1. Fase atual: **integração com a develop** (parecer do Sirlande de 28/10 marca a integração
para 29/10). Sem PR.

## Onde estou
- Último commit: ver `git log -1` (cada passo é commitado e enviado)
- Passo atual: H.2 aprovada (delta 4, `c533072`); develop atual mesclada (`e26da09`), suítes verdes
- Próximo passo: o coordenador abre o PR da H.2; depois do merge, marcar ENCERRADA

## Feito
- [x] H.2 entregue (`93aa1f3`..`30b25cd`); auditoria `fc474e5` APROVADO COM RESSALVAS
- [x] Ressalvas 🟡-1 a 🟡-5 e 🟢-3/🟢-4 corrigidas (`a585a25`..`40831be`)
- [x] 28/10 — merge de `origin/develop` (109 commits), sem conflitos — `35cf86f`
- [x] Teste dos triggers com os fluxos novos (check-in que cria conta, comanda, pagamento de conta) — `tests/outbox-develop-flows.test.js`
- [x] Catálogo 1.1.1: texto do `payment.deleted`/estorno alinhado ao código da T-06.13

- [x] 30/10 — reauditoria delta (`8c74407`, APROVADO COM RESSALVAS): repasses versionados (`47e7fb8`);
  🟡-A RED (`d54b681`) → GREEN (`c87df79`, teto de `x-delivery-count` 10); 🟢-C e 🟢-B (`c87df79`);
  catálogo 1.1.2 (`20290bf`); 🟢-D readiness (`a4bdd65`)

- [x] 31/10 — reauditoria delta 2 (`9d797dd`): 🟡-A2 RED (`c1c954c`) → GREEN (`e097bfb`: a pausa drena e
  fecha o canal antes da conexão); catálogo 1.1.3 (`60ea9f8`)

- [x] 31/10 — reauditoria delta 3 (`f3789e8`): 🟡-A3 e 🟢-E RED (`4e9e5c0`) → GREEN (`e3b6d82`);
  catálogo 1.1.4 (`ccf8eef`)
- [x] 31/10 — verificação estreita do delta 4 APROVADA (`c533072`); merge da develop `4234915` (`e26da09`),
  conflito só no KUBERNETES.md (as duas seções mantidas); §5.3 alinhado à policy delivery-limit 50 (catálogo 1.1.5)

## Falta
- [ ] (outros donos) lacunas de evento da develop — ver relatório, seção "Integração com a develop"

## Decisões tomadas nesta frente
- 21/10 — carga inicial emite `*.deleted` para excluídos e aceita `reservation_id` nulo (aceitas pelo Gabriel)
- 24/10 — `lock_timeout` padrão 3 s, 5 tentativas a cada 2 s; esgotou → erro claro, rodar de novo fora do pico
- 31/10 — drenagem da pausa com prazo próprio (60 s); `pool.acquire` e `statement_timeout` de 5 s no analytics
  (env `POSTGRES_ACQUIRE_TIMEOUT_MS` / `POSTGRES_STATEMENT_TIMEOUT_MS`); 57014 conta como tentativa; `stop()` espera o
  broker no máximo 2 s por resposta (🟡-A3, 🟢-E)
- 31/10 — pausa drena e fecha o canal ANTES da conexão (fechar a conexão logo após o nack perde o nack na
  fila quorum, comprovado); `nack` com requeue descartado (no RabbitMQ 4 não soma no `x-delivery-count`)
- 30/10 — teto da pausa por banco fora: `x-delivery-count` ≥ 10 ou já rejeitada uma vez → tentativa comum (🟡-A)
- 28/10 — nenhum evento novo fora do catálogo: `accounts`/`account_items` seguem sem evento (§4.7); listado como lacuna

## Bloqueios e perguntas abertas
- `GET /analytics/internal-consumption` (T-04.7, develop) lê `account_items`/`accounts`, que não têm evento:
  na H.3 ele não sai das projeções sem um evento novo no catálogo (decisão do Gabriel)
- CI do analytics → Weslley. Quorum *at-most-once* e `delivery-limit` explícito: **resolvidos** pela policy da develop
  (`28b74f9`/`7a2979b`: *at-least-once*, `delivery-limit` 50 na fila, `-1` na DLQ); trocar 50 por `-1` segue em decisão
- H.3: ao servir `/analytics/top-guests` pelo analytics-service, repetir `requireRole('ADMIN')` (RT-51); a projeção
  não tem e-mail
  (`docs/qa/repasses/para_weslley_23102026.md` e `para_weslley_29102026.md`; não mexer em `infra/k8s/rabbitmq-setup.sh`)

## Comandos úteis desta frente
```bash
docker run --rm -d --name pg-h2int -e POSTGRES_USER=hotel_user -e POSTGRES_PASSWORD=hotel_password -p 5460:5432 postgres:17
docker run --rm -d --user rabbitmq --name rmq-h2int -p 5697:5672 rabbitmq:4-management-alpine   # --user: .erlang.cookie eacces desde o Docker Desktop 29
# topologia + usuários (senhas de TESTE locais, iguais às do .env.test não versionado):
docker cp infra/k8s/rabbitmq-setup.sh rmq-h2int:/tmp/setup.sh
timeout 180 docker exec -e RABBITMQ_API_HOST=localhost -e RABBITMQ_DEFAULT_USER=guest -e RABBITMQ_DEFAULT_PASS=guest \
  -e RABBITMQ_CORE_USER=hotel_core_publisher -e RABBITMQ_CORE_PASSWORD=<senha de teste> \
  -e RABBITMQ_ANALYTICS_USER=hotel_analytics_consumer -e RABBITMQ_ANALYTICS_PASSWORD=<senha de teste> rmq-h2int sh /tmp/setup.sh
# .env.test dos dois serviços: POSTGRES_PORT=5460; no analytics RABBITMQ_HOST=localhost, RABBITMQ_PORT=5697
cd services/core-service && timeout 900 npx vitest run --coverage > /tmp/core.log 2>&1
cd services/analytics-service && timeout 600 npx vitest run --coverage > /tmp/analytics.log 2>&1
timeout 120 bash scripts/qa_checks.sh
docker stop pg-h2int rmq-h2int
```
