# QA Red Team — analytics-service H.2 (reauditoria delta)
**Branch:** feature/analytics-service · **Dev:** Gabriel (executor) · **Base:** develop@a6dc1ea (merge 35cf86f) · **Delta:** fc474e5..f09af9d · **Data:** 24/10/2026 a 29/10/2026 (sessão interrompida por limite de uso, retomada na ponta f09af9d)
**Arquivos auditados:** 22 do delta: `analytics-service` (`consumer.js`, `catalog.js`, `router.js`, `createApp.js`, `_web.js` e 5 testes), `core-service` (`GuestApi/Create|Update`, `isNonBlankString.js`, `outboxInitialLoad.js`, `guest-name-validation.test.js`, `outbox-initial-load.test.js`, `outbox-develop-flows.test.js`) e SPEC-01 catálogo v1.1 e v1.1.1. Também a resolução do merge 35cf86f.
**Achados no escopo:** 4 (🔴 0 · 🟡 1 · 🟢 3) · **Repassados:** 2

## Veredito
**APROVADO COM RESSALVAS**

As 5 ressalvas 🟡 e as duas 🟢 da 1ª rodada estão fechadas. Reproduzi com broker e banco reais. O que segue aberto é um achado novo, 🟡-A, que nasce da própria correção do 🟡-3. A pausa por "banco fora" devolve a mensagem sem *ack* nem *nack*, e cada devolução soma no `delivery-limit` padrão (20) da fila *quorum*. Na 21ª entrega, o RabbitMQ manda a mensagem para a fila de espera, detecta um ciclo de *dead-letter* sem `rejected` e **descarta a mensagem em silêncio**. Ela não vai para a DLQ. Numa queda real do banco isso não acontece: o `ready()` segura o consumo e a mensagem é devolvida uma vez só por queda. Para acontecer, o banco precisa estar meio no ar (`SELECT 1` passa, a transação falha com erro de conexão), ou a mensagem precisa ser venenosa e ser classificada como conexão. Não é 🔴 porque não achei um gatilho concreto vindo do conteúdo da mensagem. Mas é perda silenciosa, contra o próprio §5.3, e convém corrigir antes da H.3.

**Merge da develop: não precisa de outro antes do PR por conflito.** A ponta f09af9d já contém a develop até a6dc1ea, e o merge 35cf86f não teve conflito. Conferi o diff combinado: só o catálogo §4.6 juntou linhas das duas versões, e o resultado está certo. Desde então a develop andou um merge (`94f7abf`, migrate antes e depois do rollout: `start.sh`, `infra/k8s/jobs`, `networkpolicy.yaml` e docs). `git merge-tree --write-tree f09af9d origin/develop` → rc 0, sem conflito, e nenhum desses arquivos toca o `analytics-service` ou o código do core desta branch. O PR pode ir assim, porque o GitHub faz o merge limpo. Se a regra for "branch atualizada antes do PR", basta um `git merge origin/develop` trivial.

## Ressalvas da 1ª rodada — conferência

| Ressalva | Como conferi | Resultado |
|---|---|---|
| 🟡-1 queda do broker derruba o processo | Script com o `createConsumer` real e o RabbitMQ 4.3.6 real. Com o `apply` parado no meio da transação, fechei a conexão do analytics pela API de gestão (`DELETE /api/connections`) e depois liberei o commit | **Fechada.** Log: `ack perdido (Channel closed) — o broker reentrega`. O processo segue, reconecta em 0,7 s, a reentrega cai em `duplicate` (2 *applies*, 1 linha na projeção) e as filas ficam vazias. Nenhuma *unhandled rejection* (o script sai com 99 se houver) |
| 🟡-2 carga inicial sem `lock_timeout` | O teste `outbox-initial-load.test.js` (🟡-2) roda contra PostgreSQL 17 real: uma transação longa em `payments`, a carga com `lock_timeout` 300 ms e uma escrita da API com `statement_timeout` 2 s | **Fechada.** A escrita passa em menos de 2 s, a carga desiste com a mensagem "fora do pico" depois de 3 tentativas e roda inteira em seguida. `SET LOCAL` interpola só inteiro validado (`outboxInitialLoad.js:57`), sem injeção |
| 🟡-3 banco do analytics fora → DLQ | `docker stop pg-qah2b` por 42 s com o consumidor real e o `applyEvent` real, publicando 1 evento a cada 2 s | **Fechada.** A transação em andamento recebe `57P01`, o consumo pausa (`status connecting`), a fila acumula (2 → 21) e nada vai para a DLQ nem para a fila de espera. Com o banco de volta, **30/30 aplicados**. Ver o 🟡-A para o caso em que o banco fica meio no ar |
| 🟡-4 nome em branco | `guest-name-validation.test.js` (core) e `catalog.test.js` (analytics) | **Fechada nos dois lados.** O core recusa `''`, `'   '`, `'\t\n'`, `null` e `42` no POST e no PUT, e o consumidor aceita texto em branco e recusa `null`. O resíduo na reserva pública e no contrato foi repassado (ver abaixo) |
| 🟡-5 desvios fora do catálogo | Leitura da SPEC-01 v1.1 e v1.1.1 contra `catalog.js`, `applyEvent.js` e `outboxInitialLoad.js` | **Fechada.** `reservation_id` nulo (`uuidOuNulo`), `*.deleted` na carga, `lock_timeout` 3 s, §5.3 e a linha 1.1 no histórico. A frase do §5.3 "**sem** `x-death` … não conta tentativa" só é verdadeira até 20 devoluções (🟡-A) |
| 🟢 `/health` | `health.test.js` mais leitura de `router.js` | **Fechada.** O `/health` responde 503 com o banco fora ou o consumidor sem consumir, e não vaza a mensagem do erro. Documentação de readiness: ver o 🟢-D |
| 🟢 SIGTERM | `consumer-resilience.test.js` (🟢-4) mais um script | **Fechada no caminho normal**: cancela, espera o *ack* da mensagem em andamento e só então fecha. Há uma janela de corrida (🟢-B) |

