# Retomada — H.3 cutover do analytics (feature/analytics-cutover)

**Atualizado:** 04/11/2026 · **Por:** agente executor (Claude Opus 5.5), trilha do Gabriel
**Worktree:** /home/gabri/wt-h3 · **Portas:** PG 5462 · RabbitMQ 5698 · analytics do teste de pipeline 3063
**Containers:** pg-h3, rmq-h3 — derrubados ao fim de cada sessão (comandos abaixo)

## Objetivo
T-01.4 etapa H.3 — CA-01.4.k, n, o, p e q da SPEC-01. Meta M7-b: 14/11. Sem PR (o Gabriel roda o
qa-redteam e abre).

## Onde estou
- Último commit: ver `git log -1` (cada passo é commitado e enviado)
- Passo atual: 🟡-1/3/4 e 🟢-1/3/4/5/6 do qa-redteam corrigidos, develop mesclada; PR #109 em rascunho

## Feito
- [x] 7 consultas no analytics-service sobre as projeções (`78db6a8`)
- [x] core sem os 7 indicadores; `analytics.test.js` contra o novo serviço (`6dc4763`)
- [x] OpenAPI no analytics + dump juntando os specs + frontend com string decimal (`bfc5385`)
- [x] nginx (compose e k8s), Deployment k8s, secret por ambiente, NetworkPolicy (`35ae156`)
- [x] suítes verdes com cobertura, qa_checks, compose real pelo nginx e Playwright (desktop e 375×812)
- [x] SPEC marcada (k, n, o, p, q) e relatório `docs/historico_sessao/gabriel/analytics_cutover_h3_31102026.md`

- [x] qa-redteam (02/11, APROVADO COM RESSALVAS) e correções (03/11):
  - 🟡-1: hotel vizinho povoado + referências cruzadas, totais exatos nas 7 rotas; RevPAR 111.11 (🟢-1)
  - 🟡-3: nginx com `resolver` + `proxy_pass` com variável — sobe com o analytics parado, 502 só em `/analytics/*`
  - 🟡-4: `/health` 503 só com o banco fora; consumidor parado → 200 `DEGRADED`

## Falta
- [ ] **Depende do merge da `feature/ci-analytics-service` (Weslley, 🟡-2)**: sem ela o `analytics-queries.test.js`
  não roda em CI nenhum, e o bloco do pipeline do `analytics.test.js` é pulado no CI do core (sem broker).
  Repasse em `docs/qa/repasses/para_weslley_02112026.md`. Mergear antes ou junto da H.3
- [ ] [revisão do Weslley] nginx (resolver e FQDN do k8s, exceção da regra 10 do qa_checks), readiness do
  `infra/k8s/analytics.yaml`; `./start.sh up` num minikube/kind (só houve `kubectl kustomize`)
- [x] Merge da develop `3e68e7f` (#106, #107, #108) — `56dcf11`, sem conflito
- [ ] PR #109 sai do rascunho só com o aval do Gabriel

## 🟢 do qa-redteam — corrigidos em 04/11 (aprovados pelo Gabriel)
- [x] 🟢-3 fuso do hotel (D-68, mesma constante do core) — `8601c3c` RED, `cf087c1` GREEN; resolve o repasse D-8 da T-05.3
- [x] 🟢-4 teto em `unpaid` e nos alertas (`limit` 50/100, `unpaid_total`, `totals`) — `50afa89` RED, `255f68b` GREEN
- [x] 🟢-5 "Sem categoria" na receita por categoria (LEFT JOIN, `category_id`) — `5502ca3` RED, `c2d2608` GREEN; M16 r/rm/rc seguem morrendo
- [x] 🟢-6 `location = /analytics/internal-consumption` — `d4710ac` RED (`scripts/verificar_rotas_analytics_nginx.sh`), `e39737d` GREEN [revisão do Weslley]

## Decisões tomadas nesta frente
- Contrato que muda em relação ao core (🟢-2, declarado na SPEC, CA-01.4.k):
  `hours_pending` vira número (1 casa); `cleaning_since` é o instante do evento que levou o quarto a
  CLEANING, não `rooms.updated_at`; `guest` e `category` podem vir `null`; `unpaid` não lista reserva de
  valor 0 nem paga por inteiro
- `/health`: 503 `DOWN` = banco fora (sai do Service); 200 `DEGRADED` = consumidor parado (segue pronto)
- nginx: o analytics é resolvido a cada pedido; a regra 10 aceita só a diferença de DNS marcada com
  `# qa-allow: nginx-ambiente` [revisão do Weslley]
- Contrato novo (🟢-3 a 🟢-5): `?limit=` (50/100) com `unpaid_total`/`totals`; `category_id` e linha "Sem
  categoria"; dia do hotel em vez de UTC — declarado no CA-01.4.k da SPEC
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
