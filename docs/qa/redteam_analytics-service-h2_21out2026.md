# QA Red Team — analytics-service: consumidor, projeções e carga inicial (Etapa H.2, T-01.4)
**Branch:** feature/analytics-service @ `30b25cd` (8 commits, `93aa1f3`..`30b25cd`) · **Dev:** Gabriel (agente executor) · **Base:** develop@`c6742b2` · **Data:** 21–23/10/2026
**Contrato:** SPEC-01 T-01.4 (CA-01.4.g, h, i, j, l, m) · `docs/specs/anexos/SPEC-01-catalogo-eventos.md` v1.0 (§2, §4, §5, §6, §8) · ADR-006
**Arquivos auditados:** 45 do diff (todo o `services/analytics-service/`, `core-service/command.js`, `database/outboxInitialLoad.js`, o teste da carga, `docker-compose.yml`, `.env.example`, `scripts/qa_checks.sh`, SPEC-01, relatório). Lidos para contexto: `core-service/database/applyDbConstraints.js` (trigger do outbox), `app/services/outbox/publisher.js`, `middlewares/auth.middleware.js` do core, `GuestApi/*`, `PaymentApi/CreatePaymentController.js`, `PublicBookingApi/CreateBookingController.js`, Models do core, `infra/k8s/rabbitmq-setup.sh`, `.github/workflows/ci.yml`, `node_modules/amqplib/lib/channel.js` e `channel_model.js`
**Achados no escopo:** 11 (🔴 0 · 🟡 5 · 🟢 6) · **Repassados:** 3

## Veredito
**APROVADO COM RESSALVAS**

Não achei vazamento entre hotéis, perda financeira nem quebra de contrato dentro do escopo. O que foi pedido
está certo:
- as duas barreiras de idempotência (`processed_events` e `aggregate_version`) ficam na mesma transação da
  projeção, e o *ack* só sai depois do commit;
- `*.deleted` vira marca que não volta atrás;
- o evento com o id de outro hotel vira erro permanente;
- JWT RS256 só com a chave pública e com `algorithms` fixo;
- `proj_guests` guarda só id, `tenant_id` e nome;
- dinheiro fica em `NUMERIC`, sem `float`;
- a imagem roda sem root e sai sem chave, `.env` nem testes.

A suíte do core não mudou de comportamento.

Os 🟡 são de disponibilidade e operação. Nenhum deles quebra um indicador agora:
- o processo do analytics **morre** quando a conexão com o broker cai no meio de uma mensagem;
- a carga inicial pode **parar as escritas** de uma tabela do core inteira;
- uma queda curta do banco do analytics manda a **fila inteira para a DLQ**;
- o consumidor recusa nome em branco que o core aceita;
- o desvio do §6 não foi registrado no catálogo.

Sobre a pergunta de foco 3:
- **O `LOCK TABLE ... IN SHARE MODE` não causa deadlock.** A carga segura um único lock pesado por vez e nunca
  pede um segundo lock que conflite com a API (análise abaixo).
- **Mas o lock é perigoso em produção sem `lock_timeout`** (🟡-2, reproduzido).
- **Emitir `*.deleted` para os excluídos está correto** e é melhor que o texto do §6. Com `*.updated`, pagamento
  excluído voltaria a contar como receita (contra a D-2) e quarto excluído entraria na contagem. Falta só
  registrar isso no catálogo (🟡-5).

## Achados no escopo

### 🟡-1 [Disponibilidade] Queda do canal AMQP durante uma mensagem derruba o processo inteiro (rejeição não tratada)
**Onde:** `services/analytics-service/app/consumer/consumer.js:75` (`channel.ack`) e `:82` (`channel.nack` fora de `try`). O comentário em `:65` diz "Nunca lança".
**Cenário:**
1. O consumidor processa até 10 mensagens em paralelo (prefetch 10).
2. A conexão com o RabbitMQ cai enquanto `applyEvent` está na transação: reinício do broker, *heartbeat* perdido ou rede.
3. A transação confirma e `channel.ack(msg)` lança `IllegalOperationError: Channel closed`. No amqplib 2.2.0, `sendImmediately` vira `invalidOp` depois do *close* (`lib/channel.js:338-343`).
4. O `catch` trata isso como erro transitório e chama `channel.nack(...)` na linha 82. O `nack` lança de novo, agora **dentro do catch**, e a promise do handler rejeita.
5. O amqplib não faz `await` no callback, então a rejeição fica sem tratamento. No Node 24 isso **encerra o processo**: a API HTTP cai junto, e o laço de reconexão de `createConsumer` nunca roda.

