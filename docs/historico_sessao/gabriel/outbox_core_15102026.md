### 2026-10-15 — Gabriel (IA orquestrada: Claude Opus 5.5)

- **Branch:** `feature/outbox-core` (a partir de `develop@8840ad5`)
- **Horário:** sessões de 14/10 e 15/10/2026
- **Objetivo da sessão:** Etapa H.1 da rodada 3 (T-01.4) — outbox transacional no core, publicador
  para o RabbitMQ, topologia e credenciais por serviço (CA-01.4.a–e)
- **Delegação:** `docs/delegacoes/rodada3_gabriel_04out2026.md`, etapa H
- **Contrato:** `docs/specs/anexos/SPEC-01-catalogo-eventos.md` v1.0

#### O que foi feito

| Entrega | Onde | Critério |
|---|---|---|
| Tabela `outbox` e trigger `AFTER ... FOR EACH ROW` em `tenants`, `room_categories`, `rooms`, `guests`, `reservations` e `payments`, na mesma transação da escrita de domínio. Decisão do Gabriel: gravação no banco, não nos controllers — cobre também as escritas em lote da P-5 | `app/Models/OutboxModel.js`, `database/applyDbConstraints.js` | CA-01.4.a |
| Payload do §4 numa função SQL única (`outbox_payload`), filtro "nada mudou", `status_changed` com `previous_status` (reserva e pagamento), exclusão lógica → `.deleted`, `DELETE` físico de hóspede → `guest.erased` com payload `{}` | `database/applyDbConstraints.js` | CA-01.4.a, d |
| Publicador: lote com `FOR UPDATE SKIP LOCKED`, publisher confirms com prazo de 10 s, `mandatory` (mensagem devolvida desfaz o lote), `published_at` só depois da confirmação, espera de 1 a 30 s com o broker fora, retenção de 7 dias dos publicados | `app/services/outbox/publisher.js` | CA-01.4.b, c |
| Topologia (exchange topic, fila quorum com retry por TTL e DLQ) e usuários por serviço com menor privilégio (§8), no compose e no k8s | `infra/k8s/rabbitmq-setup.sh`, `rabbitmq.yaml`, `secret.yaml`, `docker-compose.yml` | CA-01.4.e |
| Prometheus raspa `/metrics/per-object` do RabbitMQ (profundidade de cada fila, inclusive DLQ) | compose e `infra/k8s/` | CA-01.4.f (parte da H.1) |
| RabbitMQ no k8s com 512 Mi, probes por TCP e `startupProbe` (corrige o OOMKilled que já existia no minikube) | `infra/k8s/rabbitmq.yaml` | — |
| Auditoria qa-redteam e correções dos 5 médios e de 5 dos 6 baixos | `docs/qa/redteam_outbox-core_14out2026.md` | portão |
| SPEC-01 com CA-01.4.a–e marcados e evidência; catálogo §11 com a P-5 resolvida | `docs/specs/` | — |

#### Verificação

- `npm run test:coverage` em `services/core-service` (15/10, depois de todas as correções):
  **31 arquivos, 519 testes verdes, 1 skip anterior**. Cobertura **80,14% stmts**, 73,39% branches,
  84,84% funcs, 83,24% lines (antes da branch: 80,04%).
- `bash scripts/qa_checks.sh`: **0 erros**, 3 avisos anteriores à branch (Swagger de 3 routers e 2 do
  frontend).
- `kubectl kustomize infra/k8s` OK; `docker compose config -q` OK; `npm ci --dry-run` OK.
- Compose real ponta a ponta (14/10): eventos chegam à fila do analytics sem CPF, telefone nem e-mail;
  broker parado → API responde 201 e os eventos acumulam (CA-01.4.c); religado → drenado; Prometheus
  lê as três filas. Setup no minikube conferido.
- qa-redteam: **APROVADO COM RESSALVAS** (0 🔴, 5 🟡, 6 🟢), correções na seção "Correções" do relatório.

**Correção de registro.** O commit `2abba59` e as notas de 14/10 citam a mutação AFTER→BEFORE como
prova da ordem do §6. Não é: um trigger `BEFORE` que termina em `RETURN NULL` **cancela a escrita**, e
o teste falha porque o nome não muda. A ordem por agregado é garantida por construção — trigger por
linha, `BEFORE` ou `AFTER`, dispara com a linha já travada. A mutação que de fato testaria o §6 seria
`FOR EACH STATEMENT`.

