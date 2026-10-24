# Retomada — H.2 analytics-service (feature/analytics-service)

**Atualizado:** 24/10/2026 · **Por:** agente executor (Claude Opus 5.5), trilha do Gabriel
**Worktree:** /home/gabri/wt-h2-analytics · **Portas:** PG 5441 · RabbitMQ 5682 (AMQP) e 15682 (gestão)
**Containers:** pg-h2, rmq-h2 (subir de novo com os comandos abaixo; o rmq-h2 precisa da topologia)

## Objetivo
T-01.4 etapa H.2 — `services/analytics-service` (CA-01.4.g, h, i, j, l, m), contrato no catálogo de
eventos v1.0. Agora: corrigir as ressalvas do qa-redteam
(`docs/qa/redteam_analytics-service-h2_21out2026.md`), 🟡-1 a 🟡-5 mais dois 🟢 baratos. Sem PR.

## Onde estou
- Último commit: ver `git log -1` (cada passo é commitado e enviado)
- Passo atual: correções das ressalvas, uma por commit (RED → GREEN)
- Próximo passo: o primeiro item ainda aberto em "Falta"

## Feito
- [x] H.2 entregue (8 commits, `93aa1f3`..`30b25cd`); auditoria `fc474e5` APROVADO COM RESSALVAS
- [x] 🟡-4 nome em branco: core recusa com 400, consumidor aceita string em branco — `a585a25`
- [x] 🟡-2 carga inicial com `lock_timeout` e novas tentativas (teste com transação longa; sem o LOCK o teste de ordem continua falhando)

## Falta
- [ ] 🟡-1 ack/nack com canal fechado não pode rejeitar; laço de reconexão roda (teste com canal caindo no meio)
- [ ] 🟡-3 erro de conexão com o banco do analytics não conta tentativa (fecha o canal sem nack, volta ao `ready()`)
- [ ] 🟡-5 catálogo: §6 (`*.deleted` na carga, por causa da D-2) e §4.6 (`reservation_id` nulo) + histórico
- [ ] 🟢 `/health` reflete consumidor e banco (degradado → 503)
- [ ] 🟢 SIGTERM: para de consumir, termina a mensagem em andamento, fecha conexões
- [ ] Suítes core e analytics com cobertura, qa_checks, relatório atualizado, remover containers

## Decisões tomadas nesta frente
- 21/10 — carga inicial emite `*.deleted` para excluídos e aceita `reservation_id` nulo (aceitas pelo Gabriel)
- 24/10 — `lock_timeout` padrão 3 s, 5 tentativas a cada 2 s; esgotou → erro claro, rodar de novo fora do pico

## Bloqueios e perguntas abertas
- Nenhum. Pendências de outros donos no relatório (CI do analytics e quorum at-most-once → Weslley)

## Comandos úteis desta frente
```bash
docker run --rm -d --name pg-h2 -e POSTGRES_USER=hotel_user -e POSTGRES_PASSWORD=hotel_password -p 5441:5432 postgres:17
docker run --rm -d --name rmq-h2 -p 5682:5672 -p 15682:15672 rabbitmq:4-management-alpine
# topologia + usuários (senhas de TESTE locais, iguais às do .env.test não versionado):
docker cp infra/k8s/rabbitmq-setup.sh rmq-h2:/tmp/setup.sh
docker exec -e RABBITMQ_API_HOST=localhost -e RABBITMQ_DEFAULT_USER=guest -e RABBITMQ_DEFAULT_PASS=guest \
  -e RABBITMQ_CORE_USER=hotel_core_publisher -e RABBITMQ_CORE_PASSWORD=<senha de teste> \
  -e RABBITMQ_ANALYTICS_USER=hotel_analytics_consumer -e RABBITMQ_ANALYTICS_PASSWORD=<senha de teste> rmq-h2 sh /tmp/setup.sh
# .env.test: copiar dos .env.test.example com POSTGRES_PORT=5441 (e RABBITMQ_HOST=localhost, PORT=5682 no analytics)
cd services/core-service && timeout 900 npx vitest run --coverage > /tmp/core.log 2>&1
cd services/analytics-service && timeout 600 npx vitest run --coverage > /tmp/analytics.log 2>&1
bash scripts/qa_checks.sh
```