**Reproduzido:** handler com canal fechado, `apply` confirmando e nenhum `catch` em volta, como o amqplib chama o callback. O processo saiu com código 1, com o stack em `consumer.js:82:25`.

Não há perda de dado: o `restart: unless-stopped` religa o serviço e a reentrega é idempotente. Mas cada queda do broker vira *restart* do serviço, e no k8s vira `CrashLoopBackOff` se o broker oscilar.
**Regra violada:** contrato do próprio módulo ("todo caminho termina em ack ou nack") e §5.3 ("não bloqueia as outras"). Fail-safe.
**Correção sugerida:** envolver o `nack` da linha 82 em `try { } catch { }`, como já é feito na linha 93. Separar a falha do `ack` depois do commit: canal fechado depois do commit não é falha do evento, e a reentrega cai em `duplicate`. Teste: canal com `ack` e `nack` que lançam; o handler resolve sem rejeitar.

### 🟡-2 [Operação / produção] `LOCK TABLE ... IN SHARE MODE` sem `lock_timeout`: uma transação longa transforma a carga em parada total de escrita naquela tabela
**Onde:** `services/core-service/database/outboxInitialLoad.js:47-48`, e o comentário em `:17-23` ("milissegundos num hotel pequeno").
**Cenário:** o `SHARE` conflita com o `ROW EXCLUSIVE` de todo INSERT, UPDATE e DELETE.
1. Uma transação qualquer já tem escrita em `payments`. Pode ser lenta ou *idle in transaction*: `migrate`, `closeEndedStayAccounts`, um `psql` de operador, uma conexão vazada.
2. O `LOCK` da carga entra na fila atrás dela, e o PostgreSQL enfileira **toda escrita nova** em `payments` atrás do `LOCK` (fila justa de locks).
3. A recepção não consegue registrar pagamento até a transação antiga terminar. Não há prazo nenhum: nem `lock_timeout` nem `statement_timeout`.

Mesmo sem transação longa, o lock dura o `INSERT ... SELECT` da tabela **inteira, de todos os hotéis** (é SaaS). Em `reservations` e `payments` com centenas de milhares de linhas, isso dá segundos a dezenas de segundos sem check-in, check-out nem pagamento, em todos os hotéis.

**Reproduzido** (Postgres próprio, 5449):
- A: `BEGIN; UPDATE payments ... WHERE false; pg_sleep(12)`.
- B: o `LOCK TABLE payments IN SHARE MODE` da carga.
- C: um `UPDATE payments` novo, com `statement_timeout = 4s`.

Resultado: **C cancelado por timeout**. O `pg_stat_activity` mostrou B esperando `Lock`. C só esperava porque B estava na fila: o `ROW EXCLUSIVE` de C é compatível com o de A.

**Deadlock: não há.** A carga segura no máximo um lock pesado por transação, de uma tabela de domínio. O `INSERT` no outbox só pede `ROW EXCLUSIVE`, compatível com a API e com o `FOR UPDATE SKIP LOCKED` do publicador. Nenhum caminho da API pede `SHARE` ou mais forte no outbox. Uma transação da API que segura `rooms` e pede `reservations` espera a carga terminar, sem ciclo.

**O lock é necessário: confirmado por teste de mutação.** Sem a linha 48, o teste de ordem falha com `['902','901']`.
**Regra violada:** a operação do hotel não pode parar por causa do analytics (ADR-003: o analytics não altera estado do hotel e não pode afetá-lo).
**Correção sugerida:** o mínimo é `SET LOCAL lock_timeout = '3s'` antes do `LOCK`, com algumas novas tentativas e mensagem clara, e um runbook mandando rodar a carga fora do pico. Alternativa sem lock de tabela, que preserva a ordem: `INSERT INTO outbox ... SELECT ... FROM <tabela> t FOR SHARE`. O bloqueio passa a ser por linha. No `READ COMMITTED`, a leitura espera quem está alterando a linha e relê a versão confirmada; linhas novas, que não entram no retrato, saem com o próprio `*.created`. Também vale fatiar por tenant para encurtar cada transação.

