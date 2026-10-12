# SPEC-01 — Anexo: catálogo de eventos e política de falhas (T-01.2)

**Status:** **aprovado pelo Gabriel em 04/10/2026**, com as decisões da §9. Este documento é o
contrato da T-01.4 (extrair o `analytics-service`) e das rotas internas da T-01.6.
**Rastreia:** CA-01.2.b, CA-01.2.c, CA-01.2.d · CA-01.3.c e CA-01.3.d (ADR-006) · CA-06.11.d (LGPD).
**Base:** ADR-003 (recorte e protocolos) e ADR-006 (autenticação entre serviços). Tudo o que
este documento afirma sobre o código atual vale para a `develop` de 30/09/2026.

---

## 1. Como ler este catálogo

- **Um evento carrega o estado, não a diferença.** Todo evento de um agregado leva o retrato
  completo dos campos que o analytics projeta. O consumidor faz *upsert*; não precisa do
  evento anterior para aplicar o seguinte. É isso que torna seguras a reentrega, a nova
  tentativa fora de ordem e a carga inicial (§6).
- **O *payload* contém só o que as 7 consultas usam** (§4). Campo que nenhuma consulta lê não
  entra — nem "por via das dúvidas". Um consumidor futuro que precise de mais pede uma versão
  nova do evento.
- **Nenhum evento carrega dado pessoal além do nome do hóspede.** Nem CPF, nem telefone, nem
  e-mail — em nenhum agregado.

---

## 2. Envelope comum

Todo evento publicado pelo `core-service` tem este formato:

```json
{
  "event_id": "5d0f1c1e-8a7b-4a53-9a57-0c3f2b3e6a10",
  "type": "reservation.status_changed",
  "version": 1,
  "occurred_at": "2026-09-30T14:03:11.482Z",
  "tenant_id": "0b07ddaa-0083-4b21-ae07-b5dbcd49df0d",
  "aggregate_id": "a1b2c3d4-…",
  "aggregate_version": 18342,
  "payload": { }
}
```

| Campo | Tipo | Regra |
|---|---|---|
| `event_id` | UUID | Único por evento. É a chave de idempotência do consumidor e o `message_id` da mensagem AMQP |
| `type` | string | `<agregado>.<fato>` no passado, minúsculo — é também a *routing key* (§3) |
| `version` | inteiro | Versão do **esquema do payload** daquele `type`. Começa em `1`. Muda só em alteração incompatível (§7) |
| `occurred_at` | ISO-8601 UTC | Momento da alteração no core — o `now()` da transação que a gravou |
| `tenant_id` | UUID | **Obrigatório.** Vem do registro alterado, que por sua vez veio do JWT. Evento sem `tenant_id` é rejeitado pelo consumidor como erro permanente (§5.3) |
| `aggregate_id` | UUID | Id do registro alterado |
| `aggregate_version` | inteiro | Número de sequência da linha no *outbox* (§6). Crescente por agregado, **não contíguo**. O consumidor descarta evento com `aggregate_version` menor ou igual ao último aplicado àquele agregado |
| `payload` | objeto | Retrato do agregado — §4 |

**Tipos no payload:**

- **Dinheiro** (`DECIMAL` no banco) vai como **string** com duas casas: `"1250.00"`. É como o
  `pg` já entrega o valor ao core, e evita arredondamento de ponto flutuante no caminho. O
  consumidor grava em coluna `NUMERIC`.
- **Datas sem hora** (`DATEONLY`) vão como `"YYYY-MM-DD"`.
- **Instantes** vão como ISO-8601 UTC.

---

## 3. Topologia no RabbitMQ

| Objeto | Tipo | Função |
|---|---|---|
| `gesway.core.events` | *exchange* `topic`, durável | Onde o core publica. *Routing key* = `type` do evento |
| `analytics.core-events` | fila *quorum*, durável | Fila do analytics, ligada com `#` (todos os eventos). `x-dead-letter-exchange = analytics.retry` |
| `analytics.retry` → `analytics.core-events.retry` | *exchange* `fanout` + fila com `x-message-ttl = 10000` | Espera de 10 s entre tentativas. Ao expirar, a mensagem vai para `analytics.requeue` |
| `analytics.requeue` | *exchange* `fanout` | Devolve a mensagem **só** à fila do analytics — não à *exchange* do core, que a entregaria de novo a outros consumidores |
| `analytics.dlx` → `analytics.core-events.dlq` | *exchange* `fanout` + fila sem TTL | Fila de mensagens mortas. Fica até alguém olhar |

