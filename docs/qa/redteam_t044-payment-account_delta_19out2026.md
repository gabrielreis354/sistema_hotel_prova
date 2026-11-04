# QA Red Team — T-04.4 pagamento ↔ conta (reauditoria delta)
**Branch:** feature/t044-payment-account · **Dev:** Sirlande · **Base:** develop@ee5a685 · **Delta:** 6ad02e5..d40f1dc · **Data:** 19/10/2026
**Arquivos auditados:** 14 (delta em `services/core-service`), mais os fluxos que mudam o rateio: CloseAccount, CreateAccount, closeReservationAccounts, Cancel/Delete/CheckOut da reserva, CancelContract, UpdateReservation, migrate
**Achados no escopo:** 7 (🔴 1 · 🟡 1 · 🟢 5) · **Repassados:** 0

## Veredito
**REPROVADO**

Motivo: 🔴-1. Basta fechar duas contas da mesma reserva ao mesmo tempo para uma delas ficar `PAID` com saldo devedor. Nesse estado o `POST /payments` dela responde 422 "já está quitada". O problema é de serialização no fechamento, e a correção é pequena. As correções da 1ª rodada estão certas, salvo o resíduo anotado no 🟢-4.

Reproduções feitas em `gestao_hotel_test`, com um teste temporário que apaguei depois de rodar (`tests/zz_qa_delta_tmp.test.js`; o working tree não mudou). Os 5 arquivos de teste relevantes passam: 142 passed, 1 skipped.

---

## Achados no escopo

### 🔴-1 [Dinheiro · concorrência] Fechar duas contas da mesma reserva ao mesmo tempo deixa uma `PAID` devendo, e o pagamento direto dela fica bloqueado
**Onde:**
- `app/Controllers/AccountApi/CloseAccountController.js:71-75`: trava **só a conta**, sem a reserva.
- `app/utils/accountBill.js:43`: `closeAccount` acerta só a conta que fechou.
- `app/utils/accountPayments.js:21,33-38`: a ordem do rateio depende do `closed_at` de **outras** contas.

**Cenário (reproduzido em 8 de 8 rodadas):**
1. Reserva CHECKED_IN, com a suíte A (diária, OPEN) e os bares X e Y (ROOM, `charges_lodging: false`), cada bar com 30,00.
2. `POST /payments {reservation_id, amount: 30.00}`: o crédito da reserva é 30.
3. `PUT /accounts/X/close` e `PUT /accounts/Y/close` em paralelo. As duas transações se cruzam porque cada uma trava só a própria linha:
   - a tx de X calcula com Y ainda OPEN: a ordem é `[X, A, Y]`, X recebe 30 e vira PAID;
   - a tx de Y calcula com X ainda OPEN: a ordem é `[Y, A, X]`, Y recebe 30 e vira PAID.
4. Depois do commit, a ordem real é `[X, Y, A]` (por `closed_at`). O bill mostra:
   `X: PAID / balance 0.00` e `Y: PAID / balance 30.00` (ou o inverso).
5. `POST /payments {account_id: Y}` responde **422 "Conta PAID já está quitada"** (`CreatePaymentController.js:72`). Com o fluxo "cada conta quita a sua", não há como receber os 30 nessa conta.

O check-out não corrige: `closeReservationAccounts` só olha as OPEN. O status só volta ao certo no próximo pagamento com reserva ou no próximo `migrate`. Até lá, a lista de contas mostra PAID para uma comanda devendo 30, e o hóspede sai sem pagar.

Fechar duas comandas da mesma estadia em paralelo é rotina: dois atendentes, ou um botão "fechar contas" que dispara requisições em paralelo. A justificativa da D-45 ("conta fechada não muda de total, então nada deixa PAID/CLOSED obsoleto") vale só com os fechamentos **serializados por reserva**. Hoje o fechamento manual não serializa.

**Regra violada:** D-45 e D-43 (status coerente com o saldo); "toda mudança no rateio acerta as contas afetadas".

**Correção sugerida (a menor):** no `CloseAccountController`, quando a conta tem `reservation_id`, travar a reserva `FOR UPDATE` **antes** da conta. É a mesma ordem reserva → conta do POST /payments, do check-out e do webhook. Os fechamentos da mesma reserva passam a sair em fila, e o segundo enxerga o primeiro já CLOSED. Acrescentar o teste de concorrência (dois closes com `Promise.all`, várias rodadas) com a asserção "no máximo uma PAID e nenhuma PAID com balance > 0".

---

### 🟡-1 [Concorrência] Deadlock novo: dois `POST /payments` só com `reservation_id`, na mesma reserva
**Onde:**
- `app/Controllers/PaymentApi/CreatePaymentController.js:81-91`: o ramo sem conta lê a reserva **sem trava**.
- `:93`: o INSERT pega **KEY SHARE** na reserva pela FK.
- `app/utils/accountBill.js:101-106`: o `settlePaymentAccount` pede **FOR UPDATE** na mesma reserva.

