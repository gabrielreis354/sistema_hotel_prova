# QA Red Team — repasses do Weslley: policy do RabbitMQ, seed do start.sh e CI do analytics
**Branches:** `fix/rabbitmq-policy-e-seed` (157a6bf, 28b74f9 · base `develop@093d14b`) e `feature/ci-analytics-service` (2a5147d · base `origin/feature/analytics-service`) · **Dev:** Weslley · **Data:** 30/10/2026
**Arquivos auditados:** 6 (`infra/k8s/rabbitmq-setup.sh`, `start.sh`, `README.md`, `docs/specs/anexos/SPEC-01-catalogo-eventos.md`, `.github/workflows/ci.yml`, `services/analytics-service/tests/rabbitmq.integration.test.js`). Também lidos para contexto: `consumer.js`, `.env.test.example`, `tests/setup/*`, `vitest.config.js`, `docker-compose.yml`, `infra/k8s/rabbitmq.yaml` e `kustomization.yaml`, `seed_*.sql` e `command.js` do core.
**Achados no escopo:** 9 (🔴 0 · 🟡 3 · 🟢 6) · **Fora do diff (mesmo dono):** 1 🟡 · **Repassados:** 1 🟢

## Veredito
**APROVADO COM RESSALVAS** (as duas branches).

Não há 🔴 no escopo. O repasse de 26/10 (seed) está fechado. A parte do repasse de 23/10 sobre a perna fila principal → fila de espera em *at-least-once* também está fechada, e isso foi reproduzido. O repasse de 23/10 sobre o CI está fechado: o job roda 93 testes e o de integração não é pulado.

O repasse de 29/10 está fechado **pela metade**. O `delivery-limit` 50 afasta o descarte do caminho normal do consumidor. O ciclo de *dead-letter* por `delivery_limit` continua existindo, e a mensagem que chega nele é descartada sem aviso. Isso foi reproduzido (🟡-1). O catálogo agora afirma o contrário.

---

## Ambiente da auditoria
- RabbitMQ 4.4.0 em `rabbitmq:4-management-alpine` (`rabbitmqadmin` 2.35.0) e PostgreSQL 17, nos contêineres `qa-wes-rmq` e `qa-wes-pg`. Os dois foram removidos ao final com `rm -f -v`.
- A topologia foi aplicada assim: primeiro o script da `develop`, que cria a fila sem policy, como num volume que já existe. Depois o script da `fix/rabbitmq-policy-e-seed`, **duas vezes**.
- A suíte do analytics da `feature/ci-analytics-service` rodou numa cópia em scratchpad, contra o broker **com** a policy, para simular o estado depois do merge das duas branches. O `.env.test` foi gerado como no CI. O working tree do repo não foi tocado.

| Experimento | Resultado |
|---|---|
| Script da fix aplicado 2× sobre fila existente | Rodou sem erro nas duas vezes. `analytics.core-events` com `policy=analytics-core-events`, `effective_policy_definition={dead-letter-strategy: at-least-once, delivery-limit: 50, overflow: reject-publish}`, `delivery_limit: 50` na API. Argumentos da fila intactos (`x-dead-letter-exchange=analytics.retry`) |
| `x-delivery-count` depois da fila de espera | Plano de entregas c,c,n,c,n,a (c = conexão fechada sem liquidar, n = *nack* sem reenfileirar, a = *ack*). Contagens observadas: dc = -,1,2 → *nack* → **volta com dc=2** → c → dc=3 → *nack* → volta com dc=3. O **retorno sem liquidar soma 1**, o *nack* não soma, e **a contagem não zera** na volta pela fila de espera |
| Mensagem que nunca é liquidada (fecha a conexão a cada entrega) | 51 entregas (dc até 50). Depois disso, as três filas ficaram com 0 mensagens e a DLQ também. Log do broker: `Message dropped because the following list of queues (ordered by death recency) contains a dead letter cycle without reason 'rejected'` |
| *at-least-once* com a fila de espera apagada | *nack* → a mensagem **ficou retida** na fila principal. Log: `Cannot forward any dead-letter messages from source queue 'analytics.core-events' ... This message will not be logged again`. Com o setup reaplicado, a mensagem voltou ao consumidor em ~156 s, com `x-death` correto. Com o script da `develop` (*at-most-once*), ela seria descartada |
| DLQ inspecionada pela API de gestão (`ackmode: reject_requeue_true`, o padrão do botão "Get messages") | Na 21ª inspeção a mensagem **sumiu da DLQ** (ver "Fora do diff") |
| Suíte do analytics contra o broker com a policy | 7 arquivos e 93 testes verdes. Cobertura: 95,4% stmts, 89,4% branches. `rabbitmq.integration.test.js` com 8/8 executados, nenhum pulado, ~85 s |
| `psql` com e sem `ON_ERROR_STOP` (seed contra banco incompleto) | Com a flag: **rc=3** no primeiro erro. Sem a flag: rc=0 com 5 erros, e o `start.sh` antigo diria "Seed aplicado" |