A topologia é declarada por um *Job* de setup com o usuário administrador — os serviços **não**
têm permissão de `configure` (§8).

---

## 4. Eventos

Os seis agregados da SPEC-01 §5. Para cada um: os eventos, o *payload*, e a consulta que usa
cada campo. As consultas são as de `services/core-service/app/Controllers/AnalyticsApi/`:

| Endpoint | Controller |
|---|---|
| `/analytics/revenue` | `GetRevenueController` |
| `/analytics/occupancy` | `GetOccupancyController` |
| `/analytics/alerts` | `GetAlertsController` |
| `/analytics/seasonality` | `GetSeasonalityController` |
| `/analytics/revenue-by-category` | `GetRevenueByCategoryController` |
| `/analytics/payment-mix` | `GetPaymentMixController` |
| `/analytics/top-guests` | `GetTopGuestsController` |

### 4.1 Hotel — `tenants`

| `type` | Quando |
|---|---|
| `tenant.created` | `POST /auth/register` cria o hotel |
| `tenant.updated` | Alteração de `status` |

| Campo | Tipo | Usado por |
|---|---|---|
| `status` | `ACTIVE` \| `SUSPENDED` | O `tenantMiddleware` do analytics — hotel suspenso recebe `403`, como no core hoje |

Nome, subdomínio, CNPJ e configurações de reserva não entram: nenhuma consulta os lê.
Hoje nenhum endpoint altera `status` — o `tenant.updated` existe para quando a suspensão
(nível de sistema/cobrança) for implementada.

### 4.2 Categoria de quarto — `room_categories`

| `type` | Quando |
|---|---|
| `room_category.created` · `room_category.updated` · `room_category.deleted` | CRUD de categorias |

| Campo | Tipo | Usado por |
|---|---|---|
| `name` | string | `revenue-by-category` (agrupamento) · `alerts.cleaning_pending` (coluna `category`) |

Preço e capacidade não entram: a receita vem de `reservations.total_amount`, não do preço da
categoria.

### 4.3 Quarto — `rooms`

| `type` | Quando |
|---|---|
| `room.created` · `room.updated` · `room.deleted` | CRUD, e **toda mudança de status** — check-in (`OCCUPIED`), check-out (`CLEANING`), limpeza concluída (`AVAILABLE`) e manutenção (`MAINTENANCE`) |

| Campo | Tipo | Usado por |
|---|---|---|
| `category_id` | UUID | `revenue-by-category` · `alerts.cleaning_pending` |
| `number` | string | `alerts.cleaning_pending` (`room_number`) |
| `status` | `AVAILABLE` \| `OCCUPIED` \| `CLEANING` \| `MAINTENANCE` | `occupancy` (contagens) · `alerts.cleaning_pending` |

`alerts.cleaning_pending` mostra "em limpeza desde" usando `rooms.updated_at`. Na projeção,
esse instante é o `occurred_at` do evento que levou o quarto a `CLEANING` — mais exato que o
`updated_at` de hoje, que muda com qualquer edição do quarto.

### 4.4 Hóspede — `guests` (minimização de dado pessoal)

| `type` | Quando |
|---|---|
| `guest.created` | Cadastro — inclusive o representante criado na assinatura de contrato e o hóspede da reserva pública |
| `guest.updated` | **Somente quando `full_name` muda.** Alteração de CPF, telefone ou e-mail não gera evento — o analytics não tem esses campos |
| `guest.deleted` | Exclusão lógica (`DELETE /guests/:id`, *soft delete*) |
| `guest.erased` | **Eliminação a pedido do titular (T-06.11, LGPD art. 18, VI).** Payload **vazio**. O consumidor troca o nome na projeção por `"Hóspede eliminado"` e mantém o `id`, para que as reservas históricas continuem somando nos indicadores (CA-06.11.d) |

| Campo | Tipo | Usado por |
|---|---|---|
| `full_name` | string | `top-guests` · `revenue.unpaid` · `alerts.no_show_risk` e `alerts.pending_too_long` (coluna `guest`) |

**A projeção guarda só `id`, `tenant_id` e nome** (CA-01.4.l). Isso muda a resposta de dois
endpoints — ver §9, decisão D-1.

