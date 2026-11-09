# QA Red Team — CI do analytics, RabbitMQ no CI do core e ressalvas do Asaas
**Branches:** `feature/ci-analytics-service` (d3cc9a1) · `chore/ci-core-rabbitmq` (f451ac5) · `fix/asaas-ressalvas` (b739d0c, PR #111) · **Dev:** Weslley · **Base:** develop@3e68e7f · **Data:** 04/11/2026
**Arquivos auditados:** 9 (2 workflows, 1 teste do analytics, controller do webhook, swagger.js, openapi.json, schema.d.ts, 2 testes do core) + contexto: `tests/helpers/analyticsPipeline.js` e `tests/analytics.test.js` da H.3 (046505a), `infra/k8s/rabbitmq-setup.sh`, `CreateBookingController.js`, `docs/pagamentos/ASAAS_SANDBOX.md`
**Achados no escopo:** 7 (🔴 0 · 🟡 1 · 🟢 6) · **Repassados:** 1

Sem alerta fora do escopo.

## Veredito por branch

| Branch | Veredito |
|---|---|
| `feature/ci-analytics-service` | **APROVADO COM RESSALVAS** (🟢-1, 🟢-2) |
| `chore/ci-core-rabbitmq` | **APROVADO COM RESSALVAS** (🟡-1, 🟢-3) |
| `fix/asaas-ressalvas` (PR #111) | **APROVADO COM RESSALVAS** (🟢-4 a 🟢-7, só texto e comentário) |

Nenhum 🔴 no escopo.

## Achados no escopo

### 🟡-1 [CI / fail-open] Os casos de dinheiro do pipeline podem sumir do CI do core sem deixar o job vermelho
**Onde:** `.github/workflows/ci-core-service.yml:101-109` (branch `chore/ci-core-rabbitmq`), junto com `services/core-service/tests/analytics.test.js:26` e `tests/helpers/analyticsPipeline.js:24-26` da H.3 (046505a)
**Cenário:** o workflow só põe as variáveis no ambiente. Quem decide se os 20 casos de ponta a ponta rodam é o `describe.skip` da H.3: se `RABBITMQ_HOST` ou alguma `RABBITMQ_*_PASSWORD` não chega, o teste só imprime um `console.warn`. Hoje roda: no run 41928725922 os 28 casos de `analytics.test.js` aparecem com ✓, a linha "PULADO" não aparece, e o único caso pulado é o de `reservations.test.js` (já existia). Mas um renome de variável no helper, um `.env.test` com `RABBITMQ_HOST=` vazio (o `env.js` do core carrega com `override: true`) ou um bloco de `env:` apagado num refactor do workflow deixa o job **verde**, sem os casos "estorno fora da receita (D-2)" e "no-show só com PAID (D-3)". É exatamente o buraco que o repasse de 02/11 pediu para fechar, e ele pode reabrir sem ninguém ver.
**Regra violada:** CLAUDE.md §7 (fail-safe, não fail-open), aplicada ao portão de CI de código que calcula dinheiro.
**Correção sugerida:** no workflow, fazer o job falhar quando o pipeline for pulado. Por exemplo, `set -o pipefail; npm run test:coverage 2>&1 | tee vitest.out` seguido de `! grep -q "pipeline PULADO" vitest.out`. A forma mais robusta fica do lado do teste: `if (process.env.CI && !pipelineConfigured) throw ...`. Essa parte foi repassada ao Gabriel (abaixo).

### 🟢-1 [CI / fail-open] O `sed` do `.env.test` do analytics não confere se trocou alguma coisa
**Onde:** `.github/workflows/ci-analytics-service.yml:102-109`
**Cenário:** se a linha `RABBITMQ_HOST=` do `.env.test.example` virar comentário ou mudar de nome, o `sed` não casa com nada e o `RABBITMQ_HOST` fica vazio. Aí o `describe.skipIf(!temBroker)` (`rabbitmq.integration.test.js:38`) pula os 10 casos com broker real (idempotência, DLQ, §8 de credencial), e o job continua verde. No run 41927281059 eles rodaram (10 ✓, 104 testes).
**Correção sugerida:** depois do `sed`, `grep -qx 'RABBITMQ_HOST=localhost' .env.test || { echo '.env.test sem broker'; exit 1; }`.

### 🟢-2 [Doc] O comentário cita um job que não existe
**Onde:** `services/analytics-service/tests/rabbitmq.integration.test.js:13`
**Cenário:** o comentário diz "job test-analytics", mas o job se chama `test` e fica no workflow "CI — analytics-service". Quem procurar pelo nome não acha.
**Correção sugerida:** "No CI roda: workflow ci-analytics-service.yml, com services: rabbitmq."

### 🟢-3 [DRY] O broker e o passo de topologia estão copiados nos dois workflows
**Onde:** `.github/workflows/ci-core-service.yml:72-85,124-134` e `.github/workflows/ci-analytics-service.yml:62-75,88-98`
**Cenário:** o contorno do `.erlang.cookie` (intervalo de 10 s), a imagem e a senha de administrador estão duplicados. Uma correção feita num workflow só deixa o outro com o bug antigo.
**Correção sugerida:** aceitável por enquanto (são 2 cópias). Na 3ª cópia (b2b-service), extrair uma composite action em `.github/actions/rabbitmq-ci/`.

### 🟢-4 [Comentário desatualizado] O controller ainda fala em 404/400
**Onde:** `services/core-service/app/Controllers/WebhookApi/PixWebhookController.js:42-44`
**Cenário:** o comentário diz que a requisição não assinada "não deve nem ganhar a chance de descobrir se um charge_id existe (404) ou não (400)". Esses códigos não existem mais: a requisição autêntica recebe 200 ignored. Quem ler o comentário vai procurar um 404 que não está lá.
**Correção sugerida:** "…descobrir se um charge_id existe — sinal que ajudaria a enumerar cobranças."

### 🟢-5 [Contrato / texto] Falta uma vírgula na descrição do schema (replicada no cliente)
**Onde:** `services/core-service/config/swagger.js:488` e `frontend/packages/api-client/openapi.json:1494`
**Cenário:** "…(o pagamento vira FAILED) "pending" quando…": falta a vírgula depois de `FAILED)`. Isso não afeta tipos (o enum está certo), só a leitura do Swagger.
**Correção sugerida:** acrescentar a vírgula e rodar o gerador do cliente de novo.

### 🟢-6 [Doc operacional] O guia do Asaas ainda diz que cobrança desconhecida responde 404
**Onde:** `docs/pagamentos/ASAAS_SANDBOX.md:195-196`
**Cenário:** o guia lista como limitação "Webhook de cobrança desconhecida responde 404: o Asaas reenvia e, após 15 falhas seguidas, pausa a fila". O PR #111 corrigiu exatamente isso, mas o operador que ler o guia vai continuar evitando compartilhar a conta sandbox por um motivo que deixou de existir.
**Correção sugerida:** trocar por "Cobrança desconhecida responde 200 `ignored` com log (reconciliar pelo id no log)".

### 🟢-7 [Observabilidade / teste] O log do "ignored" sem id não diz o que chegou, e um nome de teste promete mais do que testa
**Onde:** `PixWebhookController.js:64`; `services/core-service/tests/asaas-webhook.test.js:307`
**Cenário:** (a) a notificação autêntica sem id loga só "ignorada". Se um provider mudar o formato do corpo e todas as confirmações passarem a cair aqui, o log não mostra o `event` nem o tipo para diagnosticar. Hoje o 400 ao menos aparecia como falha no painel do PSP; agora o painel fica verde. (b) O teste "SEM token" manda um token **errado**, não a ausência de token. O caso de cabeçalho ausente é coberto em outros testes do arquivo, então não há buraco de cobertura, só o nome errado.
**Correção sugerida:** (a) incluir no log `typeof provider_charge_id` e `request.body?.event`, que não são PII. Considere também uma métrica ou alerta para volume de `ignored`. (b) Renomear o teste para "token inválido".

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | No CI, o `describe.skip` do pipeline deveria falhar em vez de pular (`process.env.CI`) | `services/core-service/tests/analytics.test.js:26` (H.3, 046505a) | Gabriel (T-01.4) | `docs/qa/repasses/para_gabriel_04112026.md` |

## O que foi verificado e está correto

- **Os casos do pipeline rodaram de fato** (run 41928725922, branch descartável = `feature/analytics-cutover@50afa89` + f451ac5). Os 28 casos de `analytics.test.js` passaram, incluindo os 3 de "estorno fora da receita (T-06.13, D-2)" e os 3 de "no-show só PAID (D-3)", sem a linha "PULADO". O único skip é `reservations.test.js` (já existia). Resultado: 1135 passed, 1 skipped, 53 arquivos, cobertura de 86,16% de statements.
- **Run 41927281059 (analytics):** `rabbitmq.integration.test.js` rodou os 10 casos com broker real, incluindo o §8 (a credencial do analytics não publica na exchange do core). Resultado: 104/104, cobertura de 95,66%.
- **Run 41927544363 (core em `chore/ci-core-rabbitmq`) verde.** Os checks do PR #111 em b739d0c estão verdes: core, frontend e "Contrato da API em dia".
- **Segredos:** só há senhas de runner (`rabbitmq_ci_password`, `core_ci_password`, `analytics_ci_password`, `hotel_password`), sem nenhum `secrets.*` real. `permissions: contents: read` nos dois workflows.
- O helper da H.3 entrega ao processo do analytics um ambiente mínimo (`analyticsPipeline.js:34-50`), sem a chave privada do JWT nem o resto do ambiente do core.
- **Efeitos colaterais em outros jobs:** com `RABBITMQ_HOST` no ambiente do job do core, o publicador do outbox só sobe via `_web.js`, e nenhum teste do core na develop lê `RABBITMQ_*` (grep). A porta 3063 e o banco `gesway_analytics_pipeline_test` não colidem com nada. Os grupos de `concurrency` são distintos, e o `ci.yml` (checagens) não foi tocado.
- **Os paths de trigger** dos dois workflows incluem `services/analytics-service/**` e `infra/k8s/rabbitmq-setup.sh`. É intencional: uma mudança no consumidor quebra o pipeline do core. `workflow_dispatch` está presente para diffs com mais de 300 arquivos.
- **PixWebhookController após o merge:** a diff contra a develop tem só os 2 hunks do fix. O `settlePaymentAccount(lockedPayment, transaction)` (T-04.4) está mantido na linha 169, dentro da transação, depois do lock da reserva.
- O `typeof provider_charge_id !== 'string'` (linha 63) vem **antes** do `findOne` (linha 69), e o teste confirma com espião que o `PaymentModel.findOne` não é chamado (`public-booking.test.js`).
- O 401 continua antes de qualquer consulta (linhas 46-56). O teste com token inválido e cobrança desconhecida confirma esse 401 (`asaas-webhook.test.js:307`).
- Os testes cobrem a cobrança desconhecida (Asaas e fake, com o id no log e sem chamar o PSP), a ausência de id (corpo `{}` e evento de conta do Asaas) e o array no id.
- **Swagger e cliente:** sem 400/404 no `/webhooks/pix`, com `ignored` no enum, e `openapi.json`/`schema.d.ts` regenerados.
- **Corrida possível:** o `CreateBookingController.js:103` cria a cobrança antes de abrir a transação (`:119`, commit em `:199`). Um `PAYMENT_CREATED` que chegue antes do commit agora recebe 200 ignored em vez de 404. Isso não perde confirmação: o evento não é terminal, e o `PAYMENT_RECEIVED` exige que o hóspede pague um QR que só sai na resposta, depois do commit.

## Não foi possível verificar

- **`services/analytics-service/tests/analytics-queries.test.js`** (receita sem VOIDED no nível das consultas do analytics) ainda não rodou no GitHub com o `ci-analytics-service.yml`. Ele só existe na H.3, e o workflow só existe nesta branch. A cobertura do dinheiro está comprovada, hoje, apenas pelo pipeline no CI do core. Depois que as duas entrarem na develop, rode o workflow (`workflow_dispatch`) e confira se o arquivo aparece no log.
- O comportamento real do Asaas sandbox para um 200 em evento desconhecido (sem chamada externa nesta auditoria).
- A branch `test/ci-core-h3` foi apagada do remoto durante a auditoria. A leitura foi feita pelo commit 046505a.
