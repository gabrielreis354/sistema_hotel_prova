# QA Red Team — outbox transacional do core + publicador RabbitMQ (Etapa H.1, T-01.4)
**Branch:** feature/outbox-core @ `82ea7f9` (3 commits) · **Base:** develop@`8840ad5` · **Data:** 14/10/2026
**Delegação:** `docs/delegacoes/rodada3_gabriel_04out2026.md`, Etapa H.1 (CA-01.4.a–e; f parcial, painel fica com o Weslley)
**Contrato:** `docs/specs/anexos/SPEC-01-catalogo-eventos.md` v1.0 (§2, §3, §4, §5.4, §6, §8)
**Arquivos auditados:** 22 do diff, mais 9 lidos para contexto (`command.js`, `tests/setup/globalSetup.js`, `vitest.config.js`, `Dockerfile`, `UpdateReservationController.js`, `db/schema.sql`, `scripts/qa_checks.sh`, `.github/workflows/ci.yml`, `node_modules/amqplib/lib/channel_model.js`)
**Achados:** 11 (🔴 0 · 🟡 5 · 🟢 6)

## Veredito
**APROVADO COM RESSALVAS**

O núcleo está correto. O trigger AFTER cobre todos os caminhos de escrita das 6 tabelas, inclusive a
escrita em lote. O payload segue o §4 sem CPF, telefone nem e-mail, o filtro "nada mudou" funciona, o
`previous_status` sai só em reserva e pagamento, e a exclusão lógica vira `.deleted`. No publicador,
`SKIP LOCKED`, o `published_at` gravado só depois da confirmação, a espera de 1 a 30 s e o prazo de
confirmação estão certos e cobertos por teste. As permissões do §8 batem com o catálogo, a UI 15672 só
escuta em 127.0.0.1 e a NetworkPolicy libera a 15692 apenas para o Prometheus.

Não achei vazamento cross-tenant nem perda financeira. Os 🟡 são de três tipos:
- dois modos de falha silenciosa: evento confirmado pelo broker e descartado; escrita derrubada por
  trigger sem tabela;
- uma regressão de disponibilidade no desligamento do pod;
- uma lacuna de teste justamente no `tenant_id` do evento, mais uma cópia nova do nome do hóspede, que
  agrava a T-06.11.

## Achados

### 🟡 [Entrega / CA-01.4.b] Mensagem sem rota é confirmada pelo broker e descartada, mas o outbox a marca como publicada
**Onde:** `services/core-service/app/services/outbox/publisher.js:80-90` (publish sem `mandatory`, sem tratar `return`). A topologia não tem `alternate-exchange` (`infra/k8s/rabbitmq-setup.sh:37,47`).

**Cenário:** o RabbitMQ manda *ack* de publisher confirm também para mensagem que não chegou a fila
nenhuma. A documentação de confirms diz: "for unroutable messages, the broker will issue a confirm once
the exchange verifies a message won't route to any queue". Sem `mandatory`, o amqplib não é avisado.
Daí `confirmWithin` resolve, o `UPDATE outbox SET published_at` faz commit e o evento some para sempre.
Nenhum log registra a perda e nenhuma métrica a mostra. Três situações levam a isso:
1. No primeiro provisionamento, `rabbitmq-setup.sh` declara a exchange (linha 37) e só seis chamadas
   HTTP depois a ligação `#` (linha 47). O backend do compose depende apenas de `service_started` do
   broker, e o publicador fica tentando. Se uma rodada cair nessa janela, o acumulado (lotes de 100,
   sem pausa) sai para uma exchange sem fila.
2. O operador apaga ou recria `analytics.core-events` pela UI para "limpar" a fila.
3. Uma mudança de topologia na H.2 ou H.3, como renomear a fila ou trocar a ligação.

