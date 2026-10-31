### 2026-10-21 — Gabriel (IA orquestrada: Claude Opus 5.5)

- **Branch:** `feature/analytics-service` (a partir de `origin/develop@c6742b2`), worktree `/home/gabri/wt-h2-analytics`
- **Objetivo da sessão:** Etapa H.2 da rodada 3 (T-01.4) — criar o `analytics-service`: serviço próprio,
  consumidor, projeções e carga inicial (CA-01.4.g, h, i, j, l, m)
- **Delegação:** `docs/delegacoes/rodada3_gabriel_04out2026.md`, etapa H
- **Contrato:** `docs/specs/anexos/SPEC-01-catalogo-eventos.md` v1.0 (sem alteração nesta etapa)
- **Ambiente de teste:** Postgres e RabbitMQ próprios (contêineres `pg-h2` em 5441 e `rmq-h2` em 5682,
  topologia e usuários aplicados com o `infra/k8s/rabbitmq-setup.sh` oficial). Removidos ao final.
- **PR:** não aberto (o Gabriel roda o qa-redteam e abre)

#### O que foi feito

| Entrega | Onde | Critério |
|---|---|---|
| Serviço próprio: `package.json`, `Dockerfile` multi-stage com `USER node` (sem `keys/`, `.env*` e `tests/` na imagem — conferido no contêiner), `_web.js`, `command.js migrate`, conexão Sequelize própria, vitest no estilo do core | `services/analytics-service/` | g |
| Banco próprio `gesway_analytics` no serviço `analytics-postgres` do compose (database per service) e serviço `analytics-service` (migrate antes de subir, só a chave pública montada, credencial do analytics) | `docker-compose.yml`, `.env.example` | g |
| Projeções dos 6 agregados (§4), cada linha com `tenant_id`, `aggregate_version` e `deleted_at`; `processed_events` | `app/Models/` | h, l |
| Validação do contrato em allowlist (20 tipos, versão 1, status, formato de UUID/dinheiro/data/instante); o que não cabe é erro permanente; campo desconhecido é ignorado (§7) | `app/events/catalog.js` | i |
| Aplicação idempotente: `processed_events` + upsert com `WHERE aggregate_version <` na mesma transação; `*.deleted` como marca pegajosa; `guest.erased` → "Hóspede eliminado"; "em limpeza desde" pelo `occurred_at`; evento de outro tenant com id existente → erro permanente | `app/events/applyEvent.js` | h, l, m |
| Consumidor: prefetch 10, ack depois do commit, nack sem reenfileirar no transitório, DLQ na 5ª falha (contagem pelo `x-death`) e direto no permanente, com `x-error`/`x-error-kind`/`x-attempts`; sem confirmação da DLQ não há ack; reconexão 1→30 s; só consome com o schema pronto; não declara nada (sem `configure`, §8) | `app/consumer/consumer.js` | h, i |
| JWT RS256 verificado só com a chave pública (`algorithms: ['RS256']`), boot recusa chave privada/não RSA, `tenantMiddleware` sobre `proj_tenants` (só ACTIVE), `requireRole('ADMIN','RECEPTIONIST')`, rota `GET /analytics/health` autenticada e `/health` público | `middlewares/`, `routes/router.js`, `app/utils/jwtPublicKey.js` | m |
| Carga inicial no CORE: `node command.js outbox-initial-load` grava no outbox o retrato atual de todos os registros com a mesma função `outbox_payload` dos triggers; `LOCK TABLE ... IN SHARE MODE` por tabela garante a ordem do §6 | `services/core-service/database/outboxInitialLoad.js`, `command.js` | j |
| `qa_checks.sh` passa a varrer também o analytics (ESM, findByPk, tenant do cliente, log de request) | `scripts/qa_checks.sh` | — |
| SPEC-01 com g, h, i, j, l, m marcados e evidência | `docs/specs/SPEC-01-microsservicos.md` | — |

#### Evidência por critério