### 4.5 Reserva — `reservations`

| `type` | Quando |
|---|---|
| `reservation.created` | Criação — manual, reserva pública (`DIRECT`) e reserva-bloco de contrato (`B2B`) |
| `reservation.updated` | Alteração de datas, quarto, hóspede ou valor |
| `reservation.status_changed` | Toda transição da máquina de estados. Leva também `previous_status` |
| `reservation.deleted` | Exclusão lógica |

| Campo | Tipo | Usado por |
|---|---|---|
| `guest_id` | UUID | `top-guests` · `revenue.unpaid` · `alerts` |
| `room_id` | UUID | `revenue-by-category` (quarto principal — ver §9, D-4) |
| `status` | `PENDING` \| `CONFIRMED` \| `CHECKED_IN` \| `CHECKED_OUT` \| `CANCELLED` | todas as consultas de reserva |
| `check_in_date` | `YYYY-MM-DD` | `occupancy` (ADR) · `seasonality` · `revenue-by-category` · `revenue.unpaid` · `alerts` |
| `check_out_date` | `YYYY-MM-DD` | `occupancy` (ADR) · `seasonality` (média de noites) · `top-guests` (`last_stay`) · `revenue.unpaid` |
| `total_amount` | string decimal | `revenue.expected` · `revenue.unpaid` · `occupancy` (ADR) · `seasonality` · `revenue-by-category` · `top-guests` · `alerts` |
| `created_at` | ISO-8601 | `alerts.pending_too_long` (pendente há mais de 48 h) |
| `previous_status` | idem `status` | só em `reservation.status_changed` — não é projetado; serve a consumidores futuros |

`source`, `user_id` e os quartos extras (`reservation_rooms`) não entram: nenhuma consulta os lê.

### 4.6 Pagamento — `payments`

| `type` | Quando |
|---|---|
| `payment.created` | Pagamento manual (já nasce `PAID`) e cobrança PIX (nasce `PENDING`) |
| `payment.updated` | Alteração de valor ou método |
| `payment.status_changed` | `PENDING → PAID` (webhook PIX), `EXPIRED`, `FAILED`. Leva `previous_status` |
| `payment.deleted` | Exclusão lógica (`DELETE /payments/:id`) |

| Campo | Tipo | Usado por |
|---|---|---|
| `reservation_id` | UUID | `revenue.unpaid` e `alerts.no_show_risk` (reserva **sem** pagamento) |
| `amount` | string decimal | `revenue.realized` · `payment-mix` |
| `method` | string | `payment-mix` |
| `status` | `PENDING` \| `PAID` \| `EXPIRED` \| `FAILED` | ver §9, D-3 |
| `paid_at` | ISO-8601 ou `null` | `revenue.realized` (por mês) · `payment-mix` — só conta com `paid_at` preenchido |

Dados do provedor (`provider`, `provider_charge_id`, `pix_qr_code`) não entram — já são
ocultados pelo `defaultScope` do model desde a T-06.5.

### 4.7 O que não gera evento

`users`, `consumptions`, `products`, `reservation_rooms` e as tabelas do `b2b-service`:
nenhuma das 7 consultas as lê (SPEC-01 §5). Consumo entra quando um indicador precisar dele.

---

## 5. Política do consumidor (`analytics-service`)

### 5.1 Recebimento

- *Prefetch* de **10** mensagens; *ack* manual, **depois** que a transação da projeção confirma.
- Uma mensagem é processada numa transação só: grava a projeção e registra o `event_id`.

### 5.2 Evento repetido — idempotência (CA-01.4.h)

Duas barreiras, na mesma transação da projeção:

1. **`event_id` já processado.** Tabela `processed_events (event_id PK, processed_at)`. O
   `INSERT … ON CONFLICT DO NOTHING` que não insere nada significa "já vi" → *ack* sem aplicar.
   Cobre a reentrega do broker e a republicação do *outbox* depois de uma falha na confirmação.
2. **Versão antiga.** Cada linha de projeção guarda o `aggregate_version` aplicado por último.
   Evento com versão menor ou igual → *ack* sem aplicar. Cobre a chegada fora de ordem — uma
   nova tentativa da versão 5 que chega depois da versão 7 já aplicada. Como o evento carrega
   o estado inteiro (§1), a versão 7 já contém o que a 5 mudaria.

