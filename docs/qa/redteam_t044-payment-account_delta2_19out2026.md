# QA Red Team — T-04.4 pagamento ↔ conta (reauditoria delta 2)
**Branch:** feature/t044-payment-account · **Dev:** Sirlande · **Base:** develop@ee5a685 · **Delta:** d40f1dc..9f6dae4 · **Data:** 19/10/2026
**Arquivos auditados:** 7 no delta (`CloseAccountController`, `CreatePaymentController`, `UpdatePaymentController`, `accountBill.js`, `accountPayments.js`, `paymentAmount.js`, `account-payments.test.js`). Também li os caminhos que travam conta ou reserva: `CreateAccountItem`, `DeleteAccountItem`, `Create/DeleteConsumption`, `CreateAccount`, `PixWebhook`, `Update/DeletePayment`, `CheckOut`/`Cancel`/`DeleteReservation`, `closeReservationAccounts` e `closeEndedStayAccounts`.
**Achados no escopo:** 3 (🔴 0 · 🟡 1 · 🟢 2) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

O 🔴-1 e o 🟡-1 da 2ª rodada estão fechados, e os testes de concorrência pegam os dois defeitos (ver a mutação abaixo). Não achei deadlock novo nos caminhos de operação normal. Sobram três ressalvas:
- um deadlock no caminho de reserva **excluída**, que o `lockAccount` herdou do código antigo;
- o 🟢-1, corrigido só em parte;
- uma leitura inconsistente no GET do bill.

Nenhuma das três perde dinheiro.

Suíte completa: 39 arquivos, 833 passed, 1 skipped. As reproduções usaram um teste temporário, `tests/zz_qa_delta2_tmp.test.js`, apagado depois de rodar. As mutações foram desfeitas com `git checkout`, e o working tree de `services/` está limpo.

### Prova de que os testes não dão falso verde (mutação)
| Mutação | Teste que pega | Resultado |
|---|---|---|
| `lockAccount` sem a trava da reserva | "fechar duas contas da reserva ao mesmo tempo" | falha 3/3 |
| `else` do POST /payments sem `LOCK.UPDATE` | "dois pagamentos pela reserva ao mesmo tempo" | falha 3/3 (deadlock) |
| sobra em `ordered[0]` | "a sobra fica na primeira conta com total…" | falha |
| `closed_at` com `now()` em vez de `clock_timestamp()` | "fechar duas contas…" | falha |

---

## Achados no escopo

### 🟡-1 [Concorrência] Deadlock em dois `POST /payments {account_id}` de contas diferentes da mesma reserva **excluída**
**Onde:**
- `app/utils/accountBill.js:150-155`: `lockAccount` trava a reserva com o model paranoid. Com a reserva soft-deleted, o `findOne` não encontra a linha e **não trava nada**.
- `app/utils/accountBill.js:111-115`: o `settlePaymentAccount` tem o mesmo problema.
- `app/utils/accountBill.js:117-122`: depois trava **todas** as contas da reserva, em ordem de id.

**Cenário (reproduzido, 2 deadlocks em 8 rodadas):**
1. Estadia com as contas X e Y (bares de 30,00). O ADMIN exclui a reserva com `DELETE /reservations/:id`, que fecha as contas (D-36).
2. A recepção recebe as duas comandas ao mesmo tempo: `POST /payments {account_id: X}` e `POST /payments {account_id: Y}`.
3. T1 trava X e T2 trava Y. A reserva não serializa as duas, porque está excluída.
4. No acerto, T1 pede `[X, Y]` e espera Y; T2 pede `[X, Y]` e espera X. O Postgres responde `deadlock detected`, e o pedido abortado devolve **500 "Erro ao registrar pagamento."**

Pela mesma brecha, dois `PUT /accounts/:id/close` de contas OPEN que sobraram de reserva excluída (a corrida da D-36, que o controller libera de propósito) voltam ao 🔴-1. Esse caso é ainda mais raro.

Não é regressão deste delta: a mesma leitura paranoid já estava no ramo `account_id` em d40f1dc. Mas o `lockAccount` virou a primitiva canônica da ordem reserva → conta (D-48) e herdou a brecha. Dinheiro não se perde: a transação abortada não grava nada e o atendente reenvia.

**Regra violada:** ordem de trava única (D-48). A trava da reserva tem que valer também para reserva excluída.
**Correção sugerida:** `paranoid: false` nas duas leituras com `LOCK.UPDATE` da reserva (`accountBill.js:150` e `:111`). A trava é de serialização e não depende de a reserva estar ativa. Teste: o laço acima, com `DELETE /reservations/:id` antes do `Promise.all`.

---

### 🟢-1 [Regra · rateio] Correção parcial do 🟢-1 anterior: a sobra ainda muda de conta sem acerto e deixa PAID uma conta de total 0
**Onde:** `app/utils/accountPayments.js:75-77` (alvo da sobra) e `:42-43` (o comentário "a primeira é estável: conta nova entra depois dela").

