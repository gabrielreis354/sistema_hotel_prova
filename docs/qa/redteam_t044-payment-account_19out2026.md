# QA Red Team — T-04.4 Payment ↔ Account
**Branch:** feature/t044-payment-account · **Dev:** Sirlande · **Base:** develop@ee5a685 · **HEAD:** a5a6596 · **Data:** 19/10/2026
**Arquivos auditados:** 17 do diff, mais o contexto: `CheckOut`, `CancelReservation`, `DeleteReservation`, `GetBill`, `CreateAccountItem`, `CloseAccount`, `DeleteAccountItem`, `CreateConsumption`, `migrateConsumptions`, `command.js`, `roles.js`, `paymentRouter.js`, o catálogo de eventos e `frontend/packages/api-client`
**Achados no escopo:** 10 (🔴 0 · 🟡 4 · 🟢 6) · **Repassados:** 3

## Veredito
**APROVADO COM RESSALVAS**

Não há 🔴 no escopo. O código cumpre as decisões aprovadas em 19/10. Suíte completa verde: 39 arquivos, `account-payments.test.js` com 36 testes, `public-booking` incluído (CA-04.4.d e e).

Antes do merge, porém, peço atenção a dois pontos:
- **🟡-1 e 🟡-2:** as decisões aprovadas, combinadas, fazem o bill da conta dizer **"o hotel deve devolver"** quando ninguém deve nada a ninguém. Hoje está latente, porque nenhuma tela do frontend consome `/accounts/:id/bill`, mas vira dinheiro devolvido por engano no dia em que a tela da comanda existir.
- **🟡-3:** um deadlock novo, reproduzido.

Método: li o diff inteiro e os controllers vizinhos. Executei um teste temporário contra o banco de teste (`tests/zz_redteam_tmp.test.js`, **já apagado**, e a árvore está limpa). Os números abaixo saíram dele.

---

## Achados no escopo

### 🟡-1 [Dinheiro · regra] Pagamento da reserva concentrado na titular: falsa "devolução" numa conta e saldo devedor eterno na outra
**Onde:** `app/utils/accountPayments.js:35-51` (todo pagamento sem conta vai para a titular) e `app/Controllers/PaymentApi/CreatePaymentController.js:72-81` (no ramo `reservation_id`, a conta PAID não é checada).

**Cenário (reproduzido):** reserva com 2 quartos, Standard 200 e Luxo 300, e duas contas de diária (A titular, B). A recepção usa o fluxo de sempre: lê `balance_due` = 500 no `GET /reservations/:id/bill`, faz `POST /payments {reservation_id, amount: 500}` e o check-out.
```
A  PAID    total 200.00  payments_made 500.00  balance -300.00   ← "hotel deve devolver 300"
B  CLOSED  total 300.00  payments_made   0.00  balance  300.00   ← "hóspede deve 300", para sempre
reserva    balance_due 0, fully_paid true
POST /payments {reservation_id, amount: 1}  → 201; A vai a -301.00  ← PAID recebe pagamento
```
- O mesmo vale para **um quarto só com uma conta de bar sem diária** (`charges_lodging: false`), que é o caso mais comum. Pago pelo fluxo da reserva, o bar fica CLOSED com saldo e a titular fica negativa.
- A soma bate (−300 + 300 = 0), por isso o teste-invariante passa. O que fica errado é **o status e o saldo de cada conta**, que são justamente o que a comanda vai mostrar.
- Pela D-44 do Swagger, saldo negativo significa "o hotel deve devolver". A recepção que seguir o bill da conta A devolve 300 ao hóspede e cobra outros 300 pela conta B.
- Há ainda uma divergência com a decisão 3 ("conta PAID não recebe pagamento"): ela só vale com `account_id`. Pelo `reservation_id`, a titular PAID recebe pagamento sem 422.

**Regra violada:** a decisão 1 combinada com a decisão 3 produz um sinal de reembolso falso. A combinação não foi decidida; cada decisão isolada está implementada corretamente.

**Correção sugerida (decisão nova, D-4x):** escolher uma das duas.
- **(a) Transbordo:** no acerto, o pagamento sem conta preenche a titular até o total dela, e a sobra vai para as outras contas não-INTERNAL da reserva em `(opened_at, id)`. Só o que sobrar depois de todas fica negativo, na titular. `paymentsMadeCents` passa a calcular por reserva, e `settlePaymentAccount` acerta **todas** as contas da reserva, não só a titular.
- **(b) Recusa:** 422 em `POST {reservation_id}` quando a titular está PAID e outra conta da reserva ainda deve, com mensagem do tipo "pague a conta X por account_id".

Nos dois casos, cobrir com teste o cenário acima e o do bar.