Um `*.deleted` vira marca de exclusão na projeção (com a versão), não remoção física: um
`*.updated` atrasado não "ressuscita" o registro.

### 5.3 Falha — tentativas, intervalo e fila de mensagens mortas (CA-01.2.d, CA-01.4.i)

| Tipo de erro | Exemplos | O que acontece |
|---|---|---|
| **Transitório** | banco do analytics fora do ar, *deadlock*, *timeout* | *nack* sem reenfileirar → espera **10 s** na fila de nova tentativa → volta. **5 tentativas no total** (≈ 40 s). Na 5ª falha, a mensagem é publicada em `analytics.dlx` com o erro e o número de tentativas no cabeçalho, e recebe *ack* |
| **Permanente** | JSON inválido, `tenant_id` ausente, `type` desconhecido, `version` maior que a suportada | Direto para `analytics.dlx`, **sem** nova tentativa — tentar de novo não muda o resultado |

- A contagem de tentativas vem do cabeçalho `x-death` que o próprio RabbitMQ acrescenta a cada
  passagem pela fila de nova tentativa — o consumidor não guarda estado para isso.
- **Uma mensagem com problema não bloqueia as outras**: o *nack* a tira da fila principal na
  hora, e as seguintes continuam sendo processadas.
- Mensagem na fila de mensagens mortas não volta sozinha. Reprocessar é ação manual
  (painel do RabbitMQ ou *script*), depois de corrigida a causa. A profundidade dessa fila é
  métrica exposta ao Prometheus e ganha alerta no Grafana (CA-01.4.f).

### 5.4 Publicador (lado do core)

- *Outbox* transacional (CA-01.4.a): o evento é gravado **na mesma transação** da alteração.
  Se a transação desfaz, o evento some junto.
- O publicador lê o *outbox* a cada **1 s**, em lotes de até 100, com
  `FOR UPDATE SKIP LOCKED` — o backend roda com 3 réplicas, e cada linha é publicada por uma só.
- Publica com mensagem persistente e *publisher confirms*; só marca `published_at` depois da
  confirmação do broker. Sem confirmação, a linha fica pendente e sai na próxima rodada —
  **entrega pelo menos uma vez**; a duplicata é tratada pelo consumidor (§5.2).
- RabbitMQ fora do ar: o core continua operando e os eventos acumulam no *outbox*
  (CA-01.4.c). O publicador tenta de novo com espera crescente até **30 s** entre rodadas.

---

## 6. `aggregate_version` e carga inicial

O `aggregate_version` é o **número de sequência da linha no *outbox*** (`BIGSERIAL`) — nenhuma
tabela de domínio ganha coluna de versão. A ordem é garantida por agregado: duas transações que
alteram o mesmo registro disputam o *lock* da linha, e a segunda só grava no *outbox* depois
que a primeira confirma.

> **Regra de implementação que sustenta essa garantia:** dentro da transação, a linha do
> *outbox* é gravada **depois** da escrita no registro de domínio — nunca antes. O número da
> sequência é atribuído no `INSERT`, não no `COMMIT`. Se o *outbox* fosse gravado antes do
> `UPDATE`, a segunda transação poderia pegar o número da sequência antes de disputar o *lock*
> do registro, e a ordem por agregado deixaria de valer. A T-01.4 deve ter teste para isso.

**Carga inicial (CA-01.4.j):** um *script* do core percorre os seis agregados e grava no
*outbox*, para cada registro existente, um evento `*.updated` com o retrato atual. O
publicador e o consumidor são os mesmos do fluxo normal — não existe caminho paralelo para
testar. Rodar a carga duas vezes não duplica nada (§5.2).

---

## 7. Versionamento de evento

- **Mudança compatível** — campo novo, opcional, no *payload*: `version` **não** muda. O
  consumidor ignora campo que não conhece.
- **Mudança incompatível** — campo removido, renomeado ou com tipo alterado: `version` sobe.
  O consumidor que entende a versão nova é implantado **antes** do core que passa a publicá-la.
  Versão maior que a suportada é erro permanente (§5.3): vai para a fila de mensagens mortas e
  é reprocessada depois do deploy do consumidor.

---

## 8. Credenciais do RabbitMQ por serviço (CA-01.3.d)

Conforme a ADR-006. As expressões são as de `rabbitmqctl set_permissions` (*configure*,
*write*, *read*):