Nos três casos a projeção do analytics diverge sem erro nenhum. É o risco que a SPEC-01 classifica como
"Alto — indicador errado" e que o desenho com triggers quis eliminar. A garantia de "pelo menos uma vez"
afirmada no cabeçalho do publicador (`publisher.js:9-11`) deixa de valer.
**Regra violada:** CA-01.4.b (entrega pelo menos uma vez), catálogo §5.4.
**Correção sugerida (a menor):** declarar `gesway.core.events` com
`--arguments '{"alternate-exchange":"gesway.core.unrouted"}'` e criar uma exchange fanout
`gesway.core.unrouted` com a fila `core-events.unrouted`, sem leitor e raspada pelo Prometheus. Para
a exchange que já existe, isso exige `delete` + `declare` uma vez, ou uma *policy* `alternate-exchange`
via `rabbitmqadmin declare policy`, que não exige recriar. Alternativa no código: `mandatory: true` com
`channel.on('return')` fazendo a rodada falhar.

### 🟡 [Robustez / migração] Trigger criado sem a tabela `outbox` derruba toda escrita nas 6 tabelas
**Onde:** `services/core-service/database/applyDbConstraints.js:185` (chamada) e `:454-552` (`applyOutbox`, sem checar se `outbox` existe). Causa: `command.js:27-46`.

**Cenário (reproduzido no banco de teste, numa transação desfeita):** `command.js migrate` engole de
propósito a falha do `sync({ alter })` e roda `applyDbConstraints` mesmo assim. O comentário em
`command.js:21-25` registra que isso acontece em banco legado "por um motivo TOTALMENTE ALHEIO". Se o
sync morrer antes de criar `outbox`, o `CREATE FUNCTION` passa, porque o PL/pgSQL não valida tabela na
criação, e os 6 `CREATE TRIGGER` também passam. A partir daí qualquer INSERT, UPDATE ou DELETE em
`tenants`, `rooms`, `guests`, `reservations`, `payments` e `room_categories` falha com:
```
ERROR:  relation "outbox" does not exist
CONTEXT:  PL/pgSQL function outbox_grava_evento() line 75 at SQL statement
```
O hotel não consegue cadastrar hóspede, fazer check-in nem lançar pagamento. Antes desta branch, o
mesmo sync quebrado deixava a API funcionando. O mesmo arquivo já usa a guarda certa para `products`
(`:58`, `IF EXISTS (SELECT 1 FROM information_schema.tables ...)`).

A chamada também foi inserida entre o comentário de `falhas` e o da ocupação (`:178-185`). Uma exceção
em `applyOutbox` pula `applyRoomOccupancy` e o relatório de `falhas`, contrariando o "Fail Safe na
execução" documentado no próprio arquivo (`:105-110`).
**Regra violada:** Fail Safe. A API não pode depender de um objeto que a migração não garantiu.
**Correção sugerida:** criar a tabela dentro de `applyOutbox` com `CREATE TABLE IF NOT EXISTS outbox (...)`
e o índice parcial, ou pular os triggers quando a tabela não existir. Envolver a chamada no mesmo
`try/catch` da ocupação.

### 🟡 [Disponibilidade] O handler de SIGTERM derruba o processo na hora e acaba com a drenagem que o pod tinha
**Onde:** `services/core-service/_web.js:52-57`

**Cenário:** o container roda `node _web.js` como PID 1 (`Dockerfile`, `CMD`). Sem handler, o PID 1 de
um namespace ignora SIGTERM. Antes desta branch, o pod continuava atendendo durante o
`terminationGracePeriodSeconds: 60` (`infra/k8s/backend.yaml:125`) até o SIGKILL, enquanto o
kube-proxy tirava o pod dos endpoints. Agora o `process.exit(0)` sai no instante do SIGTERM, sem
`server.close()`. A cada rolling update ou escala para baixo, o que já estava em andamento é cortado e o
que o nginx ainda manda para o pod antes da atualização dos endpoints recebe conexão recusada (502):
um `POST /payments`, um check-in, o webhook PIX. A transação desfaz, então não sobra dado
inconsistente, mas o recepcionista vê erro e pode repetir a operação.

O handler é registrado também quando `outboxPublisher` é `null` (dev, testes, sem broker). Ou seja, a
mudança de comportamento vale mesmo com o publicador desligado.
**Regra violada:** efeito colateral fora do escopo da feature (CLAUDE.md §4, "o que NÃO deve mudar").
**Correção sugerida:** guardar o `server` de `web.listen` e, no sinal, chamar `outboxPublisher?.stop()`
e `server.close(() => process.exit(0))`, com um `setTimeout(..., 50_000).unref()` de segurança. Ou só
registrar o handler quando houver publicador e não chamar `process.exit`.

