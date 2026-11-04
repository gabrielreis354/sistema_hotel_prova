# QA Red Team — T-04.3 Bill da conta e fechamento: 3ª rodada (delta 2)

**Branch:** `feature/t04-3-account-bill` (`2c4a747`) · **Dev:** Sirlande · **Base:** develop@`2ad97fc` · **Data:** 19/10/2026
**Auditoria anterior:** `redteam_t043-account-bill_delta_19out2026.md` sobre `78b90ed` (REPROVADO por N-1 🔴; N-2 🟡, N-3 🟢, N-4 🟢)
**Escopo:** `git diff 78b90ed..HEAD`, 4 commits (`c5971b0..2c4a747`), 5 arquivos: `CloseAccountController.js`, `accountBill.js`,
`command.js`, `config/swagger.js` e `tests/account-close.test.js`. Também li o anexo `SPEC-04-decisoes-T-04.3.md` (D-35, D-39 e D-41),
que está no working tree e ainda não foi commitado.
**Contexto lido:** `reservationChangeGuard.js`, `UpdateReservationController.js`, `CheckInController.js`, `CancelReservationController.js`,
`CancelContractController.js`, `SignContractController.js`, `UpdateContractController.js`, `CreateAccountController.js`,
`closeReservationAccounts.js`, `closeEndedStayAccounts.js`, `migrateConsumptions.js` e `pendingLegacyConsumption.js`.
**Achados novos no escopo:** 3 (🔴 0 · 🟡 0 · 🟢 3) · **Repassados:** 0

## Veredito

**APROVADO COM RESSALVAS**

Os quatro achados da 2ª rodada fecharam. O N-1 🔴 fechou de verdade: a conta de diária só fecha com a reserva em estado terminal,
e nenhuma rota muda datas, quartos ou total de uma reserva nesse estado. Os cenários E (prorrogação) e F (encurtamento) da rodada
anterior agora dão 500/500 e 100/100. As ressalvas são três 🟢 de teste e de migrate. Nenhuma tem dano financeiro.

---

## Como reproduzi

Criei um teste temporário (`tests/zz_redteam_t043_delta2_tmp.test.js`, **já apagado**) e o rodei sozinho no banco de teste, na branch:

```
J lodging on PENDING ROOM true close 422          ← rota antiga cria conta de diária na PENDING; fechar → 422
J cancelled close 200 0.00                        ← conta de diária reaberta numa reserva CANCELLED fecha com 0
K deleted close 200 0.00                          ← reserva excluída (paranoid) libera, com 0
O close durante 422                               ← cenário E da rodada anterior
O prorroga 200 500.00
O account CLOSED 500.00 reservation bill room_total 500   ← soma = total
P encurta 100.00 account 100.00                   ← cenário F: soma = total
L 422/422/200=1200(1200.00) ×8                    ← 2 PUT /close de diária + check-out simultâneos, 2 contas
M 422/204:CLOSED ×8                               ← PUT /close × DELETE /reservations
N 422/fulfilled:300.00 ×8                         ← PUT /close × closeEndedStayAccounts numa sobra da D-36
R 422/200:0.00 ×8                                 ← PUT /close × PUT /cancel (conta legada na PENDING)
```

Nenhum 500, e nenhum `closeAccount: a conta … não está aberta` nas corridas.
Os 5 arquivos ligados ao delta (`account-bill`, `account-close`, `account-items`, `consumption-migration`, `bill-consumptions`) deram **150 passed**.

**Mutação dirigida, revertida com `git checkout`:** tirei `'CANCELLED'` de `ENDED_STAY_STATUSES` e troquei `stay && !…` por `!stay || !…`.
A suíte inteira passou com as duas mutações juntas (**772 passed, 1 skip**). Detalhes no 🟢 N-5.

---

## Situação de cada achado da 2ª rodada