| CA | Teste |
|---|---|
| g | `docker build` da imagem + ponta a ponta abaixo; `docker compose config -q` OK |
| h | `tests/projections.test.js` (mesmo evento 2×, versão antiga depois da nova, mesma versão com outro `event_id`, carga 2×, rollback desfaz `processed_events`) · `tests/rabbitmq.integration.test.js` (mesmo evento 2× e versão antiga, no broker real) |
| i | `tests/consumer.test.js` (permanente → DLQ + ack; transitório 1–4 → nack; 5ª → DLQ; sem confirmação da DLQ → nack) · `tests/rabbitmq.integration.test.js` (JSON inválido → DLQ sem bloquear o seguinte; transitório → 5 tentativas a cada 10 s, DLQ na 5ª, outro evento passa no meio) |
| j | `services/core-service/tests/outbox-initial-load.test.js` (um evento por registro, payload do catálogo, excluído → `.deleted`, rodar 2× = mesmo retrato com versão maior, ordem com escrita concorrente — **teste de mutação**: sem o `LOCK TABLE` o teste de ordem falha) · `tests/projections.test.js` (carga 2× não muda o estado) · ponta a ponta |
| l | `tests/projections.test.js` (colunas de `proj_guests`, campo pessoal extra descartado, `guest.erased`) |
| m | `tests/auth-isolation.test.js` (sem token, outra chave, HS256 com a pública, RS512, expirado, hotel suspenso/ausente, tenantId não-UUID, WAITER/papel desconhecido, contagens só do próprio hotel, `tenant_id` na query ignorado) · `tests/projections.test.js` (evento de outro hotel não sobrescreve) · `tests/rabbitmq.integration.test.js` (credencial do analytics recebe `ACCESS_REFUSED` ao publicar na exchange do core) |

#### Verificação (saída real)

- **analytics-service** — `npx vitest run --coverage` (com RabbitMQ real):
  `Test Files 5 passed (5)` · `Tests 70 passed (70)` · Statements **94.07%**, Branches 88.7%,
  Functions 89.09%, Lines 94.27%.
- **core-service** — `npx vitest run --coverage`: `Test Files 40 passed (40)` ·
  `Tests 841 passed | 1 skipped (842)` · Statements **83.45%**, Branches 79.27%, Functions 88.64%,
  Lines 85.86%. Antes da branch (mesmo ambiente): 39 arquivos, 836 + 1 skip, 83.4% stmts — os 5 testes
  novos são os da carga inicial; nenhum teste anterior mudou.
- **`bash scripts/qa_checks.sh`**: `⚠ 3 aviso(s). Nenhum erro bloqueante.` — os mesmos 3 avisos da
  `develop` (Swagger de routers e 2 do frontend), conferido rodando com e sem a mudança.
- **Ponta a ponta** (core do worktree + imagem Docker do analytics + RabbitMQ com a topologia oficial):
  dados criados pela API do core, outbox apagado (simula banco anterior à H.1), `outbox-initial-load`
  (1 tenant, 1 categoria, 1 quarto, 2 hóspedes, 1 reserva, 1 pagamento), publicador entregou e:
  - `GET /analytics/health` com o JWT do login do core → `200 {"status":"OK",...,"projections":{"room_categories":1,"rooms":1,"guests":1,"reservations":1,"payments":1}}`; sem token → `401`
  - `proj_guests`: `Ana E2E` vivo, `Bruno Excluido` com marca de exclusão; sem e-mail/telefone
  - `proj_reservations.total_amount = 800.00`, `proj_payments.amount = 300.10` (NUMERIC exato)
  - carga rodada **de novo**: hash das projeções antes = depois (`7613e139…`), 14 eventos em `processed_events`, 0 pendentes no outbox.

#### Decisões tomadas (precisam do aval do Gabriel)

1. **Carga inicial emite `*.deleted` para registros com exclusão lógica** (o §6 fala em `*.updated`).
   Motivo: as consultas atuais juntam hóspede, quarto e categoria **sem** filtrar `deleted_at` (alertas,
   receita por categoria); sem o registro excluído na projeção, essas linhas sumiriam. Com
   `*.updated`, o excluído apareceria vivo no ranking e na contagem de quartos. Mesmo payload, tipo que
   já existe no catálogo — nenhum contrato muda. Se aprovado, vale uma linha no §6 do catálogo.
2. **`LOCK TABLE ... IN SHARE MODE` na carga**, uma tabela por transação: bloqueia escrita na tabela
   enquanto a lê (milissegundos num hotel pequeno). Sem isso uma escrita concorrente sairia com número
   menor que o retrato antigo e seria descartada como "versão antiga".
3. **Banco do analytics num contêiner próprio** (`analytics-postgres`) e não num database a mais no
   Postgres do core — isolamento real de dados e de credencial. A H.3 decide o equivalente no k8s.
4. **`payments.reservation_id` nulo é aceito** (pagamento de conta sem reserva, T-04.4). O catálogo
   tipa o campo como UUID; o core já publica nulo nesses casos. Merece nota no §4.6.
