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
| 3 | Decisões 1 e 4 acima no texto do catálogo (§6 e §4.6) | 🟢 Baixa | Ajuste de redação, sem mudança de contrato |
| 4 | Retenção de `processed_events` | 🟢 Baixa | Cresce para sempre. Apagar após N dias é seguro — a barreira de `aggregate_version` cobre a duplicata antiga. Combinar com a retenção de 7 dias do outbox (pendência 6 da H.1) |
| 5 | "Em limpeza desde" na carga inicial | 🟢 Baixa | Quarto já em `CLEANING` na carga recebe o instante da carga, não o de quando entrou em limpeza (o payload do §4.3 não tem `updated_at`). Afeta só o alerta no dia da virada |
| 6 | Atraso de consumo como métrica (CA-01.4.f) | 🟡 Média | O analytics ainda não expõe `/metrics`. Profundidade das filas já sai do RabbitMQ; o painel é da T-02.4 (Weslley) |
| 7 | ADR-007 (uma reserva por quarto) | 🟡 Média | Não implementada; a projeção segue o catálogo v1.0. Se aceita, vira `reservation.*` v2 (§7) e uma coluna nova na projeção |

#### Estimativa da H.3 (k, n, o, p, q)

Cerca de **2 a 3 dias de trabalho humano**: as 7 consultas sobre as projeções (NUMERIC até a resposta,
D-1/D-2/D-3) e o porte do `analytics.test.js` para semear pelo core e consultar o analytics (~1,5 dia, a
parte maior — o teste vira de pipeline e precisa de espera pelo consumo); Deployment, Service e
NetworkPolicy do analytics e do seu Postgres no k8s, `location /analytics/` no nginx nas duas cópias
(regra 10 do qa_checks) e remoção do `/analytics` do core (~1 dia); suíte completa e ponta a ponta no
compose/minikube (~0,5 dia).
