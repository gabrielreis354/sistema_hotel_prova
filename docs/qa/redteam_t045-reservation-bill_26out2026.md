# QA Red Team — T-04.5 bill da reserva soma as contas
**Branch:** feature/t045-reservation-bill · **Dev:** Sirlande · **Base:** develop@cb5234a · **Data:** 26/10/2026
**Arquivos auditados:** 5 (`GetBillController.js`, `reservationBill.js`, `accountPayments.js`, `itemAsConsumption.js`, `tests/reservation-bill-accounts.test.js`)
**Achados no escopo:** 4 (🔴 0 · 🟡 1 · 🟢 3) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴 no escopo. O 🟡-1 é uma divergência de dinheiro que já existia antes da branch,
no razão da T-04.4. A branch não a introduz, mas a premissa escrita na D-56 ("é o mesmo
número que a soma das contas") é falsa no caso da D-54, e nenhum teste cobre esse caso.

## Achados no escopo

### 🟡-1 [Financeiro / premissa da D-56] Com a diária fora das contas (D-54), o bill da reserva cobra e o bill da conta manda devolver
**Onde:** `services/core-service/app/utils/reservationBill.js:93-102` (D-54) junto com `services/core-service/app/utils/accountPayments.js:66-87` (rateio do crédito). Premissa em `reservationBill.js:20-21` e no anexo, D-56.
**Cenário (reproduzido com um teste temporário, já removido):** reserva de 2 × 200, sinal PAID de 150, check-in, abertura só de uma conta ROOM `charges_lodging: false` (acompanhante) e lançamento de um suco de 8.
- `GET /reservations/:id/bill` → `room_total 400, grand_total 408, total_paid 150, balance_due 258`
- `GET /accounts/:id/bill` (acompanhante) → `total 8.00, payments_made 150.00, balance -142.00`

O razão não sabe que a diária ficou na reserva. Por isso joga todo o crédito do sinal na
única conta, e a conta mostra R$ 142 "a devolver" enquanto a reserva mostra R$ 258 a cobrar.
Se a recepção fechar essa conta, o `settleAccount` a marca como PAID (`owns && paid > 0 &&
total − paid ≤ 0`), e um atendente que leia o saldo negativo pode devolver o sinal que pagava
a diária. Nesse caso o CA-04.5.a ("soma das contas") também não vale: 258 ≠ −142.
**Regra violada:** a premissa da D-56/D-45 ("com conta, o pago é a soma do que as contas receberam e o bill bate com elas"). O que o comentário diz não é o que o código faz.
**Por que não reprova:** o comportamento do bill da conta é anterior à branch (T-04.4), e o bill da reserva, que é o entregável, está correto. Até a T-04.6, o cenário só ocorre quando se abre conta de acompanhante sem conta de diária.
**Correção sugerida:** a menor é (a) corrigir o texto da D-56 e do JSDoc (`reservationBill.js:20-21`), (b) incluir no teste da D-54 (`tests/reservation-bill-accounts.test.js:143`) a verificação do bill da conta, documentando a divergência, e (c) registrar como pendência da T-04.6. A correção de fato fica no razão: quando nenhuma conta cobra diária, reservar `total_amount` do crédito antes de ratear (ou não ratear o crédito nesse caso).

### 🟢-1 [D-57] `readOnly: true` não deixa a transação somente leitura no banco
**Onde:** `services/core-service/app/Controllers/ReservationApi/GetBillController.js:29`
**Cenário:** no Sequelize 6, `readOnly` só muda a escolha da conexão (`node_modules/sequelize/lib/transaction.js:79-81`, `acquireOptions.type = "SELECT"`). Ele não emite `SET TRANSACTION READ ONLY`: o gerador só produz `START TRANSACTION` e `SET TRANSACTION ISOLATION LEVEL` (`lib/dialects/abstract/query-generator/transaction.js`). Uma escrita acrescentada no futuro dentro do `reservationBill` passaria sem erro, apesar de o comentário (`GetBillController.js:19-21`) e a D-57 dizerem "só de leitura". Se alguém configurar `replication`, a leitura vai para a réplica, com atraso.
**Correção sugerida:** ajustar o comentário/D-57 ("intenção de leitura; o banco não impõe"). Se quiser a garantia, rodar `SET TRANSACTION READ ONLY` como primeira query da transação.

### 🟢-2 [Teste] O teste "em paralelo" não prova a foto única (D-57)
**Onde:** `services/core-service/tests/reservation-bill-accounts.test.js:227-238`
**Cenário:** o `reservationBill(reservation.id)` dentro do `Promise.all` só verifica o status 200. O resultado é descartado, e as asserções rodam depois que tudo terminou. O teste passa igual sem a transação REPEATABLE READ. O resultado da chamada paralela precisa ser internamente consistente (`grand_total − total_paid === balance_due` e `consumptions_total === Σ consumptions[].amount`).
**Correção sugerida:** guardar o bill paralelo e verificar essas duas identidades.

### 🟢-3 [Pool] O bill segura uma conexão por O(N contas) consultas sequenciais
**Onde:** `GetBillController.js:28-51` → `accountPayments.js:70-80` → `accountCharges.js:102-110` / `lodgingShare`
**Cenário (SUSPEITA de impacto, não medida):** com N contas são cerca de 3 a 4 queries por conta, mais BEGIN/SET/COMMIT, todas na mesma conexão retida. `database/connections/sequelize.js` não configura `pool`, então o padrão do Sequelize é `max: 5`. Com várias recepções/telas fazendo polling do bill e acertos com trava em paralelo, as conexões se esgotam antes do que antes. Para confirmar falta um teste de carga.
**Correção sugerida:** nada nesta tarefa. Registrar a configuração de `pool` como pendência de infra.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- **Tenant isolation:** a reserva é buscada com `tenant_id` do JWT (`GetBillController.js:31-32`). Ledger, itens, `lodgingShare` e `accountTotal` filtram `tenant_id`. `pendingLegacyConsumption` filtra só por `reservation_id`, mas depois de a reserva ter sido validada no tenant. O teste de outro hotel → 404 passa.
- **Transação propagada em todo o caminho:** `reservationLedger`, `accountCharges` → `accountTotal`/`lodgingShare`, `reservationConsumptionItems` e `pendingLegacyConsumption` recebem `transaction`. Nenhuma query pede uma segunda conexão ao pool (não há CLS). Nenhuma trava foi adicionada, então a ordem reserva → contas (D-48/D-53) fica intacta.
- **REPEATABLE READ:** o `SET TRANSACTION ISOLATION LEVEL` roda antes da primeira query, e a foto é tirada no `findOne` da reserva. Pagamentos (include) e razão saem do mesmo instante.
- **Pagamento ligado a conta excluída:** não existe caminho que exclua conta (`AccountModel.destroy` não aparece em `app/`). Além disso, o trigger `payments_account_consistency` (`db/schema.sql:338-360`) garante `payment.reservation_id = account.reservation_id`. Portanto `total_paid` (pagamentos da reserva) e o `paid` do razão leem o mesmo conjunto.
- **Lista vs total de consumos:** `reservation_id` só existe em conta ROOM (`accounts_reservation_only_room`). Conta INTERNAL nunca entra na lista, e as duas fontes (`accountTotal` por conta e `reservationConsumptionItems`) filtram `billable` com paranoid na mesma foto.
- **Centavos:** `toCents` para DECIMAL não negativo; `amountCents` com sinal para pagamento (o CHECK `amount >= 0` já impede negativo). `cents/100` devolve `number`, e o contrato fica igual (teste de tipos e `bill-consumptions.test.js` verdes, 18/18 rodados nesta auditoria).
- **CA-04.5.c:** `tests/bill-consumptions.test.js` não está no diff.
- **Outros chamadores:** `ListConsumptionController.js:25` chama `reservationConsumptionItems` sem transação, o que continua válido (parâmetro opcional). Os campos novos do razão (`roomCents`, `consumptionsCents`, `chargesLodging`) não vazam em resposta, porque `accountBill`/`settleAccount` só desestruturam o que usam.
- **Cancelada com conta:** `lodgingShare` devolve 0 para reserva CANCELLED, e a conta aberta mostra diária 0. Fica coerente com a D-54/D-46.
- **Banco legado / seed / start.sh / compose:** o diff não mexe em schema, seed ou migrate. Conta fechada antes da T-04.3, sem `closed_room_charges`, recalcula ao vivo (`accountCharges.js:106-107`).
- **ESM, Swagger:** sem `require`. O contrato `Bill` em `config/swagger.js:321` não mudou.

## Não foi possível verificar
- O impacto real no pool sob carga (🟢-3): não houve teste de carga.
- A T-04.6 vai mudar quando existe conta de diária. A validade da D-54 depois dela já consta como pendência no anexo.