**Cenário (reproduzido):**
1. Reserva CHECKED_IN. Abre a conta "Bar0" (ROOM, `charges_lodging: false`) e fecha vazia.
2. `POST /payments {reservation_id, amount: 100}`. Nenhuma conta tem total > 0, então a sobra cai em `ordered[0]`, o Bar0. O bill do Bar0 fica `PAID`, `payments_made 100.00`, `balance -100.00`.
3. Abre a conta "Rest" e lança um prato de 30,00. Agora existe conta com total > 0, e a sobra muda para ela.
4. O bill do Bar0 fica **`PAID`, `total 0.00`, `payments_made 0.00`, `balance 0.00`**, a mesma contradição do 🟢-1 anterior.

O alvo só é estável enquanto ele mesmo tem total > 0. O fallback `?? ordered[0]` escolhe uma conta de total 0, e ela perde a sobra assim que **qualquer** conta passa a ter total. Isso acontece com lançamento de item, conta nova com diária ou mudança de datas, e nenhum desses caminhos acerta as contas. O comentário da linha 43 também não vale para conta nova com diária: ela vira titular e entra à frente das outras abertas. Isso não afeta status, porque conta aberta não tem PAID, mas o comentário está errado.

Não há dinheiro errado: o saldo é calculado na leitura, e o `migrate` corrige o status.

**Correção sugerida (escolher uma):**
- (a) no `settleAccount`, conta de total 0 só vira PAID com pagamento **próprio**, nunca pela sobra;
- (b) aceitar e documentar na D-45, corrigindo o comentário.

Teste: o cenário acima, verificando o status do Bar0 depois do passo 3.

---

### 🟢-2 [Consistência de leitura] GET do bill pode devolver `total` diferente de `room_charges + consumptions`
**Onde:** `app/utils/accountBill.js:186-187`. As partes vêm de um `accountCharges` e o `total` vem de outro (dentro de `reservationLedger`). No `GET /accounts/:id/bill`, que roda sem transação (`GetAccountBillController.js:28`), são leituras separadas.

**Cenário (SUSPEITA, não reproduzida, porque depende do intervalo entre as consultas):** um garçom lança um item de 30,00 entre as duas leituras. A resposta sai com `consumptions: "0.00"` e `total: "30.00"`, ou o inverso. Antes do delta, o `total` saía do mesmo `accountCharges` das partes, e esse descompasso não existia. A lista de `items` já era uma leitura separada antes.

**Correção sugerida:** calcular `total` a partir de `roomCharges + consumptions` do mesmo `accountCharges`. A outra opção é rodar o bill do GET numa transação `REPEATABLE READ` só de leitura.

---

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- **🔴-1:** `CloseAccountController` trava reserva → conta via `lockAccount`, e `closed_at` usa `clock_timestamp()`, então fechamentos na mesma transação (check-out, migrate) ficam em ordem.
- **🟡-1:** o ramo só com reserva trava a reserva antes do INSERT. A mutação reabre o deadlock e o teste falha.
- **Ordem de trava nos demais caminhos.** Nenhum ciclo encontrado:
  - `CreateAccountItem`, `DeleteAccountItem`, `CreateConsumption` e `DeleteConsumption` travam só a conta e leem a reserva sem trava. Não esperam R, então não fecham ciclo com quem segura R e pede a conta.
  - `CreateAccount` faz INSERT em autocommit, e o KEY SHARE dura só a instrução.
  - `PUT` e `DELETE /payments` e o webhook travam pagamento → reserva → contas. Nenhum caminho trava reserva → pagamento (grep: só PaymentApi e Webhook leem ou escrevem `payments`). O UPDATE do pagamento não mexe em coluna FK, então não pega KEY SHARE.
  - Check-out, cancelamento e exclusão de reserva travam R e depois as contas em ordem de id.
- **Razão reutilizado no loop** (`settlePaymentAccount`): é calculado depois de travar R e todas as contas, e o acerto só troca CLOSED ↔ PAID. Isso não muda a `creditOrder` (`status !== 'OPEN'`) nem nenhum total. Não fica obsoleto.
- **Razão por `reservation_id`:** o trigger `payments_account_consistency` garante que o pagamento com `account_id` tem a `reservation_id` da conta, então nenhum pagamento direto fica de fora.
- **Soma com sinal:** `(SUM(amount) * 100)::bigint` sobre NUMERIC(12,2) é exata, e o caminho da sobra negativa mantém o sinal.
- **Teto de valor** (`paymentAmount.js`): 999.999.999.999 centavos = NUMERIC(12,2). Coberto no POST e no PUT.
- **Fluxo PIX:** os testes do webhook (Mercado Pago, Asaas, sinal antes e depois do check-out) passam. A suíte toda está verde.
- **Multi-tenant:** `lockAccount` e `reservationLedger` filtram por `tenant_id`.

## Não foi possível verificar
- 🟢-2 sob carga real: a janela entre as consultas é pequena demais para reproduzir de forma determinística.
- Deadlock entre o `migrate` (`closeEndedStayAccounts`), que trava contas sem a reserva e, na etapa 2, em ordem de `closed_at`, e o tráfego vivo num rolling update. É código anterior a este delta, e a etapa 2 só pega dado legado. Não reproduzi.
