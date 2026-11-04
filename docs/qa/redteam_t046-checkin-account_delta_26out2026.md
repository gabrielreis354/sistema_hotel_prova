# QA Red Team — T-04.6, reauditoria delta (correções do 🟡-1, 🟢-1 e 🟢-2)
**Branch:** feature/t046-checkin-account · **Dev:** Sirlande · **Base do delta:** 1666a04..1eff38e (d2756ee, 1eff38e) · **Data:** 26/10/2026
**Arquivos auditados:** 4 (`reservationRoomAccount.js`, `closeReservationAccounts.js`, `accountPayments.js` (só o export), `tests/checkin-account.test.js`)
**Achados no escopo:** 3 (🔴 0 · 🟡 0 · 🟢 3) · **Repassados:** 0

## Veredito
**APROVADO**

O 🟡-1 foi resolvido e há prova por mutação. Removi a trava `FOR UPDATE` de `reservationRoomAccount.js:119-122`, e o teste novo falhou com `CreateConsumptionController: deadlock detected`. A D-62 também tem prova por mutação: troquei `creditOrder(open)` por `open` em `closeReservationAccounts.js:41`, e o teste 🟢-2 falhou. Nenhum dos achados abaixo bloqueia o merge.

## Achados no escopo

### 🟢-1 [Concorrência / D-30] A trava nova não é aproveitada para recusar uma estadia que encerrou enquanto a requisição esperava
**Onde:** `services/core-service/app/utils/reservationRoomAccount.js:119-131`
**Cenário:** o caso é uma reserva legada `CHECKED_IN` sem conta de diária, como as do seed e as anteriores ao deploy. O consumo passa pela checagem de status em `CreateConsumptionController.js:54-61` e chega à transação nova. Enquanto isso, o check-out trava a reserva e fecha as contas, mas não fecha nenhuma, porque a reserva não tem conta, e confirma. O consumo então recebe a trava e o `findOne` em `:123` não acha conta. O `create` em `:125` abre uma conta **OPEN que cobra diária numa reserva CHECKED_OUT**. O controller recusa o item com 422 (`:84-87`), mas a conta continua aberta e nada mais a fecha. Pela D-61, a diária deixa de ser "descoberta" e passa a figurar nessa conta, que fica aberta para sempre. O mesmo vale para uma exclusão, já que a trava usa `paranoid: false` e o resultado da leitura é descartado.
Essa corrida **já existia antes do delta**: o INSERT em autocommit esperava a FK do mesmo jeito. A diferença é que agora a correção custa uma linha, porque a linha da reserva já está travada em mãos.
**Regra violada:** D-30 / D-36 (estadia encerrada não recebe consumo, e as contas fecham no encerramento).
**Correção sugerida:** ler `status` e `deleted_at` na trava de `:119` e, se a estadia estiver encerrada ou excluída, devolver sem criar a conta (o controller já responde 422). Isso não contraria a D-28, que só dispensa a conferência do check-in.

### 🟢-2 [Testes] A releitura sob trava (`:123-124`) não é discriminada pelo teste
**Onde:** `services/core-service/app/utils/reservationRoomAccount.js:123-124` e `tests/checkin-account.test.js:173-197`
**Cenário:** testei por mutação, apagando `if (opened) return opened;`. O teste da corrida **passou**. Sem a releitura, o `create` colide no índice da RN-005, a transação volta e o `catch` em `:133-135` busca a conta do check-in. O resultado é o mesmo, com um round-trip e um erro a mais. Não há dano, mas a linha não tem guarda.
Outro ponto: o teste depende de o consumo chegar ao INSERT dentro dos 300 ms de pausa (`:184`). Numa CI lenta ele pode passar sem exercitar a espera. Não fica intermitente, só deixa de servir de regressão nessa execução.
**Correção sugerida:** opcional. Um `expect` de que nenhum `UniqueConstraintError` foi lançado (spy em `AccountModel.create` contando rejeições) cobriria a releitura.

### 🟢-3 [D-62 / D-45] A ordem do crédito entre fechadas compara `closed_at` em milissegundos; um empate volta à ordem de id
**Onde:** `services/core-service/app/utils/accountPayments.js:8` (`byClosing`) e `closeReservationAccounts.js:41`
**Cenário:** `closeAccount` grava `clock_timestamp()` com precisão de µs (`accountBill.js:35`). Só que o Sequelize/pg devolve `TIMESTAMPTZ` como `Date` do JS, com precisão de ms, e `byClosing` desempata por id. Se a titular e o acompanhante fecharem no mesmo milissegundo durante o check-out, a leitura ordena por id, e é exatamente o defeito que a D-62 corrige: o sinal passa a pagar o consumo do acompanhante. O teste usa o id mínimo de propósito, então ele falharia nesse caso.
Na prática o intervalo entre dois `closeAccount` envolve vários round-trips (`lodgingShare`, `UPDATE` e `settleAccount`), e o empate é improvável. Os testes passaram em todas as execuções. O risco existia antes, na D-45, mas a D-62 passou a depender dele. Há também divergência com `closeEndedStayAccounts.js:54`, que ordena por `closed_at` no SQL, com precisão de µs.
**Correção sugerida:** desempatar `byClosing` por "titular primeiro" (conta de diária mais antiga) antes do id, ou deixar o loop de fechamento garantir que cada `clock_timestamp` seja estritamente maior em ms. Também serve registrar a premissa na D-62.

