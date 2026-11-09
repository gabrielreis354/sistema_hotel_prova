# Repasses para o Weslley — 02/11/2026

Origem: `docs/qa/redteam_analytics-cutover-h3_02112026.md` (feature/analytics-cutover@5376786, H.3 da T-01.4).
Os dois achados ficam em `.github/workflows/`, área do Weslley (DIVISAO §7). Não reprovam a branch.

---

### 🟡 [CI] Os indicadores ficam sem CI se a H.3 entrar antes da `feature/ci-analytics-service`
**Onde:** `.github/workflows/` da `develop@fbe086d`, que só tem `ci.yml`, `ci-core-service.yml` e `ci-frontend.yml`. O `ci-analytics-service.yml` existe só em `origin/feature/ci-analytics-service` (commits `2a5147d` e `19210f3`).
**Cenário:** a H.3 tira do core os testes de receita (VOIDED fora, CA-06.13.f) e de no-show (só PAID), e eles passam a morar em `services/analytics-service/tests/analytics-queries.test.js`. Sem o workflow do analytics, uma mudança que volte a somar VOIDED na receita passa no CI. Localmente a mutação foi morta pelo teste, mas o teste não roda no GitHub.
**Regra violada:** portão de CI (60% e testes verdes) para código que calcula dinheiro.
**Correção sugerida:** mergear a `feature/ci-analytics-service` antes da H.3, ou no mesmo PR de release.

### 🟡 [CI] O pipeline core → RabbitMQ → analytics é pulado no CI do core
**Onde:** `.github/workflows/ci-core-service.yml` (sem `services: rabbitmq`); `services/core-service/tests/analytics.test.js:26` (`describe.skip` sem `RABBITMQ_HOST`)
**Cenário:** os 20 casos de ponta a ponta (outbox → broker → projeção → indicador) só rodam na máquina de quem tem broker. A pendência 3 do relatório da H.3 já registra isso.
**Correção sugerida:** no `ci-core-service.yml`:
- `services: rabbitmq` com o mesmo cuidado do `.erlang.cookie` usado no workflow do analytics;
- passo com `infra/k8s/rabbitmq-setup.sh`;
- `npm ci` em `services/analytics-service`;
- variáveis `RABBITMQ_*` e `ANALYTICS_PIPELINE_PORT`, como no `.env.test.example` do core.
