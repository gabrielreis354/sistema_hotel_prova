# Repasse para Weslley — 19/10/2026
Origem: `docs/qa/redteam_t042-consumption-migration_19out2026.md`, achado 🔴-1 (branch `feature/t04-2-consumption-migration`, dev Sirlande). O defeito de dado foi corrigido na branch; resta a parte de infraestrutura, que é sua.

### 🟡 [deploy] `migrate` roda depois de os pods novos já receberem tráfego
**Onde:** `start.sh:91-94` (`cmd_migrate` faz `kubectl exec ... deploy/backend -- node command.js migrate`).
**Cenário:** a partir da T-04.2, o `migrate` também migra **dados**: o consumo antigo (`consumptions`) passa para itens de conta (`account_items`). Entre os pods novos subirem e alguém rodar `./start.sh migrate`, o código novo procura os consumos em `account_items` e eles ainda estão só em `consumptions`.
- O que a branch já garante: nesse intervalo, o bill e a lista de consumos de cada reserva afetada respondem **503**, nunca um valor sem os consumos (`app/utils/pendingLegacyConsumption.js`). Nenhum dinheiro sai errado; a recepção só não consegue fechar a conta até o `migrate` rodar.
- Se a migração deixar reservas para trás por dado inválido, o `migrate` sai com **código 1** e lista as reservas. As outras ficam migradas.

**Correção sugerida:** rodar o `migrate` **antes** de os pods novos receberem tráfego — por exemplo um `Job` (ou `initContainer`) de migrate no `infra/k8s/` que o rollout espera, ou ao menos reordenar o procedimento do `start.sh`/runbook para `migrate` antes do `rollout`. E tratar o código 1 do `migrate` como falha do deploy.

---
*Acréscimo do qa-redteam, reauditoria delta de 19/10 (`docs/qa/redteam_t042-consumption-migration_delta_19out2026.md`):*

### 🟢 [deploy] `migrate` só **antes** do rollout deixa 503 preso até o próximo deploy
**Onde:** `start.sh:91-94`, e a correção sugerida acima.
**Cenário:** se o `migrate` rodar como Job/initContainer **antes** do rollout, os pods **antigos** continuam no ar durante o rolling update e gravam consumo novo em `consumptions`, porque o código antigo ainda tem o `ConsumptionModel` e a tabela segue existindo (D-27). Esses consumos ficam fora de `account_items`, e o `bill` dessas reservas responde **503** (fail-safe, sem dinheiro errado) até alguém rodar o `migrate` de novo. Nenhum alarme dispara: o `migrate` já saiu com 0.
**Correção sugerida:** rodar o `migrate` antes **e de novo depois** que o rollout terminar. Ele é idempotente: a 2ª execução só pega o que os pods antigos gravaram no intervalo. Também dá para escalar os pods antigos a 0 antes do 2º `migrate`. O código 1 continua significando "reserva com dado inválido, ver a lista no log".