#### Commits gerados

| Hash | Mensagem |
|------|----------|
| `2abba59` | `feat(outbox): tabela outbox e triggers que gravam os eventos do core` |
| `c6a4a6c` | `feat(outbox): publicador com publisher confirms e espera crescente` |
| `82ea7f9` | `feat(infra): topologia do RabbitMQ e usuários por serviço no compose e no k8s` |
| `033aeb5` | `fix(outbox): guest.erased na eliminação física e trigger só com a tabela outbox` |
| `7a63e92` | `fix(outbox): mensagem devolvida desfaz o lote e publicados saem após 7 dias` |
| `afbb4d8` | `fix(core): tira o handler de SIGTERM que cortava a drenagem do pod` |
| `13b9a40` | `fix(infra): RabbitMQ no k8s com 512 Mi e probes por TCP` |
| `ec337e9` | `fix(infra): backend sem acesso à porta de gestão 15672 do RabbitMQ` |
| `58b5752` | `chore(deps): restaura a entrada vitest/node_modules/yaml no package-lock` |
| `2631614` | `docs(infra): senhas do RabbitMQ por serviço no README, KUBERNETES e .env.example` |
| `0611b7b` | `docs(spec): CA-01.4.a–e entregues na H.1 e P-5 resolvida no catálogo` |
| `6034b18` | `docs(qa): auditoria qa-redteam do outbox-core e as correções aplicadas` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Painel do Grafana para as filas do RabbitMQ (T-02.4, **Weslley**) | 🟡 Média | Fecha o CA-01.4.f. O Prometheus já raspa o job `rabbitmq` em `/metrics/per-object`: `rabbitmq_queue_messages_ready{queue=...}` por fila, incluindo `analytics.core-events.dlq`. O atraso de consumo só existe depois do consumidor (H.2) |
| 2 | Teste contra RabbitMQ real no CI (**Weslley**) | 🟡 Média | Os testes usam canal falso: trocar `createConfirmChannel` por `createChannel` ou dar `--configure '.*'` ao core passa no CI. Sugestão do qa: `services: rabbitmq` no job e um teste que publica com a credencial do core, consome com a do analytics e confere `ACCESS_REFUSED` do core em `assertQueue` e `consume` |
| 3 | Tabela `outbox` no `db/schema.sql` e no `docs/db/ARQ_DATABASE.md` (**Sirlande**) | 🟢 Baixa | O `schema.sql` diz que deve ficar em sincronia com os models. Modelo em `app/Models/OutboxModel.js`; índice parcial `outbox_pendentes` (`id` onde `published_at IS NULL`) |
| 4 | A T-06.11 deve apagar as linhas `guest.*` do outbox do titular eliminado | 🟡 Média | Acrescentar como critério de aceite da T-06.11. O `destroy({ force: true })` já gera `guest.erased` com payload vazio, mas as linhas antigas (`guest.created`/`updated`) guardam o nome até a retenção apagá-las |
| 5 | Eventos fora do catálogo: `tenant.deleted` e `*.updated` depois de uma restauração (`deleted_at` → `NULL`) | 🟢 Baixa | Nenhum caminho de código produz hoje (não há DELETE de tenant nem `.restore()`). Se algum surgir, decidir no catálogo antes: `RETURN NULL` ou fato novo |
| 6 | Prazo de retenção de 7 dias precisa ser confirmado pelo **Gabriel** | 🟡 Média | `retentionDays` em `createOutboxPublisher`. Precisa cobrir a carga inicial e o reprocessamento da H.2; curto demais impede reenviar a partir do outbox |
| 7 | Senhas do `rabbitmq-setup.sh` na linha de comando (visíveis em `ps` no contêiner) | 🟢 Baixa | `rabbitmqadmin` 2.35 aceita `--password-hash` |
| 8 | Estimativa da H.2 e da H.3 para o Gabriel; **ADR-007 decidida antes da H.2** | 🔴 Alta | `docs/sugestoes-documentos-oficiais/07-adr/ADR-007-candidata.md` muda o modelo de reserva que as projeções vão espelhar |
