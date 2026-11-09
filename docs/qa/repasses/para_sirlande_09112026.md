# Repasse para Sirlande — 09/11/2026

Origem: QA Red Team da branch `feature/m5b-pagamento-checkout` (`docs/qa/redteam_m5b-pagamento-checkout_09nov2026.md`).
Fora do escopo do diff (backend sem mudança de código nesta branch), mas na área de conta/pagamento (SPEC-04).

### 🟡 [Financeiro / D-31] POST /payments só com `reservation_id` não verifica consumo antigo pendente — SUSPEITA
**Onde:** `services/core-service/app/Controllers/PaymentApi/CreatePaymentController.js:63-74` (ramo `else`), comparado com `:57-59` (ramo `account_id`)
**Cenário:** banco legado com `consumptions` ainda não migrado para a reserva R (janela entre os pods novos subirem e o `migrate` rodar, ou reserva que a migração deixou para trás). `POST /payments { reservation_id: R, amount, method }` passa: não há a checagem `pendingLegacyConsumption` que o ramo `account_id` faz (503). O `settlePaymentAccount` acerta as contas pelo razão sem o consumo antigo e pode marcar a conta CLOSED → PAID com dívida fora dela — o mesmo valor menor que o D-31 quer impedir. A M5-b passou a usar **só** este ramo (D1). Na tela, o GET do bill devolve 503 e o formulário não aparece, então o caminho é pela API direta ou por cache do bill carregado antes da janela.
**Para confirmar:** ler `reservationLedger` (`app/utils/accountBill.js`) e confirmar que ele ignora `consumptions`; um teste com consumo legado vivo e pagamento por reserva.
**Regra violada:** D-31 (consumo antigo fora da conta deixa o saldo menor); mesma regra aplicada de forma desigual nos dois ramos (DRY).
**Correção sugerida:** no ramo `else`, depois do `findOne` travado, `if (await pendingLegacyConsumption(reservation_id, transaction))` → rollback + 503, com a mesma mensagem do ramo `account_id`.

### 🟢 [Regra de negócio] POST /payments aceita pagamento de reserva CANCELLED / NO_SHOW
**Onde:** `services/core-service/app/Controllers/PaymentApi/CreatePaymentController.js:66-74`
**Cenário:** `POST /payments { reservation_id: <reserva CANCELLED> }` → 201. A tela da M5-b só mostra o formulário em CHECKED_IN/CHECKED_OUT (allowlist em `paymentLogic.ts:478`), mas a regra vive só no cliente. Pode ser intencional (sinal/no-show cobrado); se for, registrar a decisão; se não, allowlist de status no servidor.
**Correção sugerida:** decidir e documentar; se proibido, allowlist de status no ramo `reservation_id`.