---

## Achados no escopo

### 🟡-1 [infra / perda de evento] O `delivery-limit` 50 não fecha o ciclo: a mensagem que nunca é liquidada é descartada na 51ª entrega, e o catálogo diz que isso não acontece
**Onde:** `infra/k8s/rabbitmq-setup.sh:53-58` (policy) e `docs/specs/anexos/SPEC-01-catalogo-eventos.md:68` (fix), no trecho "quem manda para a DLQ é o consumidor, nunca o limite do broker".
**Cenário (reproduzido):** pegue um evento cujo processamento derruba o processo antes de qualquer *ack*/*nack*. Exemplos: OOM com um *payload* grande, *segfault* num módulo nativo, pod morto pelo kubelet por memória no meio do `apply`. Cada queda devolve a mensagem sem liquidar, e o dc soma 1. O `tratarFalha` do consumidor nunca roda, então o teto de 10 não age. Na 51ª entrega, o broker faz *dead-letter* com `delivery_limit` para `analytics.retry`. A fila de espera devolve a mensagem, o RabbitMQ detecta um ciclo sem `rejected` e **descarta o evento**. Nada vai para a DLQ, e o log avisa uma única vez ("will not be logged again").

No caminho normal a margem é suficiente. Pior caso: 10 pausas + 4 *nacks* + 1 DLQ dá dc ≈ 10. O *nack* não soma, conforme o experimento. Sobram ~40 entregas para quedas e reconexões. Ou seja: o limite foi afastado, mas o caminho de descarte continua existindo, e é justamente o caso da mensagem "venenosa" que o consumidor não consegue classificar.
**Regra violada:** catálogo §5.3 ("perder o evento é pior que repeti-lo") e CA-01.4.i. A documentação passa a afirmar uma garantia que não vale.
**Correção sugerida:** o mínimo é **corrigir o texto** do §3 (e o comentário de `rabbitmq-setup.sh:53-55`), dizendo que o limite cobre a mensagem que derruba o consumidor e que ela é descartada. Escolher depois, com o Gabriel, entre:
- `delivery-limit: -1` (sem limite, aceito pela quorum desde a 4.0; **confirmar na 4.4**). O evento venenoso vira um *crash-loop* visível em vez de uma perda silenciosa.
- manter 50 e criar um alerta (Loki/Grafana) no texto `dead letter cycle without reason 'rejected'`.

### 🟡-2 [infra / SUSPEITA] A volta da fila de espera continua *at-most-once*: o repasse de 23/10 foi fechado só na ida
**Onde:** `infra/k8s/rabbitmq-setup.sh:44-45`. `analytics.core-events.retry` é `classic`, com `x-message-ttl` e `x-dead-letter-exchange=analytics.requeue`. A policy (`:56`, `--apply-to quorum_queues`, padrão `^analytics\.core-events$`) não a alcança.
**Cenário:** a policy garante a perna fila principal → espera, e isso foi reproduzido acima. A perna espera → fila principal é *dead-lettering* por expiração de fila **clássica**, e esse tipo é sempre *at-most-once* (comportamento documentado do RabbitMQ). Se a mensagem expirar enquanto `analytics.core-events` não aceita a entrega, ela é descartada sem aviso. Isso pode ocorrer no *restart* do nó único do k8s (`rabbitmq.yaml:22`, `replicas: 1`): a fila clássica recupera e expira as mensagens antes de a quorum eleger líder. O repasse de 23/10 pediu "avaliar também se a fila de espera (classic) deve ser durável/quorum". Não há avaliação nem registro dessa decisão.
**Status:** SUSPEITA. Não foi reproduzido, porque exige derrubar o nó com uma mensagem em espera. Para confirmar: com uma mensagem em `analytics.core-events.retry`, faça `docker restart` e confira se ela volta à fila principal.
**Regra violada:** catálogo §5.3/§5.4 (pelo menos uma vez). Item do repasse de 23/10 sem resposta.
**Correção sugerida:** o mínimo é registrar a decisão no §3 do catálogo ("a volta é *at-most-once*; risco aceito em nó único porque..."). Se a decisão for fechar, troque a espera por uma quorum com `x-message-ttl`, aceito pela quorum desde a 3.10/4.x, mais uma policy *at-least-once* + `reject-publish` também nela. Isso exige recriar a fila numa janela, porque o tipo não muda por policy.

### 🟡-3 [segurança operacional] `./start.sh seed` grava usuários com senha conhecida no k8s sem a trava que o `command.js seed` tem
**Onde:** `start.sh:177-193`, com `:190` (`psql ... < "$seed_dir/$file"`) e `:192`. Promovido em `README.md:254` e `:835`.
**Cenário:** o `command.js seed` (`services/core-service/command.js:82-87`) recusa `NODE_ENV=production` sem `ALLOW_SEED=1`. O motivo está no próprio comentário: "digitado por engano cria um ADMIN com a senha documentada (senha123) no banco de produção de verdade". O `start.sh seed` vai direto ao `psql` do StatefulSet e não passa por essa trava. Pelo `CLAUDE.md` §3, o k8s é o ambiente de **produção**. A branch passou a aplicar também o `seed_consumo.sql`, que cria `garcom@aurora.example` com `senha123`, e o README agora apresenta o `start.sh seed` como **o** caminho. Resultado: `./start.sh seed` digitado no contexto do cluster de produção cria ADMIN e WAITER com senha pública nos tenants `aurora`/`sol`.

O defeito de origem (sem trava) já existia antes da branch. A branch o ampliou (mais um usuário) e o divulgou.
**Regra violada:** paridade com a trava existente (DRY de regra de segurança). Credencial conhecida em produção.
**Correção sugerida:** no `cmd_seed`, exija `ALLOW_SEED=1` ou uma confirmação interativa, com o contexto (`kubectl config current-context`) impresso antes de aplicar. Isso espelha a regra do `command.js`.

### 🟢-4 [teste] Nenhum teste ou passo do CI garante que a policy está aplicada
**Onde:** `.github/workflows/ci.yml:146-156` (`feature/ci-analytics-service`). A base dessa branch ainda não tem a policy.
**Cenário:** depois do merge das duas branches, alguém remove ou quebra a linha `declare policy` (ex.: `apply-to` errado, JSON inválido que o `rabbitmqadmin` rejeita só nessa linha). A suíte continua verde, porque nenhum teste depende de *at-least-once* nem do `delivery-limit` 50. O teste 🟡-A usa `TETO_INFRA=3`, longe dos 20 do padrão.
**Correção sugerida:** adicionar um passo depois do setup: `docker exec <rmq> rabbitmqctl -q list_queues name policy effective_policy_definition | grep -q 'at-least-once'`, falhando se não encontrar.

### 🟢-5 [infra] A policy é substituída por inteiro por qualquer outra de prioridade maior que case com a fila
**Onde:** `infra/k8s/rabbitmq-setup.sh:56-58` (`--priority 10`).
**Cenário:** o RabbitMQ aplica **uma** policy de usuário por fila, a de maior prioridade. Uma policy genérica futura (ex.: `.*` com `max-length`, prioridade 20) faz a fila voltar a *at-most-once* e `delivery-limit` 20, sem erro. Já as *operator policies* se combinam (vale o menor valor). Hoje não existe nenhuma outra policy, então não há defeito atual.
**Correção sugerida:** acrescentar uma linha no comentário do script ou no §3 ("policy nova que case com `analytics.*` precisa repetir estas três chaves"). A verificação do 🟢-4 também cobre este caso.

### 🟢-6 [doc] Catálogo e comentários com o estado anterior
**Onde:**
- `docs/specs/anexos/SPEC-01-catalogo-eventos.md:68` (fix): mudou o §3 sem linha nova no **Histórico** do catálogo. Na `feature/analytics-service`, o §5.3 (linha 232) ainda diz "delivery-limit (20 por padrão)" e "O delivery-limit explícito na topologia é repasse ao Weslley".
- `start.sh:29` e `README.md:257,685,818`: ainda falam em "165 registros" e `seed/seed_hotels.sql`. O seed agora inclui a comanda.
**Cenário:** depois do merge, o leitor encontra dois valores para o limite e uma pendência que já foi resolvida.
**Correção sugerida:** linha no Histórico (v1.1.3), ajuste do §5.3 no merge e atualização do texto do `usage`/README.

### 🟢-7 [infra] O *at-least-once* retém mensagens quando a espera não aceita, e o broker avisa uma única vez
**Onde:** efeito da policy, `rabbitmq-setup.sh:58`.
**Cenário (reproduzido):** com a topologia de espera quebrada, as mensagens ficam retidas na fila principal e não são entregues. O log avisa uma vez e para ("This message will not be logged again"). É o comportamento desejado (não perder), mas sem métrica ninguém percebe.
**Correção sugerida:** expor ou alertar `message_bytes_dlx`/`messages_dlx` da fila no Prometheus (CA-01.4.f). Registrar como pendência da observabilidade.

### 🟢-8 [infra k8s] Mudar o script reinicia o broker no `apply`
**Onde:** `infra/k8s/kustomization.yaml:36-38`. O `configMapGenerator` gera o nome com hash.
**Cenário:** o hash do ConfigMap muda, o *template* do StatefulSet `rabbitmq` muda, e o `kubectl apply -k` reinicia o pod único do broker. É bom para reaplicar o setup, mas causa uma queda curta do broker. O outbox do core segura os eventos (CA-01.4.c), e o analytics reconecta.
**Correção sugerida:** nada no código. Uma linha no relatório de deploy ("aplicar fora do pico; o broker reinicia").

### 🟢-9 [CI] A corrida do `.erlang.cookie` é contida só pelo tempo; comentário de filtro de caminho desatualizado
**Onde:** `.github/workflows/ci.yml:128-134` e `:37`.
**Cenário:** confirmado que o contêiner roda como `uid=0` com `HOME=/var/lib/rabbitmq`. Um `rabbitmq-diagnostics` que rode antes do boot criaria o *cookie* como root. O primeiro *probe* sai só depois de `--health-interval 10s`, e o broker cria o *cookie* em poucos segundos. Se a corrida acontecer, o job **falha alto** (o serviço não fica *healthy*), sem falso verde. Por isso é 🟢. Separadamente, a linha 37 diz "cada serviço novo ganha o seu próprio job, **com filtro de caminho**", mas nenhum job tem `paths:`.
**Correção sugerida:** aceitável como está. Se a corrida aparecer, rodar a sonda como o usuário `rabbitmq` (`su-exec`/`gosu`; conferir qual existe na imagem alpine). Corrigir o comentário da linha 37 ou implementar o filtro.

---

## Fora do diff — mesmo dono (não entra no veredito)

### 🟡 [infra / perda de evento] A DLQ é quorum com `delivery-limit` padrão (20) e sem *dead-letter*: inspecionar pela UI apaga a mensagem
**Onde:** `infra/k8s/rabbitmq-setup.sh:46` (`analytics.core-events.dlq`, sem argumentos). A policy nova (`:56`) casa só com `^analytics\.core-events$`.
**Cenário (reproduzido, RabbitMQ 4.4.0):** chegou uma mensagem na DLQ. O operador abre o painel e clica "Get messages", cujo padrão é "Nack message requeue true", para ler a mensagem antes de reprocessar. Cada leitura soma 1 no dc. Na **21ª** leitura a mensagem sai da fila e, sem DLX, é descartada. O mesmo acontece com um *script* de reprocessamento que cai antes do *ack*. O catálogo §3 diz que a DLQ "fica até alguém olhar". Olhar é justamente o que a apaga.
**Correção sugerida:** incluir na mesma `fix/rabbitmq-policy-e-seed` uma segunda policy, `^analytics\.core-events\.dlq$`, com `delivery-limit: -1` (confirmar que a 4.4 aceita) ou um valor alto. Documentar no §3.

## Repassados a outro dev
Arquivo de repasse **não gravado**: o contrato desta auditoria pede só este relatório. Fica registrado para quem fizer o commit.

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟢 | Comentários do consumidor citam o `delivery-limit` "padrão (20)", que deixa de valer com a policy (50) | `services/analytics-service/app/consumer/consumer.js:79-80,131-133` (`feature/analytics-service`) | Gabriel (trilha do analytics/H.2) | a gravar em `docs/qa/repasses/para_gabriel_30102026.md`, se o orquestrador quiser |

---

## O que foi verificado e está correto
- **Policy:** sintaxe aceita pelo `rabbitmqadmin` 2.35. Aplicada a uma fila já existente sem recriá-la, e efetiva na API (`delivery_limit: 50`). Idempotente (2 execuções seguidas, sem erro). `apply-to quorum_queues` está correto. O argumento `x-dead-letter-exchange` da fila convive com a policy.
- **at-least-once:** exige `reject-publish`, presente. O *nack* com destino indisponível retém a mensagem e não a descarta (reproduzido).
- **`overflow: reject-publish` sem `max-length`:** sem efeito no publicador do core. O `overflow` só age com limite de tamanho. Publicação com *confirms* e `mandatory` funcionou nos 8 testes de integração. Se um `max-length` entrar no futuro, o publicador recebe `nack` e o outbox reenvia (§5.4), sem perda.
- **Interação com o teto de 10 do consumidor:** o dc **não zera** depois da fila de espera, e o *nack* não soma. Pior caso do caminho normal: dc ≈ 10, com folga de ~40 até 50. O consumidor usa `previousFailures` (por `x-death`/`rejected`) e `deliveryCount` cumulativo, e os dois continuam coerentes com a policy.
- **Idempotência no k8s e no compose:** o contêiner `setup` reexecuta em `until` e o serviço `rabbitmq-setup` roda a cada `up`. Os `declare` são PUT e passaram nas reexecuções. O ConfigMap vem do mesmo arquivo pelo `configMapGenerator`, sem cópia divergente.
- **CI:** portas 5432/5672 iguais às do `.env.test.example`. O `sed` substitui exatamente as três linhas vazias do exemplo. O `.env.test` com `override: true` (`env.js`, `globalSetup.js`) justifica gerar o arquivo. O banco `_test` é criado pelo `globalSetup`. `job.services.rabbitmq.id` está correto. O setup roda dentro do contêiner com `localhost:15672`, então a gestão não precisa ser exposta. O portão de cobertura está no `vitest.config.js` e o `node --check` cobre as pastas que existem. Senhas fixas no YAML são aceitáveis: contêiner efêmero, só no runner, sem valor fora do CI. Não coincidem com as do compose (`rabbitmq_local_password`).
- **start.sh seed:** o caminho está correto e a ordem é `seed_hotels` → `seed_consumo`, a mesma do `command.js:99`. `set -euo pipefail` (`start.sh:5`) com `ON_ERROR_STOP=1` faz o primeiro erro abortar o loop (rc=3, conferido). Os dois `.sql` têm `BEGIN/COMMIT` próprios, então a falha desfaz o arquivo inteiro. A existência dos dois arquivos é checada antes de aplicar qualquer um.
- `qa_checks.sh` na `feature/ci-analytics-service`: 0 erros bloqueantes (3 avisos fora do diff).

## Não foi possível verificar
- **Idempotência dos seeds contra um banco migrado.** O banco do core nasce do `node command.js migrate` (sync do Sequelize). Aplicar só o `db/schema.sql` não basta, e o seed falha em `enum_event_quotes_status`. Não rodei o `migrate` do core. A idempotência foi conferida só por leitura (`ON CONFLICT`/`NOT EXISTS`, cabeçalho do `seed_consumo.sql`).
- **🟡-2 (volta *at-most-once*)** não reproduzido: precisa de *restart* do nó com mensagem em espera.
- **Execução real no GitHub Actions** (tempo de boot do broker no runner, cache do npm). Simulado localmente com as mesmas imagens, credenciais e `.env.test`.
- **`delivery-limit: -1` na 4.4**, sugerido no 🟡-1 e no item da DLQ: não testado.
- **Merge:** `git merge-tree` da `fix/rabbitmq-policy-e-seed` com a `origin/feature/analytics-service`, e também com a `feature/ci-analytics-service`, dá conflito só em `docs/infra/KUBERNETES.md`. O conflito vem da divergência `develop` × `feature/analytics-service`: a fix não altera esse arquivo em relação à `develop`. `rabbitmq-setup.sh` e o catálogo fazem *auto-merge*.