5. **Hotel ausente da projeção → 401** (como o core para tenant inexistente). Consequência: logo após o
   cadastro, até o `tenant.created` ser consumido (~1 s), o analytics responde 401.
6. **Marca de exclusão pegajosa**: nenhum fato posterior a apaga (restauração não está no catálogo —
   pendência 5 da H.1).
7. `qa_checks.sh` estendido ao analytics.

#### Commits gerados

| Hash | Mensagem |
|------|----------|
| `93aa1f3` | `feat(outbox): carga inicial das projeções do analytics no core` |
| `e122749` | `feat(analytics): serviço próprio com projeções idempotentes dos eventos do core` |
| `385673f` | `feat(analytics): consumidor da fila analytics.core-events com retry e DLQ` |
| `24019ca` | `feat(analytics): verificação do JWT RS256 e isolamento por tenant` |
| `4614aa2` | `test(analytics): integração com RabbitMQ real — idempotência, ordem e DLQ` |
| `dbeaacb` | `feat(infra): analytics-service e banco próprio no Docker Compose` |
| `8018845` | `chore(qa): checagens determinísticas cobrem também o analytics-service` |
| (último) | `docs(spec): CA-01.4.g, h, i, j, l, m entregues na H.2 e relatório` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | **[revisão do Weslley]** `docker-compose.yml` (serviços `analytics-postgres` e `analytics-service`) | 🟡 Média | Nenhuma mudança em `infra/k8s/` nem no CI nesta etapa |
| 2 | CI do analytics (**Weslley**, T-01.5) | 🟡 Média | O `ci.yml` só roda o core. O analytics precisa de um job com Postgres; o teste com broker é pulado sem `RABBITMQ_HOST` — com `services: rabbitmq` + `rabbitmq-setup.sh` ele roda (~45 s) |
| 3 | ~~Decisões 1 e 4 acima no texto do catálogo (§6 e §4.6)~~ | — | **Feito em 24/10** (catálogo v1.1, `fe3a669`) |
| 4 | Retenção de `processed_events` | 🟢 Baixa | Cresce para sempre. Apagar após N dias é seguro — a barreira de `aggregate_version` cobre a duplicata antiga. Combinar com a retenção de 7 dias do outbox (pendência 6 da H.1) |
| 5 | "Em limpeza desde" na carga inicial | 🟢 Baixa | Quarto já em `CLEANING` na carga recebe o instante da carga, não o de quando entrou em limpeza (o payload do §4.3 não tem `updated_at`). Afeta só o alerta no dia da virada |
| 6 | Atraso de consumo como métrica (CA-01.4.f) | 🟡 Média | O analytics ainda não expõe `/metrics`. Profundidade das filas já sai do RabbitMQ; o painel é da T-02.4 (Weslley) |
| 7 | ADR-007 (uma reserva por quarto) | 🟡 Média | Não implementada; a projeção segue o catálogo v1.0. Se aceita, vira `reservation.*` v2 (§7) e uma coluna nova na projeção |

#### Correções das ressalvas do qa-redteam (24/10/2026)

Auditoria: `docs/qa/redteam_analytics-service-h2_21out2026.md` (APROVADO COM RESSALVAS, 0 🔴 · 5 🟡 · 6 🟢).
Cada item com teste RED → GREEN, commit e push.