### 🟡-3 [Resiliência] Banco do analytics fora do ar por ~40 s manda a fila inteira para a DLQ
**Onde:** `services/analytics-service/app/consumer/consumer.js:28-34` (conexão = transitório), `:80-84` (conta tentativa) e `:116` (`ready()` só antes de consumir, nunca depois).
**Cenário:**
1. O `analytics-postgres` reinicia: *upgrade*, *restart* do compose, *failover*.
2. O consumidor continua recebendo. Cada mensagem falha na hora (`ECONNREFUSED` ou `SequelizeConnectionRefusedError`) e leva *nack*. O broker devolve em 10 s, e a contagem do `x-death` sobe.
3. Em 5 ciclos, cerca de 40 s, **todas** as mensagens da fila e todas as que chegarem nesse intervalo vão para a DLQ.
4. As projeções ficam congeladas até alguém reprocessar a DLQ à mão (§5.3: "não volta sozinha").

Isso segue o §5.3 ao pé da letra, que cita "banco do analytics fora do ar" como transitório. Mas o efeito prático é que um *restart* de rotina vira incidente manual.

Confirmado por leitura, não reproduzido com o banco derrubado.
**Regra violada:** §5.3, objetivo de "uma mensagem com problema não bloqueia as outras". Aqui o problema não é da mensagem, é do serviço, e não deveria gastar as tentativas dela.
**Correção sugerida:** tratar erro de **conexão** (`SequelizeConnection*Error`, SQLSTATE `08*`, `57P01`/`57P03`) de outro jeito. Fechar o canal **sem** *nack*: o broker devolve as mensagens não confirmadas à fila sem `x-death`. Depois, voltar ao laço de reconexão, que passa por `ready()`. Deixar o caminho dos 5 × 10 s para erro transitório da **mensagem** (deadlock, serialização, timeout). Uma linha no §5.3.

### 🟡-4 [Contrato / LGPD] O consumidor recusa nome em branco que o core aceita: o evento vai para a DLQ e a projeção fica com o nome antigo
**Onde:** `services/analytics-service/app/events/catalog.js:31` (`texto` exige `trim() !== ''`), usado em `:50` e `:51` (`full_name`, `room_category.name`, `room.number`, `payment.method`).

Do lado do core, `services/core-service/app/Controllers/GuestApi/UpdateGuestController.js:13` grava qualquer `full_name !== undefined`, inclusive `""` e `"   "`. O `CreateGuestController.js:9` aceita `"   "`. O `GuestModel` não tem `notEmpty`.
**Cenário:**
1. `PUT /guests/:id` com `{ "full_name": " " }` responde 200 no core.
2. O trigger publica `guest.updated` com `full_name: " "`.
3. O analytics lança `PermanentEventError` e manda o evento para a DLQ. `proj_guests` continua com o nome anterior.

Se alguém apagou o nome justamente para anonimizar, o nome verdadeiro fica no analytics. Num `guest.created` com `"   "`, o hóspede nem entra na projeção, e as reservas dele perdem o nome nos alertas.

O catálogo §4.4 tipa o campo só como `string`: o consumidor está mais estrito que o contrato que o produtor cumpre.
**Regra violada:** §7 e §2 (o consumidor aceita o que o contrato define); CA-01.4.l, minimização, no caso da anonimização.
**Correção sugerida:** no consumidor, aceitar qualquer `string` nos campos de texto, ou normalizar o branco para um marcador fixo. Continuar recusando o tipo errado (número, nulo). A validação de entrada no core foi repassada (ver tabela).

