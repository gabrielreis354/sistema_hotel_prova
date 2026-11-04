# Repasses para o Gabriel — 04/11/2026

Origem: `docs/qa/redteam_ci-rabbitmq-asaas-ressalvas_04112026.md` (branches de CI do Weslley:
`chore/ci-core-rabbitmq`, `feature/ci-analytics-service`). O achado fica no teste da H.3
(T-01.4, área do Gabriel). Não reprova nenhuma branch.

> **Lado do workflow já coberto (04/11):** o `ci-core-service.yml` da `chore/ci-core-rabbitmq` (PR #115)
> falha quando o log traz `pipeline PULADO`. A correção no teste, abaixo, continua valendo: ela
> cobre o caso em que a mensagem do `console.warn` mude de texto.

---

### 🟡 [Testes / fail-open] No CI, o pipeline dos indicadores pode ser pulado com o job verde
**Onde:** `services/core-service/tests/analytics.test.js:26-29` e `tests/helpers/analyticsPipeline.js:24-26` (feature/analytics-cutover@50afa89)
**Cenário:** o CI do core agora tem broker (`chore/ci-core-rabbitmq`), e no run 41928725922 os 28 casos rodaram. Mas, se `RABBITMQ_HOST` ou alguma `RABBITMQ_*_PASSWORD` deixar de chegar ao processo, o `describe.skip` só imprime `console.warn` e o job fica verde. Isso pode acontecer por renome no helper, por um `.env.test` com valor vazio carregado com `override: true` ou por um refactor do workflow. Nesse caso somem do CI os casos "estorno fora da receita (D-2)" e "no-show só PAID (D-3)", que são código de dinheiro. O mesmo padrão existe em `services/analytics-service/tests/rabbitmq.integration.test.js:38` (`describe.skipIf(!temBroker)`).
**Regra violada:** CLAUDE.md §7 (fail-safe, não fail-open), aplicada ao portão de CI.
**Correção sugerida:** pular só fora do CI. Por exemplo:
`if (process.env.CI && !pipelineConfigured) throw new Error('CI sem broker: pipeline dos indicadores não pode ser pulado');`
O GitHub Actions define `CI=true`. Aplicar o mesmo no `rabbitmq.integration.test.js` do analytics.