### 🟡-2 [Dinheiro · regra] Reserva cancelada com sinal: a conta diz "devolver 70" e a reserva diz "deve 330"
**Onde:** `app/utils/accountBill.js:53` (`lodgingShare` dá 0 para CANCELLED, D-35) contra `app/Controllers/ReservationApi/GetBillController.js:40` (`roomTotal = total_amount`, também na cancelada).

**Cenário (reproduzido):**
1. Reserva PENDING de 400.
2. Consumo pela rota antiga, `POST /reservations/:id/consumptions` de 30: a rota cria a conta de diária antes do check-in (D-28).
3. Sinal PAID de 100 pela reserva.
4. `PUT /cancel`.

```
conta   PAID  room_charges 0.00  consumptions 30.00  payments_made 100.00  balance -70.00
reserva grand_total 430  total_paid 100  balance_due 330  fully_paid false
```
- Antes desta branch a divergência já existia (D-35 × GetBill), mas era invisível, porque `payments_made` era sempre 0.
- Agora as duas telas dão ordens opostas para o mesmo hóspede: uma manda devolver 70, a outra manda cobrar 330.

**Regra violada:** o invariante "soma das contas = `balance_due`" que esta branch testa. Ele não vale na reserva cancelada, nem na excluída (essa dá 404 no bill).

**Correção sugerida:**
- Decidir qual das duas está certa. Pela D-35, é a conta: a cancelada não cobra diária, e a multa de no-show está fora da SPEC.
- Corrigir o `GetBillController` para usar 0 na CANCELLED, ou adiantar essa parte da T-04.5 (o bill da reserva passa a ser a soma das contas).
- Acrescentar a cancelada ao `expectAccountsMatchReservation`.

### 🟡-3 [Concorrência] Deadlock: `POST /payments` com `account_id` × check-out, cancelamento, exclusão, webhook PIX e `PUT /reservations`
**Onde:**
- `CreatePaymentController.js:37-41`: trava a **conta** (`FOR UPDATE`).
- Depois, `:69`: o `PaymentModel.create` insere com FK para `reservations`, e o Postgres pega `FOR KEY SHARE` na **reserva**.
- Do outro lado, check-out, cancelamento, `DeleteReservation`, `CancelContract` e o webhook travam a **reserva** com `FOR UPDATE`, que conflita com `KEY SHARE`, e depois a **conta**:
  - check-out, cancelamento, exclusão e `CancelContract` pelo `closeReservationAccounts.js:30-35`;
  - o webhook pelo `settlePaymentAccount`, desde esta branch.

Ordem cruzada: conta → reserva contra reserva → conta.

**Cenário (reproduzido):** transação A trava a reserva. Em seguida chega `POST /payments {account_id}` da conta da suíte, e A pede a conta. O Postgres responde `deadlock detected` ("waits for ShareLock on transaction…"), e o POST devolve **500 "Erro ao registrar pagamento."**.
- Na prática: duas recepcionistas, uma fazendo o check-out e outra recebendo a conta do quarto, ou o sinal PIX confirmando enquanto a recepção paga a conta.
- Nada fica inconsistente, porque a vítima faz rollback. Mas o 500 cai justamente no momento do pagamento, e o comentário do `closeReservationAccounts` ("sem ordem cruzada, sem deadlock") deixou de ser verdade.

**Regra violada:** a ordem de travas documentada (reserva → contas).

**Correção sugerida:**
1. No ramo `account_id`, ler a conta **sem** trava. O `reservation_id` da conta não muda.
2. Se houver reserva, travar a reserva primeiro, com `ReservationModel.findOne({ lock: UPDATE })` ou `FOR KEY SHARE` via `lock: transaction.LOCK.KEY_SHARE`.
3. Só então travar a conta e revalidar status e tipo.

Acrescentar um teste de concorrência como o desta auditoria: transação manual que trava a reserva → POST em paralelo → trava a conta → nenhum dos dois falha.

### 🟡-4 [Dinheiro · validação] `amount` negativo ou zero é aceito, e soma negativa vira 0 no saldo da conta
**Onde:**
- `CreatePaymentController.js:25`: só testa `!amount`. `"-50"` e `"0.00"` são strings truthy.
- `UpdatePaymentController.js:27-28`: não valida nada.
- `PaymentModel.js`: `amount` sem `validate`.
- `applyDbConstraints`: não tem o `CHECK (amount >= 0)`, que só existe em `db/schema.sql:208`. O banco criado por `sync` + `migrate` aceita negativo.
- `accountPayments.js:51`: `toCents("-50.00")` devolve **0**.