**Cenário (reproduzido em 6 de 8 rodadas, `deadlock detected` → 500):**
1. T1 e T2 fazem o INSERT do pagamento, e as duas ficam com KEY SHARE na reserva R, um lock compatível com o outro.
2. T1 pede `SELECT … FOR UPDATE` em R e espera o KEY SHARE de T2.
3. T2 pede o mesmo e espera o de T1. O Postgres aborta uma das duas, e o pedido abortado responde **500 "Erro ao registrar pagamento."**

O deadlock é regressão deste delta. Antes, o acerto travava só a conta titular, e os dois pedidos apenas entravam em fila. Gatilhos reais:
- duplo clique ou duplo envio no "registrar pagamento";
- dois atendentes lançando partes de um pagamento dividido (cartão + dinheiro).

O comentário em `CreatePaymentController.js:22-24` promete a ordem reserva → conta, mas ela só vale no ramo `account_id`. Também verifiquei o caso misto, com um pedido no ramo `account_id`, que já trava a reserva antes: aí não há deadlock, porque o Postgres deixa quem já tem KEY SHARE subir para FOR UPDATE.

**Regra violada:** ordem de trava única (o mesmo tema do 🟡-3 da 1ª rodada, agora no outro ramo).

**Correção sugerida:** no `else`, ler a reserva com `lock: transaction.LOCK.UPDATE` antes do `PaymentModel.create`, igual ao ramo `account_id`. Teste: o mesmo laço de `Promise.all` da suíte "Concorrência", com dois pagamentos só de reserva.

---

### 🟢-1 [Regra · rateio] Conta de total 0 continua PAID depois que a sobra muda de conta
**Onde:** `app/utils/accountPayments.js:90-91` (a sobra vai para a última conta da ordem). `CreateAccountController.js:146-155` abre a conta sem acertar as outras.
**Cenário (reproduzido):** reserva CHECKED_IN com sinal de 100 e nenhuma conta.
1. Abre a conta "Bar" (sem diária) e fecha vazia. Ela é a única conta, recebe a sobra e vira `PAID`, com `payments_made 100.00` e `balance -100.00`.
2. Abre a suíte (`POST /accounts`, ROOM com diária). A sobra passa para a suíte, que é a última da ordem.
3. O bill do Bar fica `PAID`, com `payments_made 0.00` e `balance 0.00`. Isso contradiz a definição "PAID = fechada, **com pagamento**, saldo ≤ 0".

Não há dinheiro errado, porque o saldo é calculado na leitura. O status, porém, fica obsoleto até o próximo pagamento ou `migrate`.
**Correção sugerida:** a opção mais simples é aceitar e documentar na D-45 que a abertura de conta não acerta as outras. A alternativa é a conta de total 0 nunca receber a sobra: a sobra vai para a última conta com total > 0 e, só se nenhuma tiver, para a última da ordem.

### 🟢-2 [Robustez] A ordem das fechadas usa o relógio da aplicação
**Onde:** `app/utils/accountBill.js:32` (`closed_at: new Date()`) e `accountPayments.js:21`.
**Cenário:** em produção com várias réplicas (K8s), X fecha no pod 1 e, depois, Y fecha no pod 2, cujo relógio está 2 s atrasado. Y fica com `closed_at` menor e "fechou antes". A parte de X muda sem que ninguém acerte X, o mesmo efeito do 🔴-1 sem concorrência nenhuma.
**Correção sugerida:** gravar `closed_at` com o relógio do banco (`sequelize.fn('NOW')`, ou `clock_timestamp()` para separar as contas fechadas numa mesma transação). Com a trava da reserva do 🔴-1, a ordem no banco passa a ser também a ordem real.

### 🟢-3 [Custo] O acerto é O(k²) em consultas, dentro da transação que trava a reserva
**Onde:** `accountBill.js:122` chama `settleAccount` k vezes. Cada uma chama `paymentsMadeCents` → `reservationCredit` (`accountPayments.js:83-89`), que recalcula `accountCharges` das k contas, com 1 a 4 consultas cada.
**Cenário:** reserva com 3 contas dá cerca de 60 consultas por pagamento. Uma reserva-bloco B2B com 10 quartos e 10 contas passa de 400 consultas, com a reserva travada (check-in, check-out e outros pagamentos esperam).
**Correção sugerida:** calcular `reservationCredit` uma vez por acerto e passar o mapa a `settleAccount`, o que deixa o custo linear. Aceitável para pousada; registrar como pendência antes do B2B.