| Usuário | *configure* | *write* | *read* | Efeito |
|---|---|---|---|---|
| `hotel_core_publisher` | `^$` | `^gesway\.core\.events$` | `^$` | O core só publica na própria *exchange* |
| `hotel_analytics_consumer` | `^$` | `^analytics\.dlx$` | `^analytics\.core-events(\.dlq)?$` | O analytics consome a própria fila e envia à fila de mensagens mortas. **Não consegue publicar na *exchange* do core** — não fabrica evento de nenhum hotel |
| administrador (`RABBITMQ_DEFAULT_USER`) | tudo | tudo | tudo | Só o *Job* de setup da topologia (§3) e o operador. Não é injetado em nenhum Deployment de aplicação |

A volta da fila de nova tentativa (`analytics.retry` → `analytics.requeue`) é
*dead-lettering* do próprio broker, que não passa pela permissão do usuário.

---

## 9. Decisões que este catálogo pede — **para o Gabriel**

O catálogo mudaria comportamento visível do analytics. Cada item tem a recomendação e o motivo.

| # | Decisão | Recomendação | Por quê |
|---|---|---|---|
| **D-1** | `/analytics/top-guests` devolve `email` e `/analytics/alerts` devolve `guest_phone` — dado pessoal que a projeção não terá (SPEC-01 §5, CA-01.4.l) | **Tirar os dois campos da resposta.** Quem precisa contatar o hóspede abre a ficha pelo `guest_id` (`GET /guests/:id`, já protegido por papel) | Levar e-mail e telefone ao analytics duplicaria dado pessoal num segundo banco — mais uma cópia a eliminar na T-06.11. Nenhum teste (`analytics.test.js`) e nenhuma tela do frontend usam os dois campos hoje (conferido) |
| **D-2** | Pagamento excluído (`DELETE /payments/:id`, *soft delete*) **continua contando como receita** hoje: `GetRevenueController` e `GetPaymentMixController` não filtram `payments.deleted_at` | **Corrigir na projeção**: `payment.deleted` tira o pagamento da receita | É defeito atual, não escolha. A projeção corrige sem esforço extra; o teste de CA-01.4.p precisa refletir o comportamento correto |
| **D-3** | "Reserva sem pagamento" (`revenue.unpaid`, `alerts.no_show_risk`) considera **qualquer** linha de pagamento — uma cobrança PIX `PENDING` ou `EXPIRED` tira a reserva da lista de não pagas | **Considerar só pagamento `PAID`** | Uma cobrança PIX que venceu não pagou nada. Hoje o alerta de *no-show* some justamente no caso de maior risco |
| **D-4** | `revenue-by-category` atribui a receita toda ao quarto principal (`reservations.room_id`); reservas com vários quartos de categorias diferentes distorcem o indicador | **Manter como está nesta extração** (evento sem os quartos extras) | Mudar o cálculo é decisão de produto separada; se for mudar, o `reservation.*` ganha `room_ids` numa versão nova (§7) |

### 9.1 Decisões do Gabriel — 04/10/2026

Critério usado: **o que um PMS SaaS de mercado faria** (prática geral de produtos como OPERA
Cloud, Mews, Apaleo e Cloudbeds — não citação de documentação).

| # | Decisão | Como o mercado trata | Efeito neste catálogo |
|---|---|---|---|
| **D-1** | **Aceita, com complemento.** E-mail e telefone saem do analytics | Dado de operação (contato) fica no núcleo, com permissão por papel; a camada analítica trabalha com o mínimo | O card de alerta no frontend abre a ficha do hóspede pelo `guest_id` com um clique — o telefone vem do `core-service`. Nada muda no *payload* |
| **D-2** | **Aceita.** `payment.deleted` tira o pagamento da receita na projeção | **Lançamento financeiro não se apaga — se estorna**, com motivo, usuário e horário, e o original fica no histórico | A correção de fundo é trocar `DELETE /payments/:id` por estorno. Registrado como tarefa nova da SPEC-06; quando existir, a receita fica certa sem filtro |
| **D-3** | **Aceita, refinada em dois indicadores** | O mercado separa **garantia recebida** de **saldo devedor** | **Risco de *no-show***: reserva sem nenhum pagamento `PAID` — a garantia não chegou. **Valores em aberto** (`revenue.unpaid`): reserva com **saldo > 0**, isto é, `total_amount` − soma dos `PAID`. Uma reserva com sinal de 30% pago continua devendo 70%. Os campos necessários já estão nos eventos de §4.5 e §4.6 — o *payload* não muda; muda a consulta sobre a projeção |
| **D-4** | **Aceita: manter nesta extração** | **Cada quarto é uma reserva própria**, dentro de um agrupador (*booking* ou grupo), com tarifa e status próprios | O modelo atual — `room_id` principal mais o pivô `reservation_rooms` — é a causa comum de D-4 e das pendências **P-1** e **P-4** (§11). Registrado como ADR candidata; combina com a SPEC-07 |