| Achado | Correção | Teste | Commit |
|---|---|---|---|
| 🟡-1 queda do broker derrubava o processo | Handler nunca rejeita: ack/nack com o canal fechado só gera log (a reentrega cai em `duplicate`) | `tests/consumer-resilience.test.js` (canal fechado no ack e no nack; conexão cai com mensagem em andamento → processo segue e reconecta). Conferido de verdade: `rabbitmqctl close_all_connections` → `/health` 503, processo vivo, reconectou, 200 | `b635f80` |
| 🟡-2 carga inicial podia parar as escritas do core | `SET LOCAL lock_timeout` (3 s) antes do `LOCK`, 5 tentativas a cada 2 s, erro claro ao esgotar | `outbox-initial-load.test.js`: transação longa em `payments` → a escrita nova da API passa em < 2 s e a carga desiste com mensagem; sem a correção, a escrita era cancelada por `statement_timeout` (RED). Sem o `LOCK`, o teste de ordem continua falhando | `b2bc987` |
| 🟡-3 banco fora ~40 s mandava a fila à DLQ | Erro de conexão (Sequelize, SQLSTATE `08*`, `57P01-03`, `53300`) não conta tentativa: sem ack/nack, a conexão fecha, o broker devolve sem `x-death`, o consumo volta só depois do `ready()` com espera crescente | `consumer-resilience.test.js` e `rabbitmq.integration.test.js` (2 entregas com o banco "fora" → aplicado, DLQ vazia) | `b635f80` |
| 🟡-4 nome em branco | Core: `CreateGuestController`/`UpdateGuestController` → 400 para nome vazio, só espaços ou outro tipo (`utils/isNonBlankString.js`). Analytics: texto aceita qualquer string | `core/tests/guest-name-validation.test.js` (9 casos) · `analytics/tests/catalog.test.js` | `a585a25` |
| 🟡-5 desvios fora do catálogo | Catálogo v1.1: §6 (`*.deleted` na carga, por causa da D-2; `lock_timeout`), §4.6 (`reservation_id` nulo), §5.3 (banco fora não gasta tentativa), linha no histórico | — | `fe3a669` |
| 🟢-3 `/health` sempre OK | Confere banco e consumidor; degradado → 503 sem expor o erro | `tests/health.test.js` | `1fae3da` |
| 🟢-4 sem desligamento ordenado | SIGTERM/SIGINT: fecha HTTP, cancela o consumo, termina a mensagem em andamento (ack) e fecha broker e banco | `consumer-resilience.test.js` (stop com mensagem em andamento); real: SIGTERM → saída 0 | `b635f80`, `1fae3da` |

**Testes antigos alterados (com justificativa):** `consumer.test.js` e `rabbitmq.integration.test.js`
simulavam o erro transitório com SQLSTATE `08006`, que é erro de **conexão** e agora segue o caminho do
🟡-3. Passaram a usar `40P01` (deadlock), o transitório da mensagem. A asserção do `x-error` mudou junto.
O teste "prefetch 10" passou a chamar `stop()` antes de derrubar a conexão falsa, porque `stop()` agora
espera o laço terminar.

**Saída real depois das correções:**
- analytics — `Test Files 7 passed (7)` · `Tests 84 passed (84)` · Statements **95.53%**, Branches 89.47%, Functions 90.54%, Lines 95.07%
- core — `Test Files 41 passed (41)` · `Tests 851 passed | 1 skipped (852)` · Statements **83.5%**, Branches 79.27%, Functions 88.76%, Lines 85.95%
- `qa_checks.sh` — `⚠ 3 aviso(s). Nenhum erro bloqueante.` (os mesmos da develop)

**Pendências novas (verdes não tratados agora):**

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 8 | Purga da DLQ na eliminação do titular (🟢-2) | 🟡 Média | A T-06.11 deve purgar ou reprocessar `analytics.core-events.dlq`: a DLQ guarda o payload com o nome, sem TTL |
| 9 | OpenAPI do analytics e regras 4 e 7 do `qa_checks.sh` para `$ANALYTICS/routes` (🟢-6) | 🟢 Baixa | Entra com as 7 consultas na H.3 |
| 10 | Probe do k8s: usar `/health` como **readiness**, não liveness | 🟡 Média | Com o broker fora, `/health` dá 503 de propósito; como liveness, o pod reiniciaria em laço (H.3) |
| 11 | Outros caminhos que criam hóspede (reserva pública, representante de contrato) | 🟢 Baixa | Não conferidos quanto a nome em branco nesta correção; o consumidor já aceita o branco |

A pendência 4 (retenção de `processed_events`, 🟢-5) continua aberta.

#### Integração com a develop (28–29/10/2026)

- **Merge** de `origin/develop` (109 commits: T-04.5, T-04.6, T-04.7, T-05.5, T-06.13, repasses de
  schema) — `35cf86f`, **sem conflitos**. Conferidos à mão os dois merges automáticos: o catálogo (a
  develop reescreveu as linhas de `payment.*` da T-06.13; a branch, a de `reservation_id`, o §5.3, o §6
  e o histórico — linhas diferentes) e o `command.js` (o `outbox-initial-load` continua). Os triggers e o
  `outbox_payload` em `applyDbConstraints.js` ficaram intactos; a develop só acrescentou CHECKs de payments.