**Testes antigos alterados (08006 → 40P01):** a troca é justificada. Com o 🟡-3, `08006` passou a ser falha de infraestrutura e saiu do caminho de tentativas. Por isso os testes que exercitam "5 tentativas → DLQ" precisavam de um transitório **da mensagem**, e o deadlock é o caso canônico. O `08006` não perdeu cobertura: está em `consumer-resilience.test.js` (`isInfrastructureFailure(... '08006') === true`). `40P01` e `22003` aparecem como **não** infraestrutura. O teste de integração ganhou o caso "banco fora → sem DLQ".

## Achados no escopo

### 🟡-A [resiliência / perda silenciosa] A pausa por "banco fora" gasta o `delivery-limit` da fila *quorum*, e na 21ª entrega o broker descarta a mensagem
**Onde:** `services/analytics-service/app/consumer/consumer.js:120-123` (caminho de infraestrutura: nem *ack*, nem *nack*, fecha a conexão), `consumer.js:70` (classificação por SQLSTATE e nome) e catálogo §5.3, `SPEC-01-catalogo-eventos.md:231` (a garantia "não conta tentativa, **sem** `x-death`")
**Cenário (reproduzido, RabbitMQ 4.3.6 com a topologia de `rabbitmq-setup.sh`):** uma mensagem cujo `apply` sempre lança um erro classificado como conexão (`original.code = '08P01'`, *protocol_violation*, classe 08), com o banco no ar para o `ready()` (`SELECT 1`). Em seguida, um evento comum.
- Entregas 1 a 21: cada uma pausa e fecha a conexão. O `x-delivery-count` vai de 1 a 20, sem `x-death`, e `previousFailures = 0` em todas.
- Depois da 21ª, a mensagem some. O log do broker diz: `Message dropped because the following list of queues ... contains a dead letter cycle without reason 'rejected'`.
- Resultado: `analytics.core-events` 0, `.retry` 0, **`.dlq` 0**. O evento comum foi aplicado. O broker registra `delivery_limit not set, defaulting to 20`.

O mecanismo está confirmado. O gatilho é uma **SUSPEITA**: não achei conteúdo de mensagem que gere `08*`, `57P0x`, `53300` ou erro de conexão do Sequelize. Os gatilhos plausíveis são de infraestrutura parcial: `pg_terminate_backend` repetido (`57P01`), `53300` com o `ready()` usando uma conexão já aberta do *pool*, ou `SequelizeConnectionAcquireTimeoutError` com *prefetch* 10 e *pool* 5. Cada pausa devolve **todas** as até 10 mensagens em andamento, então as inocentes também gastam o limite. Antes desta branch, a mesma mensagem ia para a DLQ depois de 5 tentativas, onde dava para ver e reprocessar. Agora desaparece.
**Regra violada:** catálogo §5.3 ("perder o evento é pior que repeti-lo") e CA-01.4.i. Fail-safe: a pausa não tem teto.
**Correção sugerida (a menor):** no caminho de infraestrutura, ler `msg.properties.headers['x-delivery-count']`. Acima de um teto (por exemplo, 10), tratar como transitório comum: `nack` sem reenfileirar, motivo `rejected` e `x-death` contado, até a DLQ na 5ª passagem. Um `rejected` no caminho também quebra a regra de ciclo do broker. Teste de integração: `apply` que sempre lança `SequelizeConnectionRefusedError` e um `ready()` que passa, e a mensagem precisa chegar à DLQ, não sumir. Corrigir a frase do §5.3. A parte da topologia (`delivery-limit` explícito por *policy*) foi repassada ao Weslley.