**Dinheiro nas consultas sobre a projeção.** As consultas atuais do analytics convertem valor
para ponto flutuante (`total_amount::float`), contra a regra do projeto. As consultas da T-01.4
sobre as projeções mantêm `NUMERIC` do banco até a resposta, e devolvem string decimal, como o
§2 já define para o transporte.

---

## 10. Chamada síncrona `b2b-service → core-service` (CA-01.2.b, CA-01.2.d)

As duas rotas **só serão implementadas na T-01.6**. Aqui está o contrato; ele entra no
`swagger.js` junto com a implementação, para não documentar rota que não existe.

### 10.1 Autenticação — duas credenciais, cada uma prova uma coisa

| Cabeçalho | Prova | Origem |
|---|---|---|
| `X-Internal-Token: <B2B_SERVICE_TOKEN>` | Quem chama é o `b2b-service` | ADR-006, CA-01.3.c — comparado com `timingSafeEqual`, falha fechada sem a variável, mesmo padrão do webhook PIX |
| `Authorization: Bearer <JWT do usuário>` | **De qual hotel** e **qual usuário** pediu | O `b2b-service` repassa o token RS256 que recebeu. O core o verifica com a própria chave pública, como em qualquer rota |

**Por que repassar o JWT, e não mandar `tenant_id` no corpo:** a regra do projeto é "`tenant_id`
sempre do JWT — nunca de body, query ou params". Com o `tenant_id` no corpo, quem tivesse o
`B2B_SERVICE_TOKEN` — um segredo estático, que não expira (ADR-006, consequências) — poderia
criar ou cancelar reserva-bloco em **qualquer** hotel. Com o JWT repassado, o segredo vazado
sozinho não basta: ainda falta um token de usuário válido **daquele** hotel. O custo é zero —
toda assinatura e cancelamento de contrato já nasce de uma requisição autenticada de usuário.

O core aplica, nas rotas internas, `authMiddleware`, `tenantMiddleware` e
`requireRole('ADMIN', 'RECEPTIONIST')` — ver §11, P-3.

### 10.2 Contrato (OpenAPI)

```yaml
paths:
  /internal/contracts/{contract_id}/block-reservation:
    parameters:
      - name: contract_id
        in: path
        required: true
        schema: { type: string, format: uuid }
        description: Chave de idempotência — no máximo uma reserva-bloco por contrato e hotel.
    post:
      summary: Cria a reserva-bloco de um contrato assinado (idempotente por contract_id)
      security: [{ internalToken: [], bearerAuth: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [room_ids, check_in_date, check_out_date, total_amount, representative]
              properties:
                room_ids:       { type: array, minItems: 1, uniqueItems: true, items: { type: string, format: uuid } }
                check_in_date:  { type: string, format: date }
                check_out_date: { type: string, format: date }
                total_amount:   { type: string, pattern: '^\d+\.\d{2}$', description: DECIMAL como string — valor do contrato no b2b }
                representative:
                  type: object
                  description: Representante legal do cliente corporativo. O core é dono de guests e acha ou cria o hóspede por CPF, como faz hoje.
                  required: [full_name]
                  properties:
                    full_name: { type: string }
                    cpf:       { type: string, nullable: true }
                    phone:     { type: string, nullable: true }
                    email:     { type: string, nullable: true }
      responses:
        '201': { description: Reserva-bloco criada, content: { application/json: { schema: { $ref: '#/components/schemas/BlockReservation' } } } }
        '200': { description: Já existia para este contract_id, com os mesmos quartos e datas — devolve a existente (repetição segura) }
        '400': { description: Corpo inválido }
        '401': { description: X-Internal-Token ou JWT ausente ou inválido }
        '403': { description: Hotel suspenso ou papel sem permissão }
        '404': { description: Algum quarto não existe neste hotel — corpo lista os room_ids }
        '409': { description: Quarto indisponível no período (corpo lista os room_ids), ou contract_id já usado com quartos/datas diferentes }
    delete:
      summary: Cancela a reserva-bloco de um contrato (idempotente por contract_id)
      security: [{ internalToken: [], bearerAuth: [] }]
      responses:
        '200': { description: Cancelada agora, ou já estava cancelada — mesmo corpo nos dois casos }
        '204': { description: Não há reserva-bloco para este contrato neste hotel — nada a liberar }
        '401': { description: X-Internal-Token ou JWT ausente ou inválido }
        '403': { description: Hotel suspenso ou papel sem permissão }
        '409': { description: A reserva-bloco já está CHECKED_IN ou CHECKED_OUT — não pode ser cancelada }
components:
  securitySchemes:
    internalToken: { type: apiKey, in: header, name: X-Internal-Token }
    bearerAuth:    { type: http, scheme: bearer, bearerFormat: JWT }
  schemas:
    BlockReservation:
      type: object
      properties:
        reservation_id: { type: string, format: uuid }
        contract_id:    { type: string, format: uuid }
        room_ids:       { type: array, items: { type: string, format: uuid } }
        status:         { type: string, enum: [CONFIRMED, CANCELLED] }
```