### 🟡 [Teste / multi-tenancy, CA-01.4.d] Nenhum teste confere que o `tenant_id` do evento é o do registro
**Onde:** `services/core-service/tests/outbox.test.js:49` (só confere o formato UUID) e `:63` (só o `tenant.created`). Regra testada: `applyDbConstraints.js:532`.

**Cenário (mutação):** trocar a linha 532 por `tenant := (atual->>'id')::uuid;`. Com isso, todo evento de
quarto, hóspede, reserva e pagamento sai com `tenant_id` igual ao id do próprio registro. Os dois testes
continuam verdes: o envelope só exige "parece UUID", e o único `toBe(tenantId)` é o do evento de
tenant, que a mutação não afeta. O mesmo vale para uma troca entre `tenant_id` de linhas. O CA-01.4.d diz
"todos os eventos da §5 publicados, **com `tenant_id`**", e o consumidor da H.2 vai particionar a
projeção por esse campo. Se ele vier errado, o indicador do hotel A soma no hotel B, e nenhum teste
avisa.

Agrava: o teste "Envelope (§2)" roda antes de todos os outros (`:42-56`) e só enxerga os dois eventos
criados no `beforeAll`. A uniformidade do envelope não é verificada para nenhum outro agregado.
**Regra violada:** CA-01.4.d; checklist §8 ("falta teste de isolamento entre tenants no recurso novo").
**Correção sugerida:** no fim da suíte, `SELECT DISTINCT tenant_id FROM outbox` = `[tenantId]`.
Melhor ainda, registrar um segundo hotel, escrever nos dois e conferir que cada evento leva o
`tenant_id` da linha (`outbox.tenant_id = <tabela>.tenant_id` por `aggregate_id`). Mover o teste de
envelope para o fim.

### 🟡 [LGPD / agrava T-06.11] O outbox guarda o nome do hóspede para sempre, e a eliminação definitiva vai publicá-lo
**Onde:** `services/core-service/app/Models/OutboxModel.js:16-31` (nenhuma rotina apaga linha publicada) · `applyDbConstraints.js:465-466,499` (`DELETE` monta o payload a partir de `OLD`)

**Cenário (reproduzido no banco de teste, numa transação desfeita):**
```
guest.created  {"full_name": "Fulana Titular"}
guest.deleted  {"full_name": "Fulana Titular"}   ← soft delete
guest.updated  {"full_name": "Fulana Titular"}   ← restore (deleted_at → NULL)
guest.deleted  {"full_name": "Fulana Titular"}   ← DELETE físico
```
1. **Retenção:** cada mudança de nome grava mais uma cópia de `full_name` no banco do core, e nada
   apaga linha com `published_at` preenchido. A tabela cresce sem limite e acumula o histórico de nomes
   de todo hóspede, fora do alcance de qualquer endpoint.
2. **Eliminação:** o CA-06.11.a prevê `destroy({ force: true })`, que dispara o ramo `DELETE` do
   trigger. Ele grava e publica `guest.deleted` com o nome do titular que acabou de pedir a eliminação,
   o contrário do `guest.erased` de payload vazio do §4.4. Mesmo que a T-06.11 escolha anonimizar
   (UPDATE), as linhas antigas do outbox continuam com o nome verdadeiro.

O `guest.erased` em si é pendência conhecida e não é este achado. O achado é a cópia nova, criada por
esta branch, e o fato de o trigger já produzir o evento errado para o caminho que a T-06.11 vai usar.
**Regra violada:** LGPD art. 6º, III (necessidade), art. 15/16 (eliminação ao fim do tratamento) e
art. 18, VI.
**Correção sugerida:** (a) expurgo das linhas publicadas há mais de N dias, que pode rodar no próprio
laço do publicador uma vez por hora:
`DELETE FROM outbox WHERE published_at < now() - interval '7 days'`; e (b) registrar na T-06.11, como
critério de aceite, que a eliminação apaga ou anonimiza as linhas `guest.*` do outbox daquele
`aggregate_id` e não gera `guest.deleted` com nome. O trigger pode ignorar o `DELETE` físico de
`guests` e deixar a T-06.11 gravar o `guest.erased`.