### 🟢-B [SIGTERM] `stop()` chamado enquanto `connect()` ou `ready()` está em andamento nunca resolve
**Onde:** `consumer.js:178-190` (depois de `await connect()`, o laço não confere `running`) e `consumer.js:222-235` (`stop()` só fecha `atual` se ele já existir, depois espera o `laco`)
**Cenário (reproduzido com `connect` falso):** `start()`, depois `stop()` antes de o `connect()` resolver, e então o `connect` resolve. Resultado: `stop() durante connect: TRAVOU (3 s) | status: consuming | conexão fechada: false`. O consumidor **começa a consumir depois do SIGTERM**, e o `encerrar()` do `_web.js` fica esperando até o SIGKILL (10 s no compose, 30 s no k8s). Um `stop()` durante o `sleep(backoff)` também espera até 30 s. Não perde dado (*at-least-once* mais idempotência), mas o "desligamento ordenado" não vale nessa janela, que é justamente a de *restart* com o broker ou o banco instável.
**Correção sugerida:** depois de `await connect()`, fazer `if (!running) { await atual.close(); break; }`, e tornar o `sleep` interrompível no `stop()`.

### 🟢-C [resiliência] O *backoff* não zera depois de uma pausa que se recupera
**Onde:** `consumer.js:195` (`if (!pausado) backoff = 0`) e `consumer.js:210`
**Cenário (lido no código):** pausa 1 → espera 1 s e volta a consumir. Horas depois vem a pausa 2 → espera 2 s, e assim por diante. Depois de 5 ou 6 quedas do banco num mesmo processo, toda pausa espera 30 s logo de cara, mesmo que o banco volte em 1 s. Na reprodução do 🟡-A, 21 pausas com `maxBackoffMs` 100 confirmam que o valor só sobe. Só uma queda do broker zera o contador.
**Correção sugerida:** zerar o `backoff` quando o consumo volta (no `estado = 'consuming'`) e deixar o aumento só para as falhas seguidas do `ready()` e do `connect()`.

### 🟢-D [operação] "`/health` é readiness, não liveness" só está escrito num comentário e no relatório
**Onde:** `routes/router.js:21-24` (comentário: "probe de prontidão"), `docs/historico_sessao/gabriel/analytics_service_h2_21102026.md:134` (pendência 10) e `Dockerfile:26-27` (`HEALTHCHECK` no mesmo `/health`)
**Cenário:** com o broker fora, o `/health` responde 503 de propósito. No compose isso só marca o contêiner como `unhealthy`. No Docker Swarm, que é o *staging* do projeto (CLAUDE.md §3), um `HEALTHCHECK` falhando **substitui a task**: o analytics reiniciaria em laço enquanto o broker estiver fora, que é o oposto do que o 🟡-3 buscou. Não existe ainda manifesto k8s nem stack Swarm do analytics (H.3), então nada quebra hoje. Falta a regra estar no lugar que quem escreve a H.3 vai ler: `docs/infra/KUBERNETES.md` e o próprio `Dockerfile`. O `checkDatabase` também não tem prazo: com o banco pendurado, o `/health` espera o *acquire* do *pool* (60 s), mais que o `--timeout=5s`. Não afeta o resultado (conta como falha), mas prende uma conexão HTTP por sonda.
**Correção sugerida:** uma linha em `KUBERNETES.md` (readiness `/health`, liveness num `/live` que só responde 200, ou nenhuma) e um comentário no `HEALTHCHECK`. Opcional: `Promise.race` de 2 s no `checkDatabase`.

## Merge com a develop e o catálogo 1.1.1