**Regras que o contrato impõe à implementação (T-01.6):**

- **Idempotência:** o core guarda o `contract_id` na reserva-bloco — coluna nova
  `reservations.contract_id UUID NULL`, com índice único parcial em
  `(tenant_id, contract_id) WHERE contract_id IS NOT NULL AND deleted_at IS NULL`. Hoje a
  ligação existe só do lado do contrato (`contracts.reservation_id`), e a tabela `contracts`
  sai do core. Repetir o `POST` depois de uma falha no meio do caminho encontra a reserva pelo
  índice e devolve `200` (CA-01.6.f).
- **Disponibilidade verificada dentro da transação** que cria a reserva-bloco (CA-01.6.b).
  Hoje `SignContractController` verifica **antes** de abrir a transação.
- **Cancelamento respeita a máquina de estados, em *allowlist*:** só `PENDING` e `CONFIRMED`
  cancelam (regra do `CLAUDE.md`). Hoje `CancelContractController` cancela a reserva-bloco em
  qualquer status, até `CHECKED_IN` — ver §11, P-2.

### 10.3 Tempo limite, tentativas e resposta ao usuário (CA-01.2.d)

| Parâmetro | Valor | Motivo |
|---|---|---|
| *Timeout* por tentativa | **3 s** | A rota faz uma transação curta (até algumas dezenas de quartos). Acima disso o core está com problema, e o usuário está esperando na tela |
| Tentativas | **3 no total**, com espera de **250 ms** e **1 s** entre elas | Seguro repetir porque as duas rotas são idempotentes por `contract_id` |
| Repete em | erro de rede, *timeout*, `502`, `503`, `504` | Falhas de transporte ou de disponibilidade |
| **Não** repete em | qualquer `4xx`, e `500` | `409` de quarto ocupado não muda repetindo; `500` indica defeito, e repetir só multiplica o log |

**Ordem das escritas no `b2b-service`:** chama o core **primeiro**; só depois do `201`/`200`
grava o contrato como `SIGNED` (ou `CANCELLED`) no próprio banco. Se o `b2b` cair entre as
duas escritas, a próxima tentativa do usuário repete a chamada, o core devolve a reserva
existente (`200`) e o contrato fecha — sem segunda reserva-bloco.