| Achado | Situação | Evidência |
|---|---|---|
| 🔴 N-1 Conta de diária fechada no meio da estadia; soma das diárias ≠ total | ✅ **Fechado** | `CloseAccountController.js:60-70` responde 422 para `ROOM` + `charges_lodging` fora de `CHECKED_OUT`/`CANCELLED`. Fiz o teste de alcance pedido no foco 1: CHECKED_OUT e CANCELLED são terminais. `CheckInController.js:26` só aceita PENDING/CONFIRMED, e `CancelReservationController` usa allowlist. `reservationChangeGuard.js` bloqueia datas e quartos nesses dois status, e Update, AddRoom e RemoveRoom chamam o guard. `UpdateReservation` só recalcula o total quando datas ou quarto mudam. A reserva B2B tem o total fixado no `SignContract`, e o `UpdateContract` não mexe na reserva. Também não existe rota de restore de reserva excluída nem de reabertura de conta. Por isso a leitura sem trava da reserva (`:61-63`) é segura: o status lido nunca sai de um estado terminal. Os cenários E e F agora fecham na soma (O, P). |
| 🟡 N-2 Exclusão depois do check-out mantém a diária gravada | ✅ **Fechado por decisão** (D-35 ajustada) | O Sirlande decidiu que o gravado vence, e o anexo registra isso. O Swagger (`swagger.js:136`) agora diz "quando a conta ainda estava aberta … a conta fechada mantém o valor gravado". Os comentários de `lodgingShare` e `closeReservationAccounts` continuam coerentes, porque só se aplicam à conta aberta. **Falta o teste "check-out → DELETE"** que a correção pedia (🟢 N-6). |
| 🟢 N-3 Upgrade direto: contas criadas CLOSED pela migração ficam sem diária gravada | ✅ **Fechado no caminho normal** | `command.js:62-64` chama `closeEndedStayAccounts` de novo depois de `migrateConsumptions`, e a função é idempotente. Resta o caso em que a migração termina com reservas para trás (🟢 N-7). |
| 🟢 N-4 `closeAccount` sem filtro de status | ✅ **Fechado** | `accountBill.js:110-113` faz `where: { …, status: 'OPEN' }` e `throw` se `updated !== 1`. Os três chamadores travam e conferem OPEN antes: o controller (`:34-45`), `closeReservationAccounts` (`FOR UPDATE … status='OPEN'`) e o migrate (`FOR UPDATE OF a … status='OPEN'`). O Postgres reavalia o WHERE depois da espera, então o `throw` não é alcançável por corrida (L, M, N, R). O `2c4a747` exige 200 no check-out com a conta já fechada, e isso protege contra uma regressão que fizesse o `throw` virar 500 no encerramento. Teste novo `closeAccount recusa conta que não está aberta`. |
| 🟢-2 (1ª rodada) Rota antiga desligada pela conta da suíte fechada | ✅ **Fechado por consequência** | Com a D-41, a conta de diária não fecha mais durante a estadia. O 422 da rota antiga (`swagger.js:984`) só sobra para estadia encerrada. |

---

## Achados novos no escopo

### 🟢 N-5 [Testes] Os dois ramos que liberam o fechamento (CANCELLED e reserva excluída) não têm teste
**Onde:** `app/Controllers/AccountApi/CloseAccountController.js:19` (`ENDED_STAY_STATUSES`) e `:64` (`if (stay && …)`);
`tests/account-close.test.js` só testa a liberação por CHECKED_OUT (`conta de diária que sobrou aberta numa estadia encerrada fecha`).
**Cenário (reproduzido):** com `ENDED_STAY_STATUSES = ['CHECKED_OUT']` e `if (!stay || !ENDED…)`, a suíte inteira passa (772 passed, 1 skip).
Os dois ramos da allowlist que a D-41 descreve podem regredir em silêncio. Hoje eles funcionam (J, K: 200 com 0.00). O dano de uma regressão
é baixo: a sobra continuaria fechando pelo `migrate` (D-37). Mas a D-41 promete esses dois caminhos, e a 3ª rodada de mutação não pegou o buraco.
**Regra violada:** checklist de testes (o teste passaria com a regra quebrada).
**Correção sugerida:** dois `it` em `account-close.test.js`. No primeiro, a conta de diária fica aberta na reserva CANCELLED (reabrir por `AccountModel.update`,
como o teste do CHECKED_OUT) e `PUT /close` deve dar 200 com `room_charges: '0.00'`. No segundo, a mesma coisa com `ReservationModel.destroy`.

### 🟢 N-6 [Testes] A D-35 ajustada ("conta fechada mantém o gravado depois do DELETE") não tem teste
**Onde:** `tests/account-bill.test.js:292-304` (`Reserva excluída (D-35)` só cobre a conta aberta). A regra fica em `accountBill.js` (o `recorded` vence o `lodgingShare`).
**Cenário:** a decisão do N-2 pode ser revertida por quem "corrigir" para 0 a reserva excluída, e nenhum teste falha. Com a D-41, esse é
praticamente o único caso em que o valor gravado difere do cálculo na hora. Com todas as contas fechadas no encerramento, o cálculo na hora de cada uma
dá total − gravadas das outras, que é o próprio valor gravado.
**Regra violada:** a correção do N-2 pedia "nos dois casos, um teste com check-out → DELETE".
**Correção sugerida:** estadia de 200, check-out e `DELETE /reservations/:id`. O `GET /accounts/:id/bill` deve dar `room_charges: '200.00'`.

Ligado a isso: o teste `preço da categoria muda depois do check-out: as contas fechadas não mudam` (`account-close.test.js:416`) é **tautológico**.
Com as duas contas fechadas, o cálculo na hora também dá 600/400, então ele passaria com o bill ignorando `closed_room_charges`. A prova da D-39
fica com `total da reserva muda depois`, que usa um estado montado por `AccountModel.update` e que a API não produz mais numa estadia viva.
Ou renomear o teste, ou fazer o assert mostrar que o valor veio da coluna, por exemplo gravando um valor diferente do cálculo e lendo esse valor.