**Cenário (reproduzido):** `POST /payments {account_id, amount: "-50"}` → **201**. Esse pagamento negativo funciona como um estorno sem trilha, que tira uma conta de PAID. Outros dois efeitos:
- Uma conta cuja soma de pagamentos fique negativa mostra `payments_made` 0.00, enquanto o `GetBill` da reserva soma −50. A soma das contas e o `balance_due` divergem.
- O ambiente com `schema.sql` (CHECK presente) responde **500** para o mesmo pedido. São dois contratos diferentes conforme o banco foi provisionado.

O defeito vem de antes desta branch, mas os controllers foram reescritos aqui, e é a partir daqui que `amount` decide o status da conta.

**Regra violada:** "dinheiro do cliente sem validação" (CLAUDE.md §7) e CHECKs iguais em `schema.sql` e `applyDbConstraints`.

**Correção sugerida:**
- POST e PUT validam `amount` com `parsePrice` + `TWO_DECIMALS` (`productValidation.js`), > 0 e ≤ teto, e respondem 400.
- Acrescentar `payments_amount_non_negative` (ou `> 0`) em `applyPaymentAccountConstraints`.
- Fazer a soma em `paymentsMadeCents` com sinal, ou garantir pelo CHECK que ela nunca fica negativa.

### 🟢-1 [Migrate] O passo 3 só promove (CLOSED → PAID), nunca rebaixa um PAID obsoleto
**Onde:** `database/closeEndedStayAccounts.js:65` (`WHERE a.status = 'CLOSED' … AND EXISTS (pagamento PAID)`).

**Cenário:**
- Durante o rolling update, um pod antigo (código da T-04.3, sem `settleAccount`) exclui ou reduz o pagamento que quitava uma conta que um pod novo já tinha marcado PAID.
- O `migrate` seguinte não olha contas PAID, e ela fica PAID com saldo positivo até alguém mexer num pagamento dela.

**Correção sugerida:** incluir `a.status = 'PAID'` sem o filtro EXISTS. O `settleAccount` já decide nos dois sentidos.

### 🟢-2 [Consistência] 503 só no ramo `account_id`
**Onde:** `CreatePaymentController.js:52-54` contra o ramo `reservation_id` (`:72-81`).

**Cenário:** reserva com consumo antigo não migrado (D-31).
- `POST {account_id}` → 503.
- `POST {reservation_id}` da mesma reserva → 201, e o acerto é pulado em silêncio (`accountBill.js:164`).

Sem dinheiro errado, porque o bill responde 503. Mas o comportamento é assimétrico e não está documentado.

**Correção sugerida:** registrar como decisão, ou aplicar o mesmo 503 aos dois ramos.

### 🟢-3 [Contrato] Comparação de UUID sensível a maiúsculas
**Onde:** `CreatePaymentController.js:49`.

**Cenário:** `{account_id, reservation_id: "<mesmo UUID em MAIÚSCULAS>"}` → 422 "não é a reserva desta conta". O `CreateAccountItemController` já normaliza com `toLowerCase()`.

Também vem de antes: `reservation_id` não-UUID sem `account_id` dá 500 (cast inválido), em vez de 404.

**Correção sugerida:** `String(reservation_id).toLowerCase()` e `isUuid` também no `reservation_id`.

### 🟢-4 [Banco] O trigger aceita pagamento em conta INTERNAL
**Onde:** `applyDbConstraints.js` (`payments_account_consistency`). O teste `account-payments.test.js:311-318` grava um desses direto no banco.

**Cenário:** a RN-006 (INTERNAL nunca é receita) só é barrada no controller. O `accountAmounts` zera o efeito, mas o `GetRevenueController` e o `GetPaymentMix` somam `payments` direto, e esse pagamento entra na receita.

**Correção sugerida:** no trigger, `IF conta.type = 'INTERNAL' THEN RAISE …`.

### 🟢-5 [Documentação · contrato] Decisões D-42 a D-44 e cliente tipado
**Onde:**
- `config/swagger.js:139-140` e o POST `/payments` citam D-42, D-43 e D-44, e `tests/account-payments.test.js:3` cita `SPEC-04-decisoes-T-04.4.md`. O anexo não existe na branch.
- `frontend/packages/api-client/src/schema.d.ts` não tem `account_id` nem `payments_made`. Nem os endpoints `/accounts` da T-04.1 a T-04.3 foram regenerados, e nenhum CI confere o desvio.

**Correção sugerida:**
- Criar o anexo de decisões da T-04.4, incluindo o que sair de 🟡-1, 🟡-2 e 🟢-2.
- Rodar `pnpm --filter api-client generate` antes da tela da comanda.