- **35cf86f** (develop até a6dc1ea): sem conflito. No `--cc`, só o §4.6 do catálogo junta as duas versões, com o `reservation_id` nulo da branch e o `VOIDED` e os `type` da T-06.13. Ficou coerente. `command.js` mantém o `outbox-initial-load`. `applyDbConstraints.js` mantém os triggers e o `outbox_payload`, e a develop só acrescentou os CHECKs de `payments`.
- **Coerência com o #100 (VOIDED):** o `catalog.js` aceita `VOIDED` em `payment.status` e aceita `payment.deleted`. A carga inicial emite um pagamento `VOIDED` vivo como `payment.updated` com `status: VOIDED`, que fica fora da receita porque a projeção conta só `PAID`. Quem tiver `deleted_at` sai como `payment.deleted`. Coerente com a nota da §9.1 e com a ressalva do §6 (1.1.1). `DELETE /payments/:id` → 405 confirmado em `paymentRouter.js:18-33`.
- **`outbox-develop-flows.test.js`:** faz o que diz. O check-in com a conta da suíte emite só tipos do catálogo, com `reservation.status_changed` e `room.updated`. Conta, item e fechamento não emitem nada. O pagamento de conta sem reserva sai com `reservation_id: null`. Ele confere o lado do core, não se o payload passa no `parseEvent` do analytics (ver "Não foi possível verificar").
- **Pequeno, sem achado:** a nota da §9.1 se chama "Estado em 21/10/2026" mas entrou em 29/10. A linha 1.1.1 do histórico deixa a data certa.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | A fila *quorum* principal usa o `delivery-limit` padrão (20), e o *dead-letter* por `delivery_limit` volta em ciclo e é descartado pelo broker. É a parte da topologia do 🟡-A | `infra/k8s/rabbitmq-setup.sh:42-43` | Weslley | `docs/qa/repasses/para_weslley_29102026.md` |
| 🟢 | Nome de hóspede em branco ainda entra pela reserva pública e pela assinatura de contrato (o resíduo do 🟡-4) | `PublicBookingApi/CreateBookingController.js:43`, `ContractApi/SignContractController.js:19-28` | DONO INDEFINIDO | `docs/qa/repasses/para_indefinido_29102026.md` |

## O que foi verificado e está correto

- **Classificação de infraestrutura** (`consumer.js:63-75`): a *allowlist* de nomes do Sequelize mais a regex ancorada `^(08|57P0[1-3]$|53300$)`. `40P01`, `40001`, `57014` (*statement timeout*) e `22*`/`23*` continuam no caminho de tentativas e de erro permanente. O `PermanentEventError` é avaliado depois e nunca é de conexão. Não há loop infinito com o banco **realmente** fora: o `ready()` segura, como mostra a reprodução.
- O handler nunca rejeita: `tratarFalha` fica dentro de `try/catch`, e todo *ack*/*nack* passa por `semLancar`.
- O log continua sem payload (LGPD): só tipo e id do evento.
- O `/health` não expõe o erro do banco, e a rota `/analytics/*` continua com `auth + tenant + requireRole`.
- Nenhum `require()` no delta, e as transações da carga ficam por tabela.
- `isNonBlankString` é usado no Create e no Update de `GuestApi`. O PUT sem `full_name` continua editando os outros campos.
- **Suítes na ponta f09af9d** (PostgreSQL 17 `pg-qah2b`:5456 e RabbitMQ 4.3.6 `rmq-qah2b`:5696, com a topologia oficial):
  - core: **48 arquivos, 1006 passed, 1 skipped**, Statements 84,46 %, Branches 80,78 %;
  - analytics: **7 arquivos, 84 passed, 0 skipped** (o teste de integração com RabbitMQ real rodou), Statements 95,53 %, Branches 89,47 % (consumer.js 92,71 %).
  - Na ponta anterior (40831be), antes do merge: core 41 arquivos / 851 passed, analytics 7 / 84 passed, 95,53 % Statements.
- **`scripts/qa_checks.sh`:** "Nenhum erro bloqueante". Os 3 avisos são de arquivos fora desta branch: Swagger de `corporate-client`, `event-quote` e `room-category`, e o frontend `GuestsListPage`.

## Não foi possível verificar

- **Gatilho real do 🟡-A vindo do conteúdo da mensagem:** não achei. Por isso a parte do gatilho fica como SUSPEITA, e o mecanismo, como confirmado.
- **Contrato ponta a ponta core → analytics** nos fluxos novos da develop (o payload real do outbox passando no `parseEvent`): o `outbox-develop-flows.test.js` confere só o core. A integração RabbitMQ do analytics usa envelopes montados pelo helper.
- **Comportamento em Swarm ou k8s do `HEALTHCHECK`** (🟢-D): ainda não existe manifesto do analytics, então avaliei pela documentação do Docker.
- **Suítes num merge com a develop mais nova (94f7abf):** não rodei, porque o merge é textual e limpo e não toca código testado (`start.sh`, `infra/k8s`, docs).

Ambiente: `pg-qah2b` (5456) e `rmq-qah2b` (5696/15696), removidos ao final. Os `.env.test` dos dois serviços foram restaurados (backup `.qah2b.bak`). Os scripts de reprodução ficaram fora do repositório, no *scratchpad* da sessão.