### 🟢 N-7 [Dados / D-37] Migração com reservas para trás: a 2ª chamada de `closeEndedStayAccounts` não roda
**Onde:** `command.js:59-64` e `database/migrateConsumptions.js:~134-139`. A migração **comita** as reservas válidas e **depois** lança erro pelas que ficaram para trás.
**Cenário (lido no código):** upgrade direto da `main`, com uma reserva de consumo inválido (D-31) e outra CHECKED_OUT válida. `migrateConsumptions`
cria a conta CLOSED da válida, comita e lança erro. O `catch` dá `process.exit(1)`, a 2ª chamada não roda, e `closed_room_charges` fica null, como no N-3.
O dano é baixo e se corrige sozinho: o migrate falhou alto, o operador corrige o dado e roda de novo, e a 1ª chamada da próxima rodada grava o valor.
Enquanto isso, o bill calcula na hora, e o total de uma reserva encerrada não muda.
**Regra violada:** o texto do N-3 no anexo ("um migrate só") vale só para a migração sem sobra.
**Correção sugerida:** chamar a 2ª `closeEndedStayAccounts` num `finally`/`catch` em volta de `migrateConsumptions`, antes de propagar o erro. Ou registrar a ressalva no anexo.

---

## Respostas ao foco pedido

1. **Ainda existe caminho para a conta de diária ficar fechada com a reserva mutável?** Não pela API. Conferi cada caminho:
   - reabrir conta: não existe rota;
   - check-in depois de cancelar: não, porque o check-in exige PENDING ou CONFIRMED;
   - B2B: o total é fixado no sign, o `UpdateContract` não mexe na reserva, o bloco CHECKED_IN não fecha a conta (422) e o cancelamento do contrato passa pelo `closeReservationAccounts`;
   - DELETE: fecha na transação, e não há restore;
   - PENDING com conta legada: 422 (J);
   - contrato: não muda a reserva.

   Os estados "diária fechada + aberta numa estadia viva" que os testes da D-39 montam por `AccountModel.update` ficaram inalcançáveis.
   O código de rateio continua valendo para as sobras da corrida da D-36 em estadia encerrada.
2. **Soma = total em todos os encerramentos? 500 novo?** Sim. Check-out com duas contas e dois `close` concorrentes deu 1200 = 1200 (×8). O cancelamento dá 0. O DELETE dá 0 na aberta e mantém o gravado na fechada (D-35 ajustada).
   Não houve 500 em close × check-out, close × DELETE, close × cancel e close × migrate (×8 cada). O `throw` do `closeAccount` só dispara para um chamador sem trava, que hoje não existe.
3. **Os testes reescritos ainda provam o que diziam?** Os que mudaram para `charges_lodging: false` (pool, corrida close × check-out, check-out que não reescreve o `closed_at`)
   continuam provando concorrência e trava, agora numa conta que pode fechar durante a estadia. A corrida com a conta **de diária** ficou sem teste, e eu a cobri em L e M: o resultado é sempre 422 no close.
   Os testes que usam `AccountModel.update` provam o rateio de um estado que a API só produz nas sobras da D-36. Isso é legítimo e está comentado. As exceções são os 🟢 N-5 e N-6 e o teste tautológico citado no N-6.
4. **Contrato do `GET /reservations/:id/bill`:** intacto. `GetBillController.js` e `calculateStayTotal.js` não aparecem em `git diff develop...HEAD`, e `bill-consumptions` passou.
   O cenário O mostra o mesmo formato (`room_total`, `grand_total`, `balance_due`…).

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- **Tenant:** a leitura nova da reserva no controller filtra `tenant_id`. O `closeAccount` mantém `tenant_id` + `status` no UPDATE.
- **Allowlist (fail-safe):** um status desconhecido, ou um futuro `NO_SHOW`, cai em 422, não em fechamento.
- **Deadlock:** o close trava só a conta e lê a reserva sem trava. O encerramento trava a reserva e depois as contas. Não há ordem cruzada (L, M, R).
- **Swagger:** a descrição e o 422 do `PUT /accounts/{id}/close`, o `room_charges` (D-35 ajustada) e o 422 da rota antiga estão coerentes com o código.
- **ESM**, sem `require()`. O log é `error.message`, sem PII.
- **Anexo:** a D-35, a D-39 e a D-41 batem com o código.

## Não foi possível verificar
- A suíte completa **sem** mutação no `2c4a747`. Rodei a suíte inteira só com a mutação do N-5 (772 passed, 1 skip, o mesmo número do autor), e os 5 arquivos do delta sem mutação (150 passed).
- As corridas foram 8 rodadas por par via supertest, e a ordem caiu sempre do mesmo lado (close 422). A análise das travas cobre as outras ordens, mas não as vi acontecer.
- O caminho do N-7 não foi ensaiado, só lido no código.
- Uma observação de produto, não um achado: com a D-41, o consumo lançado pela rota antiga ou pelo garçom na conta da suíte só fecha no check-out. Acertar antes exige lançar numa conta sem diária desde o início. A decisão é do dono e está registrada na D-41.