### 🟢 [Contrato §4] Eventos fora do catálogo: `tenant.deleted`, e `*.updated` depois de `*.deleted`
**Onde:** `applyDbConstraints.js:497-530`
**Cenário:** (a) `tenants` não é paranoid. Um `DELETE` físico gera `tenant.deleted`, tipo que o §4.1 não
define e que o §5.3 manda para a DLQ como "type desconhecido". Hoje nenhum caminho apaga tenant. (b) Um
*restore* (`deleted_at` → `NULL`) e qualquer UPDATE numa linha já excluída geram `*.updated` (ver tabela
acima). O §5.2 diz que `*.deleted` vira marca e que um `*.updated` atrasado não ressuscita o registro,
mas este não está atrasado: tem versão maior, e o payload não diz se o registro está vivo. Hoje não há
`.restore()` no código (`grep` vazio).
**Correção sugerida:** emitir só os fatos do catálogo, com `RETURN NULL` para `tenant` em `DELETE` e
para UPDATE com `velho->>'deleted_at' IS NOT NULL`. Registrar o *restore* como decisão do catálogo, se
algum dia for usado.

### 🟢 [DRY] A lista de campos do payload está escrita duas vezes no trigger
**Onde:** `applyDbConstraints.js:476-491` (`dados`) e `:505-517` (`antes`)
**Cenário:** quem acrescentar um campo ao §4 num bloco e esquecer o outro faz `dados = antes` ficar
sempre falso. A partir daí todo UPDATE da tabela gera evento, e o filtro "nada mudou" do CA-01.4.a
desliga sem teste vermelho para aquele campo.
**Correção sugerida:** uma função `outbox_payload(agregado text, linha jsonb) RETURNS jsonb` chamada
duas vezes.

### 🟢 [Teste] A mutação AFTER→BEFORE é pega por outro motivo, não pela ordem do §6
**Onde:** `tests/outbox.test.js:240-256`; mensagem do commit `2abba59`
**Cenário:** um BEFORE ROW que termina em `RETURN NULL` (como este) **cancela** a escrita. O teste falha
porque o nome não muda, não porque a sequência saiu fora de ordem. Um trigger por linha, BEFORE ou
AFTER, sempre dispara depois de o PostgreSQL travar a linha (`GetTupleForTrigger`). A ordem por agregado
fica garantida por construção, e o teste não distingue as duas versões. Não é defeito do código; é uma
afirmação de prova que não procede. Quem ler o relatório da H.1 pode concluir que existe uma rede
protegendo o §6 contra algo que ela não detecta (ex.: um trigger `FOR EACH STATEMENT` BEFORE).
**Correção sugerida:** ajustar o texto da prova. Se quiser de fato provar o §6, a mutação a testar é
`FOR EACH STATEMENT`.

### 🟢 [Teste] Nada exercita o broker real nem as permissões do §8
**Onde:** `publisher.js:146-162` (`rabbitConnectFromEnv`), `infra/k8s/rabbitmq-setup.sh:52-58`
**Cenário:** trocar `createConfirmChannel` por `createChannel` faz `waitForConfirms` não existir. Cada
rodada falha com TypeError, nada é publicado, e só o log avisa. Dar `--configure '.*'` ao core
contraria o §8 e o CA-01.4.e. As duas regressões passam no CI, porque os testes usam canal falso e a
"prova no compose" foi manual. Não há RabbitMQ no CI (`ci.yml`).
**Correção sugerida:** um `services: rabbitmq` no job de teste e um teste de integração que publica um
evento real com a credencial do core, consome com a do analytics e confirma `ACCESS_REFUSED` em
`assertQueue` (configure) e em `consume` (read) pelo core.

### 🟢 [Menor privilégio / infra] O backend ainda alcança a porta de gestão 15672 do RabbitMQ
**Onde:** `infra/k8s/networkpolicy.yaml:77-85`
**Cenário:** a topologia agora é declarada pelo contêiner `setup` dentro do pod do RabbitMQ, via
`localhost`. O backend só precisa da 5672, e a credencial do core não tem tag, então a API HTTP o
recusa. Mesmo assim, um pod de backend comprometido continua com a superfície de ataque da UI de gestão
ao alcance (ataque de senha contra o admin). A regra é anterior à branch, mas o motivo dela deixou de
existir com este diff.
**Correção sugerida:** tirar `port: 15672` da regra do backend.