### 🟡-5 [Contrato / documentação] A carga inicial desvia do §6 (`*.deleted` em vez de `*.updated`) e o catálogo não foi atualizado
**Onde:** `services/core-service/database/outboxInitialLoad.js:11-15,43-45`. O relatório `analytics_service_h2_21102026.md:7` diz "sem alteração nesta etapa" e põe o ajuste como pendência 3. O mesmo vale para `payments.reservation_id` nulo, aceito em `catalog.js:63` (catálogo §4.6 tipa como UUID).
**Cenário:** a decisão técnica está **certa**. O consumidor faz `deleted_at = NULL` num `*.updated`, então um pagamento excluído entraria vivo na projeção nova e voltaria a contar como receita, contra a D-2.

O problema é que o catálogo v1.0 é o contrato aprovado, e a branch o contradiz sem registro. Um próximo consumidor (b2b, BI), ou quem reimplementar a carga seguindo o §6, faz o errado. A marca de exclusão vinda da carga recebe a data da carga, não a data real da exclusão. Nenhuma consulta usa essa data hoje, mas isso também não está escrito.
**Regra violada:** catálogo v1.0 §6 e §4.6 (contrato aprovado pelo Gabriel); "SPEC antes de implementar".
**Correção sugerida:** antes do merge, ou como primeiro commit da H.3, acrescentar ao §6: "registro com exclusão lógica sai como `*.deleted`, com o retrato; `deleted_at` da projeção = instante da carga". Acrescentar ao §4.6: "`reservation_id` UUID ou `null` (conta sem reserva, T-04.4)". Pede o aval do Gabriel, já solicitado no relatório.

### 🟢-1 [Indicador] "Em limpeza desde" de quarto já em `CLEANING` na carga inicial vira o instante da carga
**Onde:** `services/analytics-service/app/events/applyEvent.js:43-45`, com o `now()` em `outboxInitialLoad.js:53`.
**Cenário:** um quarto em limpeza desde 08:00 recebe a carga às 15:00. O alerta `cleaning_pending` mostra "em limpeza há 0 min" em vez de 7 h. Afeta só os quartos que estavam em limpeza no dia da virada. Já registrado pelo executor (pendência 5).
**Correção sugerida:** na carga, usar `rooms.updated_at` como `occurred_at` das linhas de `rooms`, ou aceitar e documentar.

### 🟢-2 [LGPD] A DLQ guarda o payload com o nome do hóspede sem prazo
**Onde:** `services/analytics-service/app/consumer/consumer.js:48` republica `msg.content` inteiro em `analytics.dlx`. A fila `analytics.core-events.dlq` não tem TTL (catálogo §3).
**Cenário:** `guest.created` com o nome "Maria X" cai na DLQ. Depois, a titular pede eliminação (T-06.11). A projeção recebe "Hóspede eliminado", mas a cópia na DLQ continua com o nome, indefinidamente.
**Correção sugerida:** a T-06.11 deve incluir a purga ou o reprocessamento da DLQ no procedimento de eliminação. Registrar como pendência da T-06.11.

### 🟢-3 [Operação] `/health` responde OK com o consumidor parado ou o banco fora
**Onde:** `services/analytics-service/routes/router.js:10-12` e o `HEALTHCHECK` do `Dockerfile:26-27`.
**Cenário:** o consumidor está no laço de reconexão há horas (credencial errada, topologia ausente) ou o banco caiu. O contêiner continua "healthy", e a defasagem só aparece na profundidade da fila.
**Correção sugerida:** no k8s (H.3), uma *readiness* que confira o banco. A métrica de atraso de consumo (CA-01.4.f) cobre o resto.

### 🟢-4 [Operação] Sem desligamento ordenado no SIGTERM
**Onde:** `services/analytics-service/_web.js` (não registra `SIGTERM`; `consumer.stop()` nunca é chamado).
**Cenário:** um *rollout* mata o processo com mensagens em voo. Elas são reentregues e caem em `duplicate`, então não há dano. Mas as transações são cortadas no meio e o *pool* não fecha.
**Correção sugerida:** `process.on('SIGTERM', ...)` que chama `consumer.stop()`, fecha o servidor HTTP e faz `sequelize.close()`.

