# Documento 04 (MER): correções sugeridas para a v1.5 (22/11/2026)

**Dono:** Sirlande · **Base:** revisão de contradições de 19/11
(`docs/banca/CONTRADICOES_DOCUMENTACAO_19NOV2026.md`, PR #179), achados 🔴-4, 🟡-11 e 🟡-12
**Evidência de código:** `develop` em `859cb30` (20/11)
**Situação:** ⏳ texto pronto para aplicar no fork da UniFAAT. O documento oficial **não** foi alterado.

O fork não está clonado nesta máquina. Por isso o texto abaixo vem **por seção**, para colar no
lugar, e não como o documento inteiro. Conferir a numeração das seções na v1.4 oficial antes de
aplicar.

---

## 1. 🔴-4: FKs do B2B × banco por serviço (§4.13 a §4.17 e diagrama)

**Contradição.** A §7 e a ADR-003 dizem que, entre serviços, a referência é "guardada como
identificador, sem chave estrangeira". As §4.13 a §4.17 dão FKs do B2B para tabelas do core
(`tenant_id → tenants`, `reservation_id → reservations`), e o diagrama liga
`CONTRACTS |o--o| RESERVATIONS` com linha cheia.

**Por que as duas coisas são verdade hoje.** O B2B ainda mora no core até a T-01.6 (5º semestre).
O `db/schema.sql` tem as FKs: `corporate_clients` (l. 430), `event_quotes` (l. 457–458),
`quote_items` (l. 480–481), `contracts` (l. 493–498) e `contract_items` (l. 517–518). A ADR-003
descreve o alvo. Corrigir o texto, não a ADR (§6 da revisão: "A ADR-003 ... é o ponto mais forte
da documentação").

**Texto sugerido.** Acrescentar a nota abaixo no início da §4.13, citada nas §4.14 a §4.17:

> ⚠️ **Em transição até a T-01.6 (5º semestre).** As entidades B2B (§4.13 a §4.17) ainda estão no
> banco do `core-service`, e por isso as referências a `tenants` e `reservations` são chaves
> estrangeiras de verdade no `db/schema.sql`. Quando o `b2b-service` ganhar banco próprio (ADR-003),
> essas colunas passam a guardar **só o identificador, sem FK**, como a §7 define para toda
> referência entre serviços. A consistência passa a ser garantida pelos eventos do core
> (`tenant.*`, `reservation.*`), não pelo banco. As FKs **internas** do B2B (`contracts →
> corporate_clients`, `contract_items → contracts`, `quote_items → event_quotes`) continuam.

Nas linhas das tabelas de atributos, trocar:

| Coluna | Hoje | Sugerido |
|---|---|---|
| `tenant_id` (§4.13–4.17) | FK → tenants ON DELETE CASCADE | FK → tenants ON DELETE CASCADE ⚠️ *até a T-01.6; no alvo, identificador sem FK* |
| `contracts.reservation_id` | FK → reservations ON DELETE SET NULL | FK → reservations ON DELETE SET NULL ⚠️ *até a T-01.6; no alvo, identificador sem FK* |

No diagrama: `CONTRACTS |o..o| RESERVATIONS` (linha **tracejada**, que no Mermaid é `..`), com o
rótulo "em transição (T-01.6)". O mesmo para as setas de `tenants` para as entidades B2B, se o
diagrama as desenhar.

---

## 2. 🟡-12: `payments.amount` em duas camadas, e o CASCADE (§4.8)

**Contradição.** A §4.8 dá `CHECK (amount >= 0)`, o RF-014/RF-015 pede `amount > 0`, e
"ON DELETE CASCADE" convive com "pagamento nunca é apagado".

**Texto sugerido** para a linha do `amount`:

> `amount` NUMERIC(12,2), obrigatório. **Duas camadas:** o banco garante só o piso, `CHECK (amount
> >= 0)` (`db/schema.sql:218`), para nenhuma escrita direta gravar valor negativo. A regra de negócio
> fica na aplicação: `amount > 0` e até o teto (`app/utils/paymentAmount.js`,
> `isValidPaymentAmount`), com 400 e mensagem em português (RF-014/RF-015). Fica fora do banco porque
> o teto e a mensagem mudam com a regra, e uma migração de CHECK em produção custa mais do que
> mudar a validação.

**Texto sugerido** para o `reservation_id ... ON DELETE CASCADE`:

> O CASCADE só age se a linha da reserva for **removida fisicamente**, e isso não acontece em
> operação: reservas e pagamentos são excluídos por *soft delete* (`deleted_at`, *paranoid*), e o
> `DELETE /payments/:id` responde 405. Anular um pagamento é estorno (`status = 'VOIDED'` com
> motivo, autor e data, `payments_voided_has_trail`), nunca remoção. O CASCADE fica só para a
> remoção de um hotel inteiro (`tenant_id ... ON DELETE CASCADE`), em que o histórico vai junto
> por definição.

---

## 3. 🟡-11: dicionário das projeções do analytics (§7.1, D-003)

**Contradição.** A D-003 cita as projeções do `analytics-service`, mas o documento não as
descreve.

**Texto sugerido**, logo depois da D-003:

> **Projeções do `analytics-service`** (banco próprio, alimentado pelos eventos do core pelo
> RabbitMQ; catálogo de eventos v1.1). Todas têm as mesmas colunas de controle:
> `id` (o mesmo UUID do registro no core), `tenant_id` (do envelope do evento; toda consulta filtra
> por ele), `aggregate_version` (último evento aplicado: um evento com versão menor ou igual é
> descartado) e `deleted_at` (marca do `*.deleted`, sem remoção física). **Não há FK entre
> projeções**: os eventos de agregados diferentes chegam em qualquer ordem, e a FK recusaria uma
> ordem legítima (`app/Models/defineProjection.js`).
>
> | Tabela | Colunas próprias | Para que serve |
> |---|---|---|
> | `proj_tenants` | `status` | Hotéis ativos |
> | `proj_room_categories` | `name` | Nome da categoria nos indicadores |
> | `proj_rooms` | `category_id`, `number`, `status`, `cleaning_since` | Ocupação e quartos em limpeza |
> | `proj_guests` | `full_name` | Nome no painel. **Sem CPF, e-mail ou telefone** (minimização, LGPD) |
> | `proj_reservations` | `guest_id`, `room_id`, `status`, `check_in_date`, `check_out_date`, `total_amount`, `created_at` | Ocupação, diária média, RevPAR, chegadas e saídas |
> | `proj_payments` | `reservation_id`, `amount`, `method`, `status`, `paid_at` | Recebido no dia e meios de pagamento |
>
> O idempotente da entrega fica em `processed_events` (o mesmo evento entregue duas vezes é
> aplicado uma vez).

Conferir os nomes contra `services/analytics-service/app/Models/*Projection.js` na hora de aplicar.

---

## 4. 🟡: tabela única de regras de negócio

**Contradição.** As RNs estão espalhadas pelas seções (RN-003 na §4.6, RN-005 a RN-008 nas
contas e itens). A banca não acha onde cada uma é garantida.

**Texto sugerido:** uma seção "Regras de negócio no banco", com uma linha por RN:

| RN | Regra | Onde o banco garante | Onde a aplicação garante |
|---|---|---|---|
| RN-003 | Anti-*double-booking*: um quarto, uma reserva ativa por noite | `EXCLUDE USING gist` em `reservations` (status ≠ CANCELLED) | `checkReservationConflict` (409) |
| RN-005 | Rateio da diária na conta dividida: uma só conta carrega a diária | `accounts_lodging_unique`: único em `(reservation_id, room_id)` onde `charges_lodging` | Controllers de conta (409) |
| RN-006 | Conta interna nunca é receita | Trigger `payments_account_consistency` recusa pagamento em conta `INTERNAL`; `accounts_no_guest_table_internal` (sem hóspede) | Fechamento com total 0 (CA-04.3.f) |
| RN-007 | Cortesia é registrada, não apagada (`billable = false` com motivo) | `account_items_reason_required` e `account_items_reason_allowlist` | `CreateAccountItemController` |
| RN-008 | Idempotência do lançamento offline | `account_items_client_item_tenant_unique` | Reenvio devolve 200 com o item original |

RN-001, RN-002 e RN-004 não estão na cópia de setembro (v1.2 sugerida): completar com o texto da
v1.4 oficial. Conferir o nome de cada constraint no `db/schema.sql` antes de aplicar.

---

## O que não mudar

- A ADR-003 e o recorte por consistência transacional.
- A numeração de RN/RF/RNF. Acrescentar sempre com o próximo número livre.
- A legenda ✅ / 🔷 / ⚠️, aceita pelo professor no PR #3. Este texto só usa o ⚠️ que já existe.