### 🟢 [Documentação / higiene] Lacunas fora do código
- `.env.example:44-49` e `services/core-service/.env.example:62-69`: o bloco do RabbitMQ foi inserido
  **entre** o comentário do usuário MinIO de leitura e as variáveis dele. O comentário "Usuário MinIO só
  de leitura..." ficou em cima das variáveis do RabbitMQ.
- `README.md:297` lista as senhas obrigatórias do `.env`, e `README.md:413,466` e
  `docs/infra/KUBERNETES.md:13,31` listam as chaves do `hotel-secret`. Nenhum cita
  `RABBITMQ_CORE_PASSWORD` nem `RABBITMQ_ANALYTICS_PASSWORD`. Com um `.env` antigo, quem roda
  `docker compose up` recebe "defina RABBITMQ_CORE_PASSWORD" sem que o README tenha avisado. É o
  compose de contingência da defesa.
- `db/schema.sql` ("ambos devem sempre estar em sincronia", linha 8) e `docs/db/ARQ_DATABASE.md` não
  têm a tabela `outbox`.
- O diff não tem relatório de sessão nem o registro da pendência do painel do Grafana para o Weslley
  (CA-01.4.f), que a delegação pede ("registre o painel como pendência dele").
- `package-lock.json`: a remoção de `node_modules/vitest/node_modules/yaml` não tem relação com a
  feature. Parece ser diferença de versão do npm. Vale confirmar que `npm ci` no CI segue verde.
- `rabbitmq-setup.sh:21-22,52,56`: as senhas do admin e dos usuários vão na linha de comando
  (`-p`, `--password`) e ficam visíveis em `ps` dentro do contêiner enquanto ele roda. O
  `rabbitmqadmin` 2.35 aceita `--password-hash`.

## O que foi verificado e está correto
- **Atomicidade (CA-01.4.a):** o trigger é `AFTER ... FOR EACH ROW`, dentro da transação de domínio.
  Rollback leva o evento junto (teste `:218`), e o 409 de ocupação não deixa evento (`:227`). A
  escrita em lote (P-5) gera um evento por linha (`:101`).
- **Payload do §4:** conferi campo a campo contra o catálogo. O hóspede leva só `full_name`. Pagamento
  sai sem `provider`, `provider_charge_id` nem `pix_qr_code`. Reserva sai sem `source`, `user_id` e
  quartos extras. Dinheiro vai como texto com 2 casas (`to_jsonb(numeric)` preserva a escala), datas
  como `YYYY-MM-DD` e instantes em ISO UTC (`outbox_iso`). Nenhum `Number()` sobre DECIMAL;
  `Number(row.id)` é sobre o BIGSERIAL.
- **Filtro "nada mudou", `status_changed` com `previous_status` (só reserva e pagamento), `room.updated`
  para mudança de status do quarto, exclusão lógica vira `.deleted`:** conferido no SQL e nos testes.
- **`tenant_id` do evento:** vem da linha (`atual->>'tenant_id'`), e `tenants` usa o próprio `id`.
  Nenhum dado do request entra no evento. `UpdateReservationController.js:41-42` já valida `guest_id`
  por tenant (o 🔴 da auditoria de 10/10 está corrigido), então o payload de reserva não referencia
  hóspede de outro hotel.
- **Publicador (CA-01.4.b/c):** `FOR UPDATE SKIP LOCKED` em lote ordenado por `id`, `published_at` só
  depois de `waitForConfirms` e dentro da mesma transação. Sem confirmação, rollback. O prazo de 10 s
  cobre o broker bloqueado. A espera vai de 1 a 30 s e volta ao intervalo normal. O log sai uma vez por
  mudança de erro. Conferi no amqplib 2.2.0 que `waitForConfirms` rejeita com o canal fechado e que
  `publish` em canal fechado lança dentro do `try`.
- **API independente do broker:** sem `RABBITMQ_HOST`, o publicador fica desligado. No compose, o
  backend depende só de `service_started` do broker e não espera o `rabbitmq-setup`. No k8s, o setup
  roda no pod do RabbitMQ.
