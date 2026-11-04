# QA Red Team — T-04.6 check-in abre a conta da suíte
**Branch:** feature/t046-checkin-account · **Dev:** Sirlande · **Base:** develop@6526bcd · **Data:** 26/10/2026
**Arquivos auditados:** 19 (`CheckInController.js`, `ListReservationAccountsController.js`, `accountPayments.js`, `reservationBill.js`, `reservationRoomAccount.js`, `swagger.js`, `reservationRouter.js`, `tests/helpers/legacyStay.js` e 11 arquivos de teste)
**Achados no escopo:** 5 (🔴 0 · 🟡 1 · 🟢 4) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Pela régua, nenhum achado é 🔴: não há vazamento, nem perda de dinheiro gravada, nem quebra de contrato.
O 🟡-1, porém, **deve ser corrigido antes do merge**. A corrida que a D-58 diz absorver com o savepoint
termina, na prática, em **deadlock no PostgreSQL**. O teste da própria branch que cobre essa corrida
(`checkin-account.test.js:160`) falhou em 1 de 3 execuções completas da suíte. Com isso a CI fica
intermitente, e um consumo lançado durante o check-in se perde com 500.

## Achados no escopo

### 🟡-1 [Concorrência / D-58] Check-in × `POST /reservations/:id/consumptions` dá deadlock, não colisão no índice
**Onde:** `services/core-service/app/utils/reservationRoomAccount.js:145-161` (`openStayAccount`), chamado em `services/core-service/app/Controllers/ReservationApi/CheckInController.js:53` depois da trava `FOR UPDATE` da reserva (`:24`). O outro lado é `reservationRoomAccount.js:110-117` (`AccountModel.create` fora de transação), chamado em `CreateConsumptionController.js:63`.
**Cenário (reproduzido com um teste temporário, já removido: 40 pares check-in + consumo em paralelo, 39 deram `consumo 500 "deadlock detected"`; na suíte completa, `checkin-account.test.js:160` falhou 1 vez em 3 com `expected 500 to be 201`):**
1. O check-in (T1) trava a reserva com `FOR UPDATE` e faz o `findOne` da conta de diária. Não acha nenhuma.
2. A rota antiga (T2, autocommit) executa o `INSERT INTO accounts`. A tupla entra no índice `accounts_lodging_unique`. Em seguida o gatilho da FK `accounts.reservation_id → reservations` pede `FOR KEY SHARE` na reserva. Esse pedido conflita com o `FOR UPDATE` de T1, então T2 espera T1.
3. T1 executa o `INSERT` da conta da suíte. A chave (reservation_id, room_id) colide com a tupla ainda não confirmada de T2, então T1 espera T2.
4. As duas esperam uma pela outra. O PostgreSQL aborta T2 com 40P01, e `CreateConsumptionController` devolve 500. O consumo (um "Jantar", por exemplo) **não é gravado**. O check-in segue com 200.

O caminho que o JSDoc e a D-58 descrevem, "o índice da RN-005 recusa a segunda, e o savepoint deixa o check-in seguir", **não acontece com a rota antiga**. Enquanto T1 segura a reserva, a FK impede T2 de confirmar, então T1 nunca recebe `UniqueConstraintError` dela. O teste `checkin-account.test.js:173` só chega ao savepoint porque usa um mock de `findOne` e simula uma ordem que o banco não produz. Antes desta branch o deadlock não existia: o check-in não inseria em `accounts`.
**Regra violada:** D-58 (a premissa da corrida absorvida está errada) e D-48 (ordem de trava reserva → contas). A rota antiga cria a conta, o que bloqueia a reserva pela FK, sem antes travar a reserva.
**Correção sugerida (a menor):** na rota antiga, serializar atrás da reserva. Uma opção é `reservationRoomAccount` abrir uma transação curta, fazer `SELECT … FOR UPDATE` (ou `FOR KEY SHARE`) na reserva, reler a conta de diária e só então criar. Assim T2 espera o commit do check-in e encontra a conta criada por ele. A alternativa mais barata é repetir em 40P01 dentro de `CreateConsumptionController`, como já se faz em `RemoveRoomFromReservationController.js:9`. Depois, trocar o teste mockado (`:173`) por um que reproduza a corrida real e corrigir o texto da D-58 e o JSDoc de `openStayAccount`.

### 🟢-1 [Testes] O teste de rollback (CA-04.6.c) só simula erro de aplicação
**Onde:** `services/core-service/tests/checkin-account.test.js:226-238`
**Cenário:** o `mockRejectedValueOnce(new Error('falha simulada'))` rejeita antes de qualquer SQL. O teste não cobre um erro **do banco** dentro do savepoint, como um CHECK ou uma FK recusada, que exige `ROLLBACK TO SAVEPOINT` seguido do rollback externo. Lendo o código, esse caminho funciona: o erro que não é da corrida é relançado em `:160` e cai no `catch` do controller. Mesmo assim, uma mutação que engula o erro fora do savepoint passaria.
**Correção sugerida:** um caso com erro real do banco. Por exemplo, um `spyOn` que chame o `create` original com um `type` inválido, para o CHECK recusar.