## Pontos pedidos e conclusão

- **D-48 / D-53 na transação nova:** a ordem é trava da reserva (`:119`), depois leitura simples de `accounts` e por fim INSERT. A FK de `reservation_id` pede `KEY SHARE` numa linha que a própria transação já trava; as FKs de `room_id` e `guest_id` pedem `KEY SHARE` em `rooms` e `guests`. Nenhum caminho do código faz `FOR UPDATE` em `rooms` ou `guests` (grep de `LOCK.UPDATE` em `app/`), e soft delete é `UPDATE` sem mudança de chave (`FOR NO KEY UPDATE`), que não conflita. O único chamador (`CreateConsumptionController.js:63`) não está em transação e o projeto não usa CLS, então nenhuma segunda conexão fica esperando a primeira.
- **Deadlock novo com check-out, cancelamento, exclusão, `AddRoom`, `RemoveRoom` ou pagamento:** todos travam a reserva primeiro (`CheckOutController:24`, `CancelReservationController:28`, `DeleteReservationController:14`, `RemoveRoomFromReservationController:25`, `AddRoomToReservationController:27`, `CreatePaymentController:70`). A transação nova pede essa mesma trava logo no primeiro comando, sem segurar nada antes, então só espera. Depois do check-out, a releitura acha a conta CLOSED e o controller responde 422 (`:75-78`). Exceção: a reserva legada sem conta, ver 🟢-1.
- **`POST /accounts`:** `CreateAccountController.js:126` trava a reserva e chama `realignStaleLodgingAccount` noutra conexão (`:156`). O consumo, se estiver esperando, ainda não pegou nada, então não bloqueia esse realinhamento. O realinhamento em autocommit de outro consumo pode esperar a tupla não confirmada do INSERT daqui (índice único), mas a transação daqui não espera por ele. Não há ciclo, e depois do commit ele cai em `isLodgingRace` e devolve `null`.
- **Pool:** a espera segurando uma conexão já existia, porque o INSERT em autocommit também esperava a FK, e só acontece quando não há conta. Não há regressão.
- **Realinhamento fora da transação:** confirmado em `:109`, antes da transação em `:118`.
- **D-62 × rateio da diária gravada (D-39):** em `lodgingShare` (`accountCharges.js:57-88`) a última conta pendente sempre leva o `remaining`, então a soma das diárias gravadas fecha no `total_amount` em qualquer ordem. A ordem só muda para qual das contas que não são âncora vai 1 centavo de truncamento, e isso só quando há 3 ou mais contas de diária. A âncora (quarto principal) não depende da ordem. Antes a ordem era um sorteio de UUID; agora é determinística. Não há perda.
- **D-62 × acerto durante o loop:** cada `settleAccount` (`accountBill.js:50`) roda com as fechadas por `closed_at` e as abertas com a titular primeiro. Isso é coerente com a leitura final, em que todas estão fechadas e a titular aparece primeiro em `closed_at`, então o status PAID/CLOSED gravado bate com o bill. Contas fechadas antes da D-62 também não precisam de migração: a leitura usa o `closed_at` gravado, a mesma ordem em que foram acertadas.
- **Trava × fechamento:** a trava continua em ordem de id (`:31-36`), e o fechamento numa ordem diferente não pede trava nova, porque todas já estão seguras.
- **Tenant isolation:** a trava e a releitura filtram por `reservation.tenant_id` (`:120`, `where` em `:99-104`). A reserva veio do JWT (`CreateConsumptionController.js:52`).
- **Testes 🟢-1/🟢-2 da rodada anterior:** o erro real do Postgres dentro do savepoint (`:292-310`) gera 500, com rollback de reserva, quarto e conta. O teste de titular, acompanhante, sinal e check-out (`:250-273`) é discriminante, como mostra a mutação acima.
- **Execução:** `checkin-account.test.js` e `account-close.test.js`, 60/60 verdes. Todas as mutações foram revertidas, e o `git status` de `app/` ficou limpo.

## Repassados a outro dev
Nenhum.

## Não foi possível verificar
- Não medi o intervalo real entre os `clock_timestamp` de dois fechamentos no mesmo check-out em produção (k8s), que é a premissa do 🟢-3.
- Não rodei a suíte completa (o dev relata 943 testes em 2 execuções).