- **§8:** `hotel_core_publisher` tem `^$` / `^gesway\.core\.events$` / `^$`, e
  `hotel_analytics_consumer` tem `^$` / `^analytics\.dlx$` / `^analytics\.core-events(\.dlq)?$`. Os dois
  sem tags, e o admin não é injetado no backend. Conferi a sintaxe de `declare permissions/queue/user/binding`
  contra o `rabbitmqadmin` 2.35.0 da imagem `rabbitmq:4-management-alpine`.
- **§3:** exchange topic durável, fila quorum com DLX para `analytics.retry`, retry classic com
  `x-message-ttl=10000` → `analytics.requeue` → só a fila do analytics, DLQ quorum sem TTL.
- **CA-01.4.f (parte da H.1):** a imagem já traz `[rabbitmq_management,rabbitmq_prometheus]`
  habilitados (conferido). O job `rabbitmq` em `/metrics/per-object` está no compose e no k8s, e a
  porta 15692 está liberada na NetworkPolicy só para `app: prometheus` e não é publicada no host.
- **Portas:** `127.0.0.1:15672` no compose; 5672 e 15692 não publicadas.
- **ESM:** nenhum `require()` no diff, e `amqplib` é carregado por `import()` dinâmico.
- **Testes sequenciais:** `vitest.config.js` usa `fileParallelism: false` e `singleFork`, então o
  `UPDATE outbox SET published_at` do `beforeEach` do publicador não interfere em outros arquivos.
- `bash scripts/qa_checks.sh`: 0 erros, com 3 avisos anteriores à branch (Swagger de 3 routers e 2 do
  frontend).

## Não foi possível verificar
- **Suíte completa e cobertura:** não rodei, por ordem do orquestrador (uma execução por vez). Os
  testes foram auditados por leitura.
- **Publicação contra broker real:** não subi o compose nem o minikube, que estava em uso. A afirmação
  do commit `82ea7f9` ("provado no compose real") não foi reproduzida. Para inspecionar `rabbitmqadmin`
  e plugins, rodei só `docker run --rm` da imagem.
- **Duplicação de UNIQUE pelo `sync({ alter })`:** `event_id` usa `unique: true` de coluna, mesmo
  padrão de `tenants.subdomain`. Não havia banco de desenvolvimento migrado várias vezes para confirmar
  se o Sequelize 6 recria `outbox_event_id_key1`, `key2`... Se acontecer, o padrão é anterior à branch.
- **Ordem do `sync` (se `outbox` é criada antes ou depois de um model que falhe):** determina se o
  cenário do segundo 🟡 acontece num banco legado específico. O defeito (ausência de guarda) independe
  disso.

## Estado do ambiente ao encerrar
- Experimentos SQL feitos em `gestao_hotel_test` (contêiner `pg-teste-gesway`), sempre dentro de
  `BEGIN ... ROLLBACK`, com `pgrep` antes confirmando que nenhum vitest rodava. Nada persistido.
- Nenhum contêiner deixado rodando; o minikube já estava ativo antes da auditoria e não foi tocado.
- Nenhum arquivo de código alterado, nenhum commit.

## Correções (14–15/10/2026)

Aplicadas na própria `feature/outbox-core`, antes do merge. As mutações citadas foram provadas na
sessão de 14/10 (o teste novo fica vermelho com a mutação e verde sem ela). Suíte completa depois das
correções, em 15/10: **31 arquivos, 519 testes verdes (1 skip anterior), cobertura 80,14% stmts /
73,39% branches / 84,84% funcs / 83,24% lines**; `bash scripts/qa_checks.sh`: 0 erros, os mesmos 3
avisos anteriores à branch.

