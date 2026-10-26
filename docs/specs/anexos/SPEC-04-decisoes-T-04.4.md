# SPEC-04 · Anexo — Decisões da T-04.4 (`Payment` ↔ `Account`)

**Responsável:** Sirlande (orquestrando Claude Code) · **Data:** 19/10/2026
**Estado da tarefa:** ✅ concluída — decisões aprovadas pelo Sirlande; qa-redteam APROVADO COM RESSALVAS na 3ª rodada (ressalvas corrigidas antes do merge)
**Fonte:** relatório `docs/historico_sessao/sirlande/t044_pagamento_conta_19out2026.md`
**Continua:** `SPEC-04-decisoes-T-04.3.md` (D-33 a D-41). A numeração segue daqui.
**Segue em:** `SPEC-04-decisoes-repasses-gabriel.md` (D-51 a D-53, aval ao PR #101).

> A SPEC-04 diz o que entregar (CA-04.4.a–e). Aqui ficam as escolhas que ela não fixava e **por quê**.
> D-42 a D-44 foram aprovadas no plano. D-45 e D-46 vieram dos 🟡-1 e 🟡-2 da 1ª auditoria, aprovadas pelo Sirlande. D-47 a D-50 são decisões de implementação.

---

## 1. O que foi produzido

| Entrega | CAs | Onde |
|---|---|---|
| `payments.account_id`; `reservation_id` passa a aceitar nulo | a | `PaymentModel.js`, `db/schema.sql`, `database/applyDbConstraints.js` |
| `CHECK (reservation_id IS NOT NULL OR account_id IS NOT NULL)` e trigger de coerência | b | `applyPaymentAccountConstraints` |
| `POST /payments` com `account_id`; criar, alterar e excluir pagamento acertam as contas | a, c | `PaymentApi/*` |
| `payments_made` real no bill da conta e acerto `CLOSED ↔ PAID` | c | `app/utils/accountPayments.js`, `accountBill.js` (`settleAccount`, `settlePaymentAccount`) |
| O que a conta cobra (diária + consumo) num módulo só | — | `app/utils/accountCharges.js` (`lodgingShare` saiu de `accountBill.js`) |
| Webhook PIX acerta as contas do pagamento confirmado | d | `WebhookApi/PixWebhookController.js` |
| `migrate` acerta `CLOSED ↔ PAID` das contas existentes | — | `database/closeEndedStayAccounts.js` |
| Bill da reserva cancelada sem diária | — (🟡-2) | `ReservationApi/GetBillController.js` |
| `fromCents` com valor negativo | — (ponto em aberto 1 da T-04.3) | `app/utils/calculateStayTotal.js` |
| Swagger de `/payments` e do bill da conta | — | `config/swagger.js` |

Testes: `tests/account-payments.test.js` (novo). `tests/public-booking.test.js` passa sem alteração (CA-04.4.d). Um teste existente mudou: em `tests/account-bill.test.js` (CA-04.3.a), `payments_made` passou de `'0.00'` para `'100.00'`. Ele codificava a D-34, substituída pela D-42.

---

## 2. Decisões

### D-42 — Pagamento da reserva sem conta é crédito das contas dela (substitui a D-34)
- **O problema:** o sinal PIX e o pagamento atual da recepção são feitos na reserva, sem conta. Se não entrarem em conta nenhuma, o bill da conta de diária mostra a diária inteira em aberto com o sinal já pago, e quem confia nele cobra o sinal duas vezes.
- **Decisão:** esse pagamento é **crédito da reserva** e entra no `payments_made` das contas dela, pela ordem da D-45. A **conta titular** é a conta de diária mais antiga, por `(opened_at, id)`.
- **Alternativa descartada:** contar só os pagamentos com `account_id`. O bill da conta mentiria sobre o sinal.
- **Justificativa:** é o que um PMS de mercado faz com o depósito antecipado: ele vai para o folio principal. "Mais antiga" não muda com troca de quarto, então o crédito não pula de conta.

### D-43 — Quando a conta vira `PAID`
- **Decisão:**
  - Só `CLOSED → PAID`, e só quando a conta tem pagamento e o saldo fica ≤ 0.
  - `PAID → CLOSED` se o saldo voltar a ficar positivo: pagamento excluído, reduzido, ou crédito rateado de outro jeito.
  - Conta `OPEN` paga por inteiro continua `OPEN` e sai do fechamento já `PAID`.
  - Conta com total 0 só vira `PAID` com pagamento direto dela. A sobra do crédito da reserva não basta, porque pode sair dela quando outra conta passa a ter total, sem nenhum acerto (🟢-1 da 3ª auditoria). Sem pagamento direto, ela fica `CLOSED`, mesmo com saldo negativo.
- **Leitura do CA-04.4.c:** "pagamento total → PAID" vale para conta fechada; "parcial → segue OPEN" para conta aberta.
- **Justificativa:** conta aberta ainda recebe item, e a conta de diária nem fecha durante a estadia (D-41).
- **Onde:** `settleAccount`, chamada no fechamento (`closeAccount`), em todo pagamento (`settlePaymentAccount`) e no `migrate`.

### D-44 — Pagamento a maior e contas que não recebem pagamento
- **Decisão:**
  - Pagamento a maior é aceito, e o saldo fica negativo: o hotel deve devolver.
  - Conta `PAID` e conta `INTERNAL` não recebem pagamento por `account_id` (422).
  - O banco também recusa pagamento de conta `INTERNAL` (trigger, D-47).
- **Justificativa:**
  - Bloquear o pagamento a maior não funciona em conta aberta, porque o saldo ainda muda. E a reserva cancelada com sinal pago já gera saldo negativo (D-35).
  - Conta `INTERNAL` nunca é receita (RN-006).
- **Limite:** pelo `reservation_id`, o contrato antigo não muda. O pagamento é aceito mesmo com todas as contas `PAID` e entra como sobra (D-45).

### D-45 — Ordem do crédito da reserva entre as contas (🟡-1)
- **O problema (1ª auditoria):** com todo o crédito na titular, pagar a reserva inteira deixava a titular com saldo negativo e as outras contas devendo para sempre. Isso acontecia mesmo no caso mais comum, um quarto mais uma conta de bar.
- **Decisão:** o crédito preenche as contas nesta ordem, cada uma até o que ela deve depois dos pagamentos diretos dela:
  1. as fechadas (`CLOSED`, `PAID`), na ordem em que fecharam, por `(closed_at, id)`;
  2. as abertas, com a titular primeiro e as outras por `(opened_at, id)`.

  A sobra (pagamento a maior) fica na **primeira** conta da ordem com total > 0; sem nenhuma, na primeira. Todo pagamento com reserva acerta **todas** as contas dela.
- **Por que as fechadas primeiro:** o total delas não muda mais (D-23, D-39). Lançar item ou mudar as datas só mexe nas abertas, que vêm depois. Com isso, o que cabe a uma conta fechada só muda com pagamento, e todo pagamento acerta as contas. Uma conta que fecha entra no fim das fechadas, então as que fecharam antes não perdem nada.
- **Por que a sobra na primeira:**
  - A primeira não muda quando outra conta abre ou fecha, porque conta nova entra depois.
  - Na última, a sobra pulava para cada conta aberta em seguida e deixava `PAID` uma conta de total 0 que já não tinha pagamento nenhum (🟢-1 da 2ª auditoria).
  - Conta de total 0 não recebe a sobra enquanto houver outra com total.
- **A ordem das fechadas usa o relógio do banco** (`clock_timestamp()` no `closed_at`). Com várias réplicas, o relógio da aplicação poderia inverter a ordem.
- **Custo:** o total e o pago de todas as contas da reserva são calculados uma vez por acerto (`reservationLedger`), não uma vez por conta.
- **Alternativa descartada:** recusar com 422 o pagamento pela reserva quando a titular já está paga. Quebrava o fluxo atual da recepção, que paga pela reserva.

### D-46 — Bill da reserva cancelada não cobra diária (🟡-2)
- **O problema:** a conta da reserva cancelada não cobra diária (D-35), mas `GET /reservations/:id/bill` somava o `total_amount`. Com sinal pago, a conta mandava devolver e o bill da reserva mandava cobrar a estadia.
- **Decisão:** `room_total` é 0 na reserva `CANCELLED`. O formato da resposta não muda.
- **Justificativa:** multa de cancelamento não existe na SPEC. As duas telas passam a dizer a mesma coisa. Nenhum teste anterior cobria o bill de reserva cancelada.

### D-47 — Coerência pagamento × conta no banco: trigger, não FK composta
- **Decisão:**
  - Com `account_id`, o servidor preenche `reservation_id` a partir da conta. Se o cliente mandar outra reserva, recebe 422.
  - No banco, o trigger `payments_account_consistency` exige a reserva e o tenant da conta e recusa conta `INTERNAL`.
- **Alternativa descartada:** a FK `(account_id, reservation_id) → accounts(id, reservation_id)`.
  - Ela precisava de um `UNIQUE (id, reservation_id)` total em `accounts`, e o guarda `tests/db-constraints.test.js` proíbe índice único total em tabela com soft delete.
  - Com `MATCH SIMPLE`, ela também não pegava a reserva nula na conta da suíte.

### D-48 — Ordem de trava: reserva → contas (🟡-3)
- **O problema:** o `POST /payments` com conta travava a conta e, no INSERT, a FK pegava `KEY SHARE` na reserva. O check-out, o cancelamento, a exclusão e o webhook travam na ordem inversa, reserva → conta. O resultado era `deadlock detected` e 500. O teste reproduziu nas 3 rodadas.
- **Decisão:** todo caminho que paga ou fecha conta trava a reserva antes das contas, mesmo se a reserva estiver excluída (`paranoid: false`), e as contas em ordem de id, como em `closeReservationAccounts`. O helper é `lockAccount` (`accountBill.js`), usado no `POST /payments` com conta e no `PUT /accounts/:id/close`. O `POST` só com reserva trava a reserva antes do INSERT.
- **Por que o fechamento também trava (🔴-1 da 2ª auditoria):** o crédito da reserva depende das outras contas dela. Dois fechamentos em paralelo liam, cada um, a outra conta ainda aberta, e ficavam os dois com o mesmo crédito: uma conta saía `PAID` devendo. O teste reproduziu em todas as rodadas.
- **Deadlock entre dois pagamentos pela reserva (🟡-1 da 2ª auditoria):** o INSERT pegava `KEY SHARE` na reserva e o acerto pedia `FOR UPDATE` na mesma reserva. Cada transação esperava a outra subir a trava.

### D-49 — `amount` positivo, com até 2 casas (🟡-4)
- **Decisão:** o `POST` e o `PUT /payments` devolvem 400 para valor negativo, zero, com 3 casas, não numérico ou acima do teto da coluna `NUMERIC(12,2)` (`app/utils/paymentAmount.js`).
- **No banco:** `CHECK payments_amount_check (amount >= 0) NOT VALID`.
  - O `schema.sql` já tinha esse CHECK; o banco criado pelo sync não tinha.
  - `NOT VALID` vale para o que entra daqui em diante, sem travar o `migrate` por uma linha antiga.
  - O banco aceita 0, porque o sinal PIX de um hotel com `deposit_percent` 0 vale 0; só a API recusa 0 no pagamento manual.
  - A soma dos pagamentos é feita com sinal no banco: um pagamento negativo anterior ao CHECK entra como negativo, e não como 0.

### D-50 — O `migrate` acerta `CLOSED ↔ PAID`
- **Decisão:** um passo 3 em `closeEndedStayAccounts` passa por:
  - as contas `PAID`;
  - as `CLOSED` que têm algum pagamento `PAID` que possa ser delas.

  É idempotente.
- **Por quê:**
  - Antes da T-04.4, nada passava conta para `PAID`.
  - Um pod antigo, no rolling update, pode excluir o pagamento que quitava uma conta (🟢-1).
  - Um pagamento feito durante a migração do consumo antigo pula o acerto (🟢-2). O `POST` pela reserva não ganhou 503, para não mudar o contrato.

---

## 3. Efeito sobre pendências herdadas

| Pendência | Origem | Situação |
|---|---|---|
| `fromCents` não formata negativo | T-04.3 §4, ponto 1 | ✅ corrigido |
| `payments_made` real e `CLOSED → PAID` | T-04.3 §4, ponto 2 | ✅ D-42 a D-45 |
| D-34 (`payments_made` = 0) | T-04.3 | 🔁 substituída pela D-42 |
| Deploy: `migrate` antes e depois do rollout | T-04.2, T-04.3 | Continua. O `migrate` agora também acerta `CLOSED ↔ PAID` (D-50) |

---

## 4. Pontos em aberto

| # | Ponto | Quando |
|---|---|---|
| 1 | O `api-client` do frontend (`schema.d.ts`) não foi regenerado: faltam `account_id` e as rotas de `/accounts` desde a T-04.1 | Dono do frontend, antes da SPEC-05 Fase 2 |
| 2 | O catálogo de eventos diz que `payment.reservation_id` é UUID; agora pode vir nulo (pagamento de day-use, mesa e balcão). O payload não mudou | Gabriel (repasse em `docs/qa/repasses/para_gabriel_19102026.md`) |
| 3 | `DELETE` e `PUT /payments` sem restrição de papel e sem `deleted_by` | Repasse em `docs/qa/repasses/para_indefinido_19102026.md`; correção de fundo é o estorno da SPEC-06 |
| 4 | Estorno ou chargeback depois de `PAID` não é tratado pelo webhook | Gabriel (mesmo repasse) |
| 5 | **T-04.5:** o bill da reserva passa a somar as contas. Com a D-46, a reserva cancelada já bate com as contas. O teste `expectAccountsMatchReservation` serve de base | T-04.5 |
| 6 | **T-04.6:** o check-in que cria contas define a titular (a primeira conta de diária criada) | T-04.6 |

---

## 5. Auditoria

| Rodada | Relatório | Veredito | Resultado |
|---|---|---|---|
| 1ª | `docs/qa/redteam_t044-payment-account_19out2026.md` | APROVADO COM RESSALVAS | 🟡-1 → D-45; 🟡-2 → D-46; 🟡-3 → D-48; 🟡-4 → D-49; 🟢-1 e 🟢-2 → D-50; 🟢-3 → UUID e caixa; 🟢-4 → trigger (D-47); 🟢-5 → este anexo e ponto 1; 🟢-6 → testes novos |
| 2ª (delta) | `docs/qa/redteam_t044-payment-account_delta_19out2026.md` | REPROVADO (🔴-1) | 🔴-1 e 🟡-1 → D-48 ampliada (`lockAccount`, trava no fechamento e no `POST` pela reserva); 🟢-1 → sobra na primeira com total (D-45); 🟢-2 → relógio do banco; 🟢-3 → `reservationLedger`; 🟢-4 → soma com sinal; 🟢-5 → teto do valor (D-49); 🟢-6 → testes de concorrência e ordem determinística |
| 3ª (delta) | `docs/qa/redteam_t044-payment-account_delta2_19out2026.md` | APROVADO COM RESSALVAS | Correções da 2ª confirmadas sem falso verde (cada uma desfeita faz o teste falhar). 🟡-1 → trava da reserva com `paranoid: false` (reserva excluída deixava a trava vazia e dava deadlock); 🟢-1 → conta de total 0 só vira `PAID` com pagamento direto (D-43); 🟢-2 → o total do bill vem das partes já lidas |