### 🟢-6 [Testes] Cenários que faltam
Os testes passam e matam os mutantes óbvios, mas não cobrem:
- reserva cancelada com sinal (🟡-2);
- pagamento da reserva com mais de uma conta, de diária ou de bar, e o transbordo (🟡-1);
- `POST {reservation_id}` com a titular PAID;
- concorrência (🟡-3);
- `PUT /payments` num pagamento **da reserva** (só há PUT de pagamento com conta);
- `amount` negativo e zero (🟡-4);
- webhook confirmando o sinal de uma reserva PENDING que já tem conta de diária, criada pela rota antiga: o teste do webhook só cobre o caso depois do check-out.

O helper `expectAccountsMatchReservation` também dá falso verde no 🟡-1: a soma bate, e os status individuais estão errados.

---

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | `DELETE` e `PUT /payments` sem `requireRole('ADMIN')`: a recepção apaga um pagamento e reabre a conta, sem trilha (`deleted_by`) | `routes/apis/paymentRouter.js:17-18` | DONO INDEFINIDO | `docs/qa/repasses/para_indefinido_19102026.md` |
| 🟢 | O catálogo de eventos diz `reservation_id: UUID` no `payment.*`, mas agora pode ser `null` (pagamento de day-use, mesa ou balcão) | `docs/specs/anexos/SPEC-01-catalogo-eventos.md:186` | Gabriel | `docs/qa/repasses/para_gabriel_19102026.md` |
| 🟢 | O webhook ignora estorno ou chargeback depois de PAID ("already_processed"), então a conta continua PAID com o dinheiro devolvido | `PixWebhookController.js:70` | Gabriel | `docs/qa/repasses/para_gabriel_19102026.md` |

## O que foi verificado e está correto
- **Tenant em toda query nova:**
  - `titularAccountId` e `paymentsMadeCents` (SQL cru) filtram `tenant_id`;
  - `settlePaymentAccount` usa o tenant do pagamento;
  - a conta de outro tenant dá 404 (testado);
  - o passo 3 do migrate casa `p.tenant_id = a.tenant_id`;
  - o trigger confere o tenant.
- **Garçom:** não alcança `/payments`, porque está fora da allowlist em `roles.js`.
- **Caminhos que mudam o total ou o pagamento de conta fechada:** item, exclusão de item, consumo antigo e exclusão de consumo antigo recusam conta não-OPEN. `closed_room_charges` é imutável depois de gravado, e o guard bloqueia datas e quartos em CHECKED_OUT/CANCELLED. Não achei caminho de runtime que mude o total de uma conta CLOSED ou PAID sem acerto. Os únicos casos de PAID obsoleto são 🟡-4 e 🟢-1.
- **Pagamento e conta sempre acertados na mesma transação:** create, update, delete, webhook (`settlePaymentAccount`), fechamento manual, check-out, cancelamento, exclusão e cancelamento de contrato (`closeAccount` → `settleAccount`).
- **Concorrência sem deadlock (só o 🟡-3 tem):**
  - Webhook × check-out: o check-out lê o pagamento ainda PENDING e fecha CLOSED; o webhook espera a reserva e depois acerta para PAID.
  - POST `{reservation_id}` × check-out: o insert espera a reserva.
  - DELETE × check-out: o DELETE espera a conta e relê o status.
- **Decisões:** titular = conta de diária mais antiga em `(opened_at, id)`, sem as excluídas. INTERNAL nunca é titular (CHECK `charges_lodging_room_only`). OPEN paga continua OPEN; total 0 sem pagamento continua CLOSED; pagamento a maior fica negativo; PAID e INTERNAL dão 422 com `account_id`; `reservation_id` divergente dá 422.
- **Migrate:** a ordem é sync → `applyDbConstraints` (DROP NOT NULL, CHECK, trigger) → `closeEndedStayAccounts` → `migrateConsumptions` → `closeEndedStayAccounts`. É idempotente (testado), e o DROP NOT NULL explícito foi testado num banco anterior. O trigger não tem lista de colunas, o que evita a armadilha do `ALTER TYPE`. O `schema.sql` tem os mesmos nomes.
- **Fluxo PIX:** o `CreateBookingController` não foi tocado. O payload do outbox não mudou. O `public-booking`, os webhooks do Mercado Pago e do Asaas e o `pix` passam.
- **`fromCents` com negativo:** testado, e o sinal aparece uma vez só.
- **`GET /reservations/:id/bill`:** o contrato não mudou para quem não usa `account_id`.

## Não foi possível verificar
- O comportamento num banco provisionado só por `db/schema.sql` com dados reais anteriores à T-04.4. Testei só o caminho sync + `applyDbConstraints` do banco de teste.
- O deadlock webhook × POST `{account_id}` e o `PUT /reservations` × POST: deduzidos pela mesma ordem de travas do caso reproduzido (check-out), sem execução própria.
- Mutation testing: não rodei. Confiei no commit 6ad02e5 do dev.