### 🟢-5 [Dívida] `processed_events` cresce para sempre
**Onde:** `services/analytics-service/app/Models/ProcessedEventModel.js`, sem rotina de limpeza. Já registrado (pendência 4).
**Correção sugerida:** apagar com mais de N dias. A barreira de `aggregate_version` cobre as duplicatas antigas.

### 🟢-6 [Contrato / QA] `GET /analytics/health` sem OpenAPI, e o `qa_checks.sh` não confere as rotas do analytics
**Onde:** `services/analytics-service/routes/router.js:18`. `scripts/qa_checks.sh`: as regras 4 (ordem de rota) e 7 (Swagger) percorrem só `$CORE/routes/apis/*.js`.
**Cenário:** hoje nenhum cliente tipado consome o analytics, então nada quebra. Na H.3 as 7 consultas mudam de serviço, e o frontend gera o cliente pelo OpenAPI: sem documento do analytics, o cliente perde os endpoints. O comentário do `qa_checks.sh` é honesto sobre quais regras valem para o analytics.
**Correção sugerida:** a H.3 entrega o OpenAPI do analytics, ou o roteamento no Swagger do core, junto com as consultas, e estende as regras 4 e 7 a `$ANALYTICS/routes`.

### Observação (não é achado; SUSPEITA não confirmada)
Uma escrita num registro **já excluído** gera `*.updated` sem `deleted_at` no payload. Isso aconteceria se o `*.deleted` (versão menor) fosse para a espera de 10 s e um `*.updated` posterior (versão maior) chegasse antes. Nesse caso a marca de exclusão se perderia. Não achei caminho no core que altere linha *paranoid* excluída: o Sequelize filtra `deleted_at IS NULL`. Fica como ponto de atenção se a T-06.13 (estorno) alterar pagamento excluído.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | CI não roda a suíte do analytics: o portão de 60% não vale para o serviço novo | `.github/workflows/ci.yml:40` (só `services/core-service`) | Weslley | `docs/qa/repasses/para_weslley_23102026.md` |
| 🟡 | SUSPEITA: a fila *quorum* `analytics.core-events` faz *dead-lettering* `at-most-once` (padrão), e uma mensagem em nova tentativa pode se perder numa falha do broker | `infra/k8s/rabbitmq-setup.sh:42-43` | Weslley | `docs/qa/repasses/para_weslley_23102026.md` |
| 🟢 | O core aceita `full_name` em branco no cadastro e na edição de hóspede (raiz do 🟡-4) | `services/core-service/app/Controllers/GuestApi/UpdateGuestController.js:13`, `CreateGuestController.js:9` | DONO INDEFINIDO | `docs/qa/repasses/para_indefinido_23102026.md` |

## O que foi verificado e está correto
- **Idempotência (CA-01.4.h):**
  - `INSERT ... ON CONFLICT DO NOTHING RETURNING` em `processed_events` e upsert com `WHERE p.aggregate_version < EXCLUDED.aggregate_version`, na **mesma** `sequelize.transaction` (`applyEvent.js:92-100`).
  - O *ack* só sai depois de o `await apply` resolver, ou seja, depois do commit (`consumer.js:74-75`).
  - Um erro, inclusive o de outro tenant, desfaz o `processed_events` (teste).
  - Concorrência entre versões do mesmo agregado com prefetch 10: o `ON CONFLICT DO UPDATE` reavalia o `WHERE` na versão confirmada. Correto.
  - Mutação: tirar `processed_events` muda `duplicate` para `stale`, e o teste pega.
- **`*.deleted`:** `COALESCE(p.deleted_at, EXCLUDED.deleted_at)`. Nenhum fato posterior desfaz a marca, e um `*.updated` atrasado é `stale`.
- **Política de falha (CA-01.4.i):**
  - Permanente vai direto para `analytics.dlx` com *ack*.
  - Transitório leva `nack(requeue=false)` e passa pela espera de 10 s. A contagem vem do `x-death` filtrado por `queue = analytics.core-events` e `reason = rejected`. Na 5ª falha vai para a DLQ.
  - Sem confirmação da DLQ, a mensagem leva *nack* e não *ack*.
  - Integração com o RabbitMQ 4 real e a topologia oficial: o transitório fez 5 tentativas em 40 s e outro evento passou no meio.