**Resposta ao usuário quando o core não responde** (esgotadas as tentativas): o `b2b-service`
devolve **`503`** com `{ "error": "Não foi possível bloquear os quartos agora. O contrato não
foi assinado — tente novamente em alguns instantes." }` (no cancelamento: *"O contrato não foi
cancelado"*). O contrato **permanece no status anterior** (CA-01.6.e) — nunca fica assinado
sem quartos bloqueados, nem cancelado com quartos presos.

Um *timeout* em que o core chegou a confirmar não deixa estado errado: o contrato continua
`GENERATED` no `b2b`, e a próxima tentativa recebe `200` com a reserva já criada.

---

## 11. Pendências encontradas nesta pesquisa (fora do escopo desta etapa)

Registradas aqui porque apareceram ao ler o código para o contrato. Nenhuma foi corrigida
nesta branch — é documentação.

| # | Achado | Severidade | Evidência |
|---|---|---|---|
| **P-1** | **Quartos extras de uma reserva não são protegidos contra *double-booking*.** O `EXCLUDE USING gist` cobre só `reservations.room_id`, e `checkReservationConflict` consulta só essa coluna. Os quartos que ficam só em `reservation_rooms` — os `extra_room_ids` de `POST /reservations` (nem conferidos na criação) e os quartos 2..N de uma reserva-bloco B2B (conferidos na assinatura, mas gravados só no pivô) — ficam invisíveis para a **próxima** reserva, e podem ser vendidos avulsos no mesmo período. **Contradiz a invariante anti-*double-booking*** (SPEC-01 §4) e o motivo de existir da reserva-bloco | 🔴 | `db/schema.sql:132-135`, `app/utils/checkReservationConflict.js:20-25`, `CreateReservationController.js:45-52`, `SignContractController.js:73,97`. Confirmado por leitura, não reproduzido |
| **P-2** | `CancelContractController` cancela a reserva-bloco em **qualquer** status (`Model.update` sem conferir), inclusive `CHECKED_IN` | 🟡 | `CancelContractController.js:21-26` |
| **P-3** | `PUT /contracts/:id/sign` e `/cancel` não têm `requireRole` — qualquer papel autenticado, inclusive `WAITER`, assina e cancela contrato | 🟡 | `routes/apis/contractRouter.js:16,22-23` |
| **P-4** | A reserva com quartos extras cobra só o quarto principal: `total_amount = preço da categoria do quarto principal × noites` | 🟡 | `CreateReservationController.js:54-57` |
| **P-5** | Escritas em lote que o *outbox* da T-01.4 precisa cobrir **explicitamente** (um `Model.update` com `where` não dispara *hook* por linha): quartos extras no check-in e no check-out, e a reserva-bloco no cancelamento de contrato | 🟢 | `CheckInController.js:33`, `CheckOutController.js:33`, `CancelContractController.js:22` |

> **Estado em 10/10/2026 — etapa F da rodada 3 (branch `fix/reserva-multiquarto-contrato`):**
>
> - **P-1 resolvida** — `reservation_rooms` virou a fonte única de ocupação: todo quarto de toda
>   reserva tem linha nele (o principal entra pelo banco), com cópia do período e de "bloqueia o
>   quarto" mantida por **triggers**, e um `EXCLUDE` com o mesmo predicado do de `reservations`.
>   Detalhes em `docs/db/ARQ_DATABASE.md` §7.
> - **P-2 resolvida** — cancelar contrato só com a reserva-bloco em `PENDING`/`CONFIRMED`; em
>   `CHECKED_IN`/`CHECKED_OUT` → `409`. A reserva-bloco também não se cancela nem se altera pela
>   rota de reserva (só pelo contrato).
> - **P-3 resolvida** — `sign` e `cancel` exigem `ADMIN`. O `WAITER` já era barrado pela allowlist
>   global; a brecha real era o `RECEPTIONIST`.
> - **P-4 resolvida** — `calculateStayTotal`: soma de cada quarto, em centavos inteiros.
> - **P-5 continua para a T-01.4**, com um ajuste: o cancelamento de contrato agora grava a
>   reserva-bloco por `save()` (dispara hook); seguem em lote o status dos quartos extras no
>   check-in e no check-out. **Atenção para o *outbox*:** a sincronia do pivô acontece em
>   trigger, invisível a hooks do Sequelize — não afeta os eventos do catálogo (nenhum é de
>   `reservation_rooms`), mas quem precisar do conjunto de quartos de uma reserva deve lê-lo
>   depois do commit.

As decisões D-2 e D-3 (§9) também são defeitos atuais: afetam os indicadores de hoje, não só
os da projeção.

---

## Histórico

| Data | Versão | O quê |
|---|---|---|
| 30/09/2026 | 0.1 | Proposta inicial — agente executor, trilha do Gabriel (delegação `rodada2_gabriel_28set2026.md`, etapa C) |
| 04/10/2026 | 1.0 | **Aprovado pelo Gabriel.** Decisões D-1 a D-4 registradas na §9.1, com o critério de mercado. D-3 refinada em garantia × saldo. Regra de gravação do *outbox* depois da escrita de domínio (§6). Dinheiro sem `float` nas consultas sobre a projeção |