- **Triggers com os fluxos novos:** `tests/outbox-develop-flows.test.js` — check-in que cria a conta da
  suíte (T-04.6) emite `reservation.status_changed` (CHECKED_IN) e `room.updated` (OCCUPIED), e só tipos
  do catálogo; conta de day-use, item e fechamento não emitem nada; o pagamento da conta sem reserva sai
  como `payment.created` com `reservation_id: null`. O estorno (`payment.status_changed` → VOIDED) já é
  coberto pelo `tests/outbox.test.js` da develop.
- **Catálogo 1.1.1:** texto do `payment.deleted` alinhado ao código — `DELETE /payments/:id` responde 405,
  o estorno é `POST /payments/:id/void` e nenhuma rota emite mais `payment.deleted` (nota na §9.1, ressalva
  no §6). Só documentação.

**Lacunas de evento trazidas pela develop** (nenhum evento novo implementado — fora do catálogo):

| # | Mudança de estado na develop | Situação no catálogo v1.1 | Impacto |
|---|---|---|---|
| L-1 | `GET /analytics/internal-consumption` (T-04.7) agrupa consumo interno lendo `account_items` e `accounts` | `accounts`/`account_items` não geram evento (§4.7: "consumo entra quando um indicador precisar dele" — agora precisa) | **Bloqueia o CA-01.4.k para esse 8º endpoint**: na H.3 ele não sai das projeções. Decisão do Gabriel: evento novo `account_item.*`/`account.*` (versão do catálogo) ou manter o endpoint no core |
| L-2 | Conta da suíte criada no check-in (T-04.6), abertura, itens e fechamento de conta da comanda (T-05.5) | Sem evento (§4.7) | Nenhum dos 7 indicadores atuais usa; só L-1 |
| L-3 | Pagamento de conta sem reserva (T-04.4) e estorno (T-06.13) | Cobertos: `payment.*` com `reservation_id: null` e `payment.status_changed` → VOIDED | Nenhum |

**Saída real depois do merge** (PG 5460, RabbitMQ 5697, próprios):
- analytics — `Test Files 7 passed (7)` · `Tests 84 passed (84)` · Statements **95.53%**, Branches 89.47%, Functions 90.54%, Lines 95.07%
- core — `Test Files 48 passed (48)` · `Tests 1006 passed | 1 skipped (1007)` · Statements **84.46%**, Branches 80.78%, Functions 89.8%, Lines 86.7%
- `qa_checks.sh` — `⚠ 3 aviso(s). Nenhum erro bloqueante.`

#### Correções da reauditoria delta (30/10/2026)

Auditoria: `docs/qa/redteam_analytics-service-h2_delta_24out2026.md` (`8c74407`, APROVADO COM RESSALVAS).

| Achado | Correção | Teste | Commit |
|---|---|---|---|
| 🟡-A pausa por banco fora gastava o `delivery-limit` (20) da fila quorum e o broker descartava a mensagem em silêncio | A pausa só acontece com `x-delivery-count` < `maxInfraRedeliveries` (padrão **10**) e se a mensagem nunca voltou da fila de espera; fora disso, o erro de conexão é tentativa transitória comum (nack, `rejected`, DLQ na 5ª) | **RED** `d54b681`: `rabbitmq.integration.test.js`, apply com erro de conexão perpétuo e `ready()` passando → a mensagem sumiu (log do broker: *"Message dropped … dead letter cycle without reason 'rejected'"*, filas e DLQ vazias). **GREEN** `c87df79`: chega à DLQ com `x-error-kind: transient`, `x-attempts: 5`, depois de 3 pausas (teto do teste) + 5 tentativas, em ~41 s. Unitários do teto em `consumer-resilience.test.js` | `d54b681`, `c87df79` |
| 🟢-C backoff não zerava depois de uma pausa | `backoff = 0` quando o consumo volta | `consumer-resilience.test.js` (duas pausas → `[1000, 1000]`) | `c87df79` |
| 🟢-B `stop()` preso durante `connect()`/`ready()`/backoff | Espera do backoff interrompível; conexão que chega depois do stop é fechada; o laço não segura o stop além de `stopTimeoutMs` | 3 testes em `consumer-resilience.test.js` | `c87df79` |
| §5.3 do catálogo prometia "sem x-death, não conta tentativa" sem limite | Texto com o teto; versão 1.1.2 | — | `20290bf` |
| 🟢-D "readiness, não liveness" só em comentário | Seção no `docs/infra/KUBERNETES.md` e comentário no `HEALTHCHECK` do Dockerfile; comportamento igual. **[revisão do Weslley]** | — | `a4bdd65` |
| Repasses da reauditoria sem versionar | `para_weslley_29102026.md` e `para_indefinido_29102026.md` | — | `47e7fb8` |

