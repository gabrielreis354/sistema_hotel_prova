# Retomada — H.3 cutover do analytics (feature/analytics-cutover)

**Atualizado:** 31/10/2026 · **Por:** agente executor (Claude Opus 5.5), trilha do Gabriel
**Worktree:** /home/gabri/wt-h3 · **Portas:** PG 5462 · RabbitMQ 5698 · analytics do teste de pipeline 3063
**Containers:** pg-h3, rmq-h3 — derrubados ao fim de cada sessão (comandos abaixo)

## Objetivo
T-01.4 etapa H.3 — CA-01.4.k, n, o, p e q da SPEC-01. Meta M7-b: 14/11. Sem PR (o Gabriel roda o
qa-redteam e abre).

## Onde estou
- Último commit: ver `git log -1` (cada passo é commitado e enviado)
- Passo atual: H.3 entregue, aguardando qa-redteam do Gabriel

## Feito
- [x] 7 consultas no analytics-service sobre as projeções (`78db6a8`)
- [x] core sem os 7 indicadores; `analytics.test.js` contra o novo serviço (`6dc4763`)
- [x] OpenAPI no analytics + dump juntando os specs + frontend com string decimal (`bfc5385`)
- [x] nginx (compose e k8s), Deployment k8s, secret por ambiente, NetworkPolicy (`35ae156`)
- [x] suítes verdes com cobertura, qa_checks, compose real pelo nginx e Playwright (desktop e 375×812)
- [x] SPEC marcada (k, n, o, p, q) e relatório `docs/historico_sessao/gabriel/analytics_cutover_h3_31102026.md`

## Falta
- [ ] qa-redteam (Gabriel) e PR
- [ ] [revisão do Weslley] infra; `./start.sh up` num minikube/kind (só houve `kubectl kustomize`)

## Decisões tomadas nesta frente
- Dinheiro sai como string decimal (`numeric(14,2)`); `occupancy_rate`, `pct`, `avg_nights` e
  `hours_pending` seguem número (não são dinheiro)
- `revenue.unpaid` ganha `guest_id`, `paid` e `balance`; alerts ganham `guest_id` (D-1: abrir a ficha no core)
- LEFT JOIN em hóspede/categoria: evento chega em qualquer ordem, a linha não some por isso
- Data/months/limit inválidos → 400 (no core, data inválida virava 500)

## Bloqueios e perguntas abertas
- `GET /analytics/internal-consumption` continua no core — depende da decisão **L-1** (evento de
  `accounts`/`account_items` no catálogo ou manter no core no MVP)

## Comandos úteis desta frente
```bash
docker run --rm -d --name pg-h3 -e POSTGRES_USER=hotel_user -e POSTGRES_PASSWORD=hotel_password -p 5462:5432 postgres:17
docker run --rm -d --user rabbitmq --name rmq-h3 -p 5698:5672 rabbitmq:4-management-alpine
# topologia + usuários (senhas de TESTE locais, iguais às do .env.test não versionado):
docker cp infra/k8s/rabbitmq-setup.sh rmq-h3:/tmp/setup.sh
timeout 180 docker exec -e RABBITMQ_API_HOST=localhost -e RABBITMQ_DEFAULT_USER=guest -e RABBITMQ_DEFAULT_PASS=guest \
  -e RABBITMQ_CORE_USER=hotel_core_publisher -e RABBITMQ_CORE_PASSWORD=<senha de teste> \
  -e RABBITMQ_ANALYTICS_USER=hotel_analytics_consumer -e RABBITMQ_ANALYTICS_PASSWORD=<senha de teste> rmq-h3 sh /tmp/setup.sh
cd services/core-service && timeout 900 npx vitest run --coverage > /tmp/core.log 2>&1
cd services/analytics-service && timeout 600 npx vitest run --coverage > /tmp/analytics.log 2>&1
timeout 120 bash scripts/qa_checks.sh
docker stop pg-h3 rmq-h3
```