- **Isolamento:**
  - Toda projeção tem `tenant_id` e o upsert exige `p.tenant_id = EXCLUDED.tenant_id`.
  - `tenant.*` com `aggregate_id ≠ tenant_id` é recusado.
  - `GetProjectionStatusController` filtra por `request.tenantId`.
  - O `tenantMiddleware` usa `findOne({ id, tenant_id })` e deixa passar só `ACTIVE`.
  - Nenhum `findByPk` e nenhum tenant vindo de body, query ou params (`qa_checks` sem erro).
- **JWT (ADR-006):**
  - `jwt.verify(token, publicKey, { algorithms: ['RS256'] })`.
  - O boot recusa arquivo com `PRIVATE KEY` e chave que não é RSA.
  - Testes: HS256 com a pública, RS512 e expirado dão 401; `WAITER` dá 403.
- **Credencial do RabbitMQ:** o analytics não declara nada. O teste de integração prova `ACCESS_REFUSED` ao publicar na *exchange* do core.
- **Minimização (CA-01.4.l):**
  - `proj_guests` = id, `tenant_id`, `full_name`, `aggregate_version`, `deleted_at`.
  - Campo extra no payload é descartado.
  - `guest.erased` grava "Hóspede eliminado", e um evento antigo não traz o nome de volta.
  - Os logs e o cabeçalho `x-error` citam o campo, nunca o valor.
- **Dinheiro:**
  - `DECIMAL(12,2)` com o mesmo tamanho do core.
  - Regex de string decimal com duas casas; nenhum `Number()` nem `::float` sobre valor.
  - Soma de `0.10 + 0.20` = `"0.30"` (teste).
- **Carga inicial:**
  - Payload pela mesma `outbox_payload` dos triggers.
  - Allowlist fixa de tabelas interpoladas.
  - Rodar duas vezes não muda as projeções.
  - O lock é necessário (mutação).
  - Sem deadlock, pela análise acima.
- **Imagem** (`docker build` real):
  - `uid=1000(node)`.
  - `/app` sem `tests/`, `keys/`, `.env` nem `.pem`; só `.env.example`.
  - Sem chave pública, o boot sai com mensagem clara.
- **Compose:**
  - `docker compose config -q` OK.
  - `analytics-postgres` próprio, com volume próprio e sem porta no host.
  - Só a `jwt-public.pem` montada, `:ro`.
  - `RABBITMQ_ANALYTICS_PASSWORD` obrigatório.
- **`qa_checks.sh`:** passa a varrer `$ANALYTICS/*` nas regras de grep. Resultado: `⚠ 3 aviso(s). Nenhum erro bloqueante.`, os mesmos avisos da develop.
- **O core não mudou de comportamento:**
  - Suíte do core: `Test Files 40 passed`, `Tests 841 passed | 1 skipped`. Statements 83,45%, Lines 85,86%.
  - As únicas mudanças no core são o subcomando novo e o arquivo novo, sem tocar em caminho existente.
- **Suíte do analytics:** `Test Files 5 passed`, `Tests 70 passed`, com RabbitMQ real. Statements 94,07%, Branches 88,7%.
- **Relatório do executor:** o arquivo commitado está íntegro. `git diff HEAD` vazio, sem resto de `sed`, tabelas e seções completas.

## Não foi possível verificar
- **Tempo real do `LOCK` com volume de produção:** sem massa de dados representativa. O risco foi demonstrado pelo mecanismo (fila de locks), não pela duração.
- **O 🟡-3 com o banco derrubado de fato:** confirmado por leitura do código.
- **O comportamento `at-most-once` do *dead-lettering* da fila *quorum* sob falha do broker** (repasse): baseado no padrão documentado do RabbitMQ, não reproduzido.
- **K8s (CA-01.4.n) e as 7 consultas (CA-01.4.k):** fora da H.2.

Ambiente da auditoria: `pg-qah2` (5449) e `rmq-qah2` (5689/15689), com a topologia aplicada pelo `infra/k8s/rabbitmq-setup.sh` oficial. Os dois foram removidos ao final, com a imagem `qah2-analytics:audit`. Os `.env.test` foram restaurados.