### 🟢-2 [Testes] Rateio do crédito com a conta do check-in mais a do acompanhante só aparece no fluxo legado
**Onde:** `services/core-service/tests/helpers/legacyStay.js:19-27` e todos os arquivos migrados
**Cenário:** com o helper, os 78 testes antigos passaram a montar estadias sem a conta do check-in. O único teste de ponta a ponta com a conta nova (`checkin-account.test.js:208`) usa uma conta só. Nenhum teste combina conta do check-in (titular, D-42), conta de acompanhante aberta depois, sinal pela reserva e check-out com as duas contas PAID. Esse vai ser o caso mais comum depois do deploy. O helper não esconde regressão hoje: ele só remove o que o check-in criou, e o `checkin-account` confere a contagem. Ainda assim, o rateio D-45 com a titular vinda do check-in não é exercido.
**Correção sugerida:** um teste nesse formato em `checkin-account.test.js`.

### 🟢-3 [API] `GET /reservations/:id/accounts` devolve 404 para reserva excluída
**Onde:** `services/core-service/app/Controllers/ReservationApi/ListReservationAccountsController.js:22`
**Cenário:** reserva com conta PAID é excluída (soft delete). A rota responde 404, e as contas, que são registro financeiro com FK RESTRICT, só ficam visíveis por `GET /accounts`. Está coerente com a D-60 ("inexistente → 404"). Se a recepção precisar auditar a estadia excluída, vai precisar de `paranoid: false` aqui.
**Correção sugerida:** nenhuma agora. Registrar a decisão no anexo.

### 🟢-4 [Operação / B2B] Reserva-bloco abre uma única conta "Suíte <1º quarto>" com o total do contrato
**Onde:** `services/core-service/app/utils/reservationRoomAccount.js:150-157` combinado com `SignContractController.js:90-99`
**Cenário:** no check-in de um evento corporativo de 20 quartos nasce uma conta só, `Suíte 101`, cobrando `contract.total`, com `guest_id` igual ao do representante legal. Na lista do garçom aparece um único "Suíte 101" para os 20 quartos. Isso é o que a D-40 decidiu, e o CA-04.6.b ficou para depois. Não há vazamento: o rótulo não leva nome e o garçom não vê `guest_id`. O efeito é operacional e fica registrado para a CA-04.6.b.
**Correção sugerida:** nenhuma nesta branch.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- **Tenant isolation:** `openStayAccount` usa `reservation.tenant_id`, e a reserva foi lida com o tenant do JWT. `ListReservationAccountsController` filtra reserva e contas por `request.user.tenantId`, responde 404 para não-UUID, para outro tenant e para reserva inexistente, e não tem `findByPk` no código de produção.
- **Garçom:** `/reservations/:id/accounts` fica fora da `WAITER_ALLOWLIST` (`app/utils/roles.js:19-26`). O caso entrou em `waiter-least-privilege.test.js:83`.
- **Rota:** `/:id/accounts` tem dois segmentos e não colide com `/:id`. Está no Swagger, com o schema `Account` existente.
- **Minimização (LGPD):** a conta guarda só `guest_id`, e o rótulo `Suíte N` não leva nome (D-15). A resposta da lista não faz `include` de hóspede.
- **Savepoint no Sequelize 6:** `sequelize.transaction({ transaction }, cb)` cria um SAVEPOINT. Se o callback rejeita, ele faz `ROLLBACK TO SAVEPOINT`. O nível de isolamento é o padrão (READ COMMITTED), então o `findOne` depois de uma colisão enxerga a linha confirmada. O mecanismo está correto; o problema do 🟡-1 é que ele não é alcançado.
- **Reaproveitamento:** a busca usa `charges_lodging: true` em qualquer quarto. Contas de não-ROOM nunca cobram diária, por CHECK. Conta de diária não fecha antes do fim da estadia (`CloseAccountController.js:58-66`), então a conta reaproveitada está sempre OPEN.
- **D-61:** `uncoveredLodgingCents` segue a mesma regra de `lodgingShare` (`accountCharges.js:40-49`) e de `reservationBill.js:39`, com 0 para CANCELLED ou excluída e `total_amount` nos demais casos, e o mesmo critério "ROOM e charges_lodging". O guard `remaining > 0` preserva crédito negativo antigo. Para dados já gravados, o `migrate` (`closeEndedStayAccounts.js:63-80`) reavalia as contas PAID e as CLOSED com crédito, e corrige o acompanhante que estava PAID por engano. O `start.sh:94` roda o migrate.
- **Migração legada:** `migrateConsumptions.js:79,95` usa a conta de diária que já existe em (reserva, quarto principal), então é compatível com a conta criada pelo check-in.
- **Check-out:** fecha a conta do check-in como titular e chega a PAID com saldo zero (`checkin-account.test.js:208`). Cancelamento depois do check-in é bloqueado pela máquina de estados.
- **Seed:** as reservas `CHECKED_IN` do `seed_hotels.sql:218-222` ficam sem conta, que é o estado legado previsto na D-61 e registrado como pendência da T-04.7 no anexo. Nada quebra: o consumo pela rota antiga cria a conta.
- **`bill-consumptions.test.js`:** sem alteração (guardião do CA-04.2.e).
- **Suíte:** 939 testes passaram em 2 de 3 execuções. Na terceira falhou o teste do 🟡-1.

## Não foi possível verificar
- O `api-client` do frontend (`frontend/packages/api-client/src/schema.d.ts`) não foi regerado. Ele também não tem `/accounts` de entregas anteriores, então a defasagem não é desta branch e não existe checagem de drift na CI.
- Concorrência do check-in com `POST /accounts`, `AddRoomToReservation` e webhook PIX foi verificada só pela leitura: todos travam a reserva primeiro (D-48). Não houve teste de estresse.
