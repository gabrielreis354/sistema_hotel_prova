# Repasse para Weslley — 23/10/2026
Origem: `docs/qa/redteam_analytics-service-h2_21out2026.md` (branch `feature/analytics-service`, H.2 da T-01.4, trilha do Gabriel). Os dois pontos são da sua área (`.github/workflows` e `infra/k8s/`) e não reprovam a branch.

### 🟡 [CI] A suíte do analytics-service não roda no CI: o portão de 60% não vale para o serviço novo
**Onde:** `.github/workflows/ci.yml:40` (`working-directory: services/core-service`) e `:82` e `:93`. Só o core é instalado e testado.
**Cenário:** um PR que quebre `services/analytics-service/` passa verde. Exemplos: o consumidor deixar de dar *ack*, a barreira de idempotência sumir, o isolamento por tenant regredir. Hoje a suíte tem 70 testes e 94% de cobertura, mas só roda na máquina de quem lembra.
**Regra violada:** portão de cobertura de 60% do CI; "feature nova sem teste" na prática.
**Correção sugerida:** criar um job `analytics-service` com `services: postgres` e `cp .env.test.example .env.test` (com o `POSTGRES_PORT` do serviço), depois `npm ci && npm run test:coverage`. O teste com broker é pulado sem `RABBITMQ_HOST`. Para rodá-lo (cerca de 45 s), acrescentar `services: rabbitmq` (`rabbitmq:4-management-alpine`), executar o `infra/k8s/rabbitmq-setup.sh` e preencher as variáveis `RABBITMQ_*` do `.env.test.example`.

### 🟡 [infra / SUSPEITA] A fila *quorum* `analytics.core-events` faz *dead-lettering* `at-most-once` (padrão): uma mensagem em nova tentativa pode se perder numa falha do broker
**Onde:** `infra/k8s/rabbitmq-setup.sh:42-43`. A fila é declarada com `x-dead-letter-exchange = analytics.retry`, sem `x-dead-letter-strategy`.
**Cenário:** o consumidor dá *nack* sem reenfileirar num erro transitório (catálogo §5.3), e o broker deve levar a mensagem a `analytics.core-events.retry`. Em fila *quorum*, o padrão é `at-most-once`: se o destino não aceitar a mensagem naquele momento, ela é descartada sem aviso. Isso acontece com o nó reiniciando, alarme de memória ou disco, ou fila de espera indisponível. A projeção do analytics fica sem aquela alteração até outro evento do mesmo registro, o que pode nunca acontecer (ex.: pagamento `PAID` que não muda mais), e a receita fica errada sem erro nenhum.
**Status:** SUSPEITA. É o comportamento documentado do RabbitMQ para filas *quorum*, mas não foi reproduzido. Para confirmar: derrubar `analytics.core-events.retry` (ou provocar alarme) enquanto uma mensagem leva *nack*, e conferir se ela some.
**Regra violada:** catálogo §5.3/§5.4, entrega "pelo menos uma vez".
**Correção sugerida:** `--arguments '{"x-dead-letter-exchange":"analytics.retry","x-dead-letter-strategy":"at-least-once","x-overflow":"reject-publish"}'`. O `at-least-once` exige `reject-publish`. Atenção: argumento de fila não muda em fila já declarada, então é preciso usar *policy* (`rabbitmqctl set_policy`) ou recriar a fila numa janela. Avaliar também se a fila de espera (`classic`) deve ser durável/quorum.