### 🟢-4 [Resíduo do 🟡-4] Pagamento negativo antigo continua sumindo da soma da conta
**Onde:** `accountPayments.js:47,80` (`toCents` devolve 0 para texto com sinal) e `applyDbConstraints.js` (o CHECK é `NOT VALID`).
**Cenário:** um banco provisionado por `sync` antes desta branch tem uma linha `amount = -50`, que o CHECK `NOT VALID` deixa ficar. Se ela for o único pagamento da conta, a soma `"-50.00"` vira 0 na conta, enquanto o `GetBill` da reserva subtrai 50. A soma dos saldos das contas e o `balance_due` divergem. A 3ª correção sugerida no 🟡-4 ("soma com sinal") não foi feita. O CHECK também é `>= 0`, então o banco aceita amount 0, que a API recusa.
**Correção sugerida:** um `migrate` que liste ou trate os negativos e depois rode `VALIDATE CONSTRAINT`, ou uma soma com sinal (`toSignedCents`, que já existe no teste). Opcionalmente, `CHECK (amount > 0)`.

### 🟢-5 [Contrato] `amount` grande demais vira 500
**Onde:** `CreatePaymentController.js:35` e `UpdatePaymentController.js:12`: `toCents` não tem teto, e a coluna é `NUMERIC(12,2)`.
**Cenário:** `POST /payments {amount: "99999999999"}` passa a validação. O INSERT falha com `numeric field overflow` e a API responde **500**, quando o certo seria 400.
**Correção sugerida:** teto de 9 999 999 999,99 (ou um teto de negócio) na mesma checagem, respondendo 400.

### 🟢 (testes) Lacunas de teste no delta
- Não há teste de concorrência para o ramo só-reserva (🟡-1) nem para dois fechamentos simultâneos (🔴-1). Os dois testes de concorrência existentes cobrem só o ramo `account_id`.
- "entre as fechadas, quem fechou primeiro recebe primeiro" (`tests/account-payments.test.js:580`): um mutante que ordene as fechadas por `id` em vez de `closed_at` passa em cerca de 50% das execuções, porque os ids são UUID v4. Fortalecer o teste: rodar o cenário com vários pares, ou controlar o `closed_at`.

---

## Repassados a outro dev
Nenhum novo. Os repasses da 1ª rodada continuam em aberto (`para_indefinido_19102026.md`, `para_gabriel_19102026.md`).

## O que foi verificado e está correto
- **D-45:** a ordem é fechadas por `(closed_at, id)`, depois a titular (a de diária mais antiga entre as abertas) e as outras por `(opened_at, id)`. O teto de cada conta é o total menos os pagamentos diretos dela, e a sobra vai para a última. `settlePaymentAccount` acerta todas as contas da reserva, em ordem de id, depois de travar a reserva.
- Lançar item, mudar as datas da reserva (`PUT /reservations`), trocar ou realinhar quarto (`realignStaleLodgingAccount`, só OPEN), excluir item (só OPEN) e consumir pela rota antiga mexem só em contas abertas, que vêm depois das fechadas. Não deixam status obsoleto.
- **Check-out, cancelamento, cancelamento de contrato B2B e exclusão da reserva:** travam a reserva e fecham as contas uma a uma, em ordem de id. Cada conta fecha e se acerta enxergando as anteriores, e não há sobra numa conta fechada enquanto existe aberta depois dela.
- **Fechar uma conta enquanto outra transação paga ou faz check-out:** sem deadlock e sem status obsoleto. O pagamento trava todas as contas e relê a conta já fechada, e o check-out descarta, no re-check, a conta que não está mais OPEN.
- A soma dos saldos das contas é igual ao `balance_due` da reserva, desde que a diária esteja numa conta de diária e não haja pagamento negativo antigo (🟢-4). Inclui a reserva cancelada (D-46: `GetBillController.js:44`, que espelha `lodgingShare`).
- **Ordem de trava:** webhook, PUT e DELETE de pagamento seguem pagamento → reserva → contas, e nenhum fluxo trava reserva → pagamento. No ramo `account_id`, o 🟡-3 da 1ª rodada está corrigido e coberto por teste de concorrência.
- **SQL cru com tenant:** `sumPaid` e a consulta dos pagamentos diretos filtram `tenant_id`. O EXISTS do migrate liga `p.tenant_id = a.tenant_id`. `settlePaymentAccount` usa o `tenant_id` do próprio pagamento.
- 🟡-4: POST e PUT recusam negativo, zero e mais de 2 casas (400), e existe CHECK no banco (resíduo no 🟢-4).
- 🟢-1: o migrate rebaixa PAID obsoleto (testado). 🟢-3: UUID em maiúsculas (testado). 🟢-4 da 1ª rodada: o trigger recusa conta INTERNAL, em `schema.sql` e `applyDbConstraints` (testado).
- Testes relevantes: 142 passed, 1 skipped (`account-payments`, `account-close`, `account-bill`, `payments`, `reservations`).

## Não foi possível verificar
- O caminho do `migrate` concorrendo com tráfego real (rolling update). O passo 2 trava por `(reservation_id, closed_at, id)` e o tráfego trava por id: há potencial de deadlock, mas o passo 2 vem de antes deste delta e quase não pega linhas depois da primeira execução. Não reproduzi.
- O Swagger (`a5a6596`) e o api-client: fora do foco deste delta, por pedido.