`infra/k8s/rabbitmq-setup.sh` não foi tocado: o `delivery-limit` explícito da fila é repasse ao Weslley.

**Saída real** (PG 5460, RabbitMQ 5697, próprios):
- analytics — `Test Files 7 passed (7)` · `Tests 93 passed (93)` · Statements **95.4%**, Branches 89.44%, Functions 90%, Lines 95.23%
- core — `Test Files 48 passed (48)` · `Tests 1006 passed | 1 skipped (1007)` · Statements **84.46%**, Branches 80.73%, Functions 89.8%, Lines 86.7%
- `qa_checks.sh` — `⚠ 3 aviso(s). Nenhum erro bloqueante.`

#### Correção da reauditoria delta 2 (31/10/2026)

Auditoria: `docs/qa/redteam_analytics-service-h2_delta2_30out2026.md` (`9d797dd`, APROVADO COM RESSALVAS, 🟡-A2).

- **RED (`c1c954c`)**: `rabbitmq.integration.test.js` — A falha com erro de conexão devagar (300 ms) e um
  fluxo de mensagens novas (uma a cada 400 ms, por 12 s) falha na hora. Resultado: a DLQ não recebeu A em
  150 s e o broker registrou *"Message dropped … dead letter cycle without reason 'rejected'"*.
- **Primeira correção (só drenar, como o auditor indicou): insuficiente.** Com a drenagem, A passou a
  decidir `nack` (log: "tentativa 1/5"), mas voltava sem `x-death` a cada ~570 ms e chegou de novo a 21
  entregas. O `nack` se perdia porque a **conexão fechava logo depois dele**. Experimento: com 500 ms de
  espera antes do fechamento, 31/31 chegaram à DLQ e A teve 8 entregas.
- **Alternativa descartada:** devolver a mensagem que pausa com `nack` com requeue, sem fechar a conexão. No
  RabbitMQ 4 esse `nack` **não soma no `x-delivery-count`**: o teto nunca disparava (223 entregas em 60 s).
- **GREEN (`e097bfb`)**: a pausa drena e **fecha o canal antes da conexão** (`channel.close()` espera o
  close-ok, e o broker liquida os ack/nack enviados). O `stop()` usa o mesmo fechamento. Resultado: 31/31 na
  DLQ, A com `x-error-kind: transient` e 5 tentativas, cada mensagem com 8 entregas (3 pausas + 5
  tentativas, abaixo do invariante 10 + 5), nenhum "dead letter cycle" no log do broker, em ~53 s. Teste
  unitário novo (RED → GREEN): cancela o consumo, a mensagem lenta dá `nack`, o canal fecha antes da conexão.
- **Catálogo 1.1.3 (`60ea9f8`)**: o §5.3 descreve a pausa que drena, o fechamento ordenado e o invariante.

**Saída real** (PG 5460, RabbitMQ 5697, próprios, recriados antes da rodada):
- analytics — `Test Files 7 passed (7)` · `Tests 95 passed (95)` · Statements **95.79%**, Branches 89.54%, Functions 90.24%, Lines 95.36%
- core — `Test Files 48 passed (48)` · `Tests 1006 passed | 1 skipped (1007)` · Statements **84.46%**, Branches 80.73%, Functions 89.8%, Lines 86.7%
- `qa_checks.sh` — `⚠ 3 aviso(s). Nenhum erro bloqueante.`

**Pendência:** se a drenagem estourar o prazo (`stopTimeoutMs`, 10 s), a mensagem que ainda não decidiu é
devolvida sem `rejected` e soma uma entrega. Com o teto de 10 e o `delivery-limit` 20 há folga; o
`delivery-limit` explícito alto (repasse ao Weslley) aumenta essa margem.

#### Estimativa da H.3 (k, n, o, p, q)

Cerca de **2 a 3 dias de trabalho humano**: as 7 consultas sobre as projeções (NUMERIC até a resposta,
D-1/D-2/D-3) e o porte do `analytics.test.js` para semear pelo core e consultar o analytics (~1,5 dia, a
parte maior — o teste vira de pipeline e precisa de espera pelo consumo); Deployment, Service e
NetworkPolicy do analytics e do seu Postgres no k8s, `location /analytics/` no nginx nas duas cópias
(regra 10 do qa_checks) e remoção do `/analytics` do core (~1 dia); suíte completa e ponta a ponta no
compose/minikube (~0,5 dia).