| Achado | Tratamento | Onde | Prova |
|---|---|---|---|
| 🟡 Mensagem sem rota confirmada e descartada | Publicação com `mandatory: true`; `basic.return` (que o broker manda antes da confirmação) desfaz o lote inteiro e a rodada falha com "sem fila de destino" | `publisher.js` | `outbox-publisher.test.js`, "evento sem fila de destino (devolvido pelo broker) desfaz o lote"; mutação: tirar `mandatory` |
| 🟡 Trigger sem a tabela `outbox` derruba a escrita | `applyOutbox` confere `to_regclass('public.outbox')` e recusa com mensagem clara; a chamada entrou no mesmo esquema de falha guardada da ocupação, então o resto das constraints é aplicado e as duas falhas saem juntas | `applyDbConstraints.js` | lido no diff; o banco de teste sempre tem a tabela |
| 🟡 Handler de SIGTERM corta a drenagem do pod | Handler removido. O processo volta a atender até o fim do `terminationGracePeriodSeconds`; lote interrompido volta na próxima rodada de outra réplica (a transação cai com a conexão) | `_web.js` | comportamento anterior à branch restaurado |
| 🟡 Nenhum teste do `tenant_id` do evento | Teste com dois hotéis: cada evento leva o `tenant_id` da linha, o `tenant.created` leva o próprio hotel e nenhum `guest.*` diverge da tabela `guests` | `outbox.test.js`, "Isolamento multi-tenant do evento" | mutação `tenant := (atual->>'id')::uuid` fica vermelha |
| 🟡 Nome do hóspede guardado para sempre / eliminação publicaria o nome | (a) o publicador apaga, uma vez por hora, as linhas publicadas há mais de 7 dias (pendente nunca sai); (b) `DELETE` físico de `guests` gera `guest.erased` com payload `{}` (§4.4) | `publisher.js` (`purgePublished`), `applyDbConstraints.js` | `outbox-publisher.test.js`, "Retenção do outbox (LGPD)"; `outbox.test.js`, "eliminação física (T-06.11) gera guest.erased com payload VAZIO" |
| 🟢 DRY do payload | Função SQL única `outbox_payload(agregado, linha)`, chamada para o estado atual e o anterior | `applyDbConstraints.js` | suíte do outbox verde, inclusive os filtros "nada mudou" |
| 🟢 Backend alcança a 15672 | Porta tirada da regra do backend na `rabbitmq-ingress`; o `setup` usa `localhost` dentro do pod | `infra/k8s/networkpolicy.yaml` | `kubectl kustomize infra/k8s` OK |
| 🟢 Bloco do RabbitMQ dentro do bloco do MinIO | Movido para o bloco próprio nos dois `.env.example`; comentário "nenhum código publica ainda" atualizado | `.env.example`, `services/core-service/.env.example` | `docker compose config -q` OK |
| 🟢 `package-lock.json` sem `vitest/node_modules/yaml` | Entrada restaurada; o diff do lock contra `develop` agora é só o `amqplib` | `services/core-service/package-lock.json` | `npm ci --dry-run` OK |
| 🟢 README e KUBERNETES.md sem as senhas novas | `RABBITMQ_CORE_PASSWORD` e `RABBITMQ_ANALYTICS_PASSWORD` citadas como obrigatórias no compose e listadas no `hotel-secret` | `README.md`, `docs/infra/KUBERNETES.md` | — |
| 🟢 OOMKilled do RabbitMQ no minikube (achado durante a prova, anterior à branch) | Limite de 512 Mi, probes `tcpSocket` na 5672 e `startupProbe` de até 5 min, no lugar do `rabbitmq-diagnostics` que subia uma VM Erlang a cada checagem | `infra/k8s/rabbitmq.yaml` | setup no minikube de 14/10 |
| 🟢 Mutação AFTER→BEFORE | **Correção de registro:** ela falha porque um `BEFORE ... RETURN NULL` cancela a escrita, não por causa da ordem do §6. A ordem por agregado é garantida por construção (trigger por linha dispara com a linha travada). Corrigido no relatório de sessão e no PR | — | — |

**Não tratados nesta branch (viram pendência no relatório de sessão):**
- eventos fora do catálogo (`tenant.deleted`, `*.updated` depois de restauração): nenhum caminho de
  código os produz hoje;
- teste contra RabbitMQ real no CI (Weslley);
- `outbox` no `db/schema.sql` e no `ARQ_DATABASE.md` (Sirlande);
- T-06.11 deve apagar as linhas `guest.*` do outbox do titular eliminado;
- senhas do `rabbitmq-setup.sh` na linha de comando (`--password-hash`);
- prazo de retenção de 7 dias a confirmar pelo Gabriel.
