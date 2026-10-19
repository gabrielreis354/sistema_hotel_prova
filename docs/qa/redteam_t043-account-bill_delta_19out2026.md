# QA Red Team — T-04.3 Bill da conta e fechamento: reauditoria das correções (delta)

**Branch:** `feature/t04-3-account-bill` (`78b90ed`) · **Dev:** Sirlande · **Base:** develop@`2ad97fc` · **Data:** 19/10/2026
**Auditoria anterior:** `redteam_t043-account-bill_19out2026.md` sobre `47a5ffa` (REPROVADO por 🔴-1; 🟡-1 a 🟡-3, 🟢-1 e 🟢-2)
**Escopo:** `git diff 47a5ffa..HEAD`, 7 commits (`e2c8492..78b90ed`), 14 arquivos: `accountBill.js`, `closeReservationAccounts.js`,
`CloseAccountController.js`, `CreateConsumptionController.js`, `pendingLegacyConsumption.js`, `reservationRoomAccount.js`,
`AccountModel.js`, `applyDbConstraints.js`, `closeEndedStayAccounts.js`, `db/schema.sql`, `config/swagger.js` e
`tests/account-{bill,close,items}.test.js`. Também li o anexo D-33..D-40, que está no working tree e ainda não foi commitado.
**Contexto lido:** `command.js` (a ordem do migrate), `migrateConsumptions.js`, `CreateAccountController.js` (RN-005),
`DeleteReservationController.js`, `CancelReservationController.js`, `CancelContractController.js`, `CheckOutController.js`,
`reservationChangeGuard.js`, `UpdateReservationController.js` e o índice `accounts_lodging_unique`.
**Achados novos no escopo:** 4 (🔴 1 · 🟡 1 · 🟢 2) · **Repassados:** 0

## Veredito

**REPROVADO**

Três dos seis achados anteriores fecharam. O 🔴-1 também fechou: uma conta só leva o total, e duas contas dividem o total sem dobrar.
O 🟡-1, porém, fechou trocando um defeito por outro. A diária gravada no fechamento (D-39) criou um caminho novo em que **a soma das
diárias das contas deixa de ser o total da reserva**, mesmo com uma conta de diária existindo (N-1, 🔴). O caso é este: a conta da
suíte é fechada com o hóspede hospedado, o que a D-38 permite, e depois as datas mudam. Na prorrogação, a diária extra não entra
em conta nenhuma, e a RN-005 impede abrir outra conta de diária no mesmo quarto. Não existe caminho de correção. No encurtamento,
a conta fica cobrando noites que a reserva não tem mais. O "as abertas absorvem a diferença" da D-39 pressupõe uma conta aberta,
e no caso mais comum da D-40 (uma conta por reserva) ela não existe.

Fora isso, as correções estão sólidas. Rodei de verdade: concorrência de fechamentos (8 rodadas, a soma sempre fecha no total), o pool,
o CHECK e o migrate.

---

## Como reproduzi

Criei um teste temporário (`tests/zz_redteam_t043_delta_tmp.test.js`, **já apagado**) e o rodei sozinho no banco de teste, na branch.
Os cinco cenários passaram e imprimiram estes valores:

```
E close 200 300.00                                ← suíte 3×100, conta fechada com o hóspede hospedado
E prorroga 200 500.00                             ← PUT /reservations/:id { check_out_date: +2 noites }
E nova conta diária 422 "Já existe uma conta cobrando a diária deste quarto nesta estadia (RN-005)"
E checkout 200
E account bill 300.00 reservation bill 500        ← R$ 200 fora de qualquer conta
F encurta 200 100.00                              ← suíte 4×100, conta fechada, depois 1 noite só
F account bill 400.00 reservation bill 100        ← conta cobra R$ 300 a mais que a reserva
G delete 204 bill 200.00                          ← check-out (grava 200) e depois DELETE da reserva
G delete com conta aberta, bill 0.00              ← DELETE com a conta ainda aberta
H 1530.00=999.00+531.00 (×8)                      ← 2 PUT /close simultâneos na mesma reserva
I 1º migrate {"closed":0,"recorded":0} {"accounts":1} CLOSED closed_room_charges= null
I 2º migrate {"closed":0,"recorded":1} closed_room_charges= 200.00
```

Também rodei `account-bill`, `account-close`, `account-items`, `consumption-migration` e `bill-consumptions`: **145 passed**.

---

## Situação de cada achado original

| Achado | Situação | Evidência |
|---|---|---|
| 🔴-1 Multiquarto com uma conta: diária dos outros quartos fora de conta | ✅ **Fechado** | `accountBill.js:135-149`: o rateio agora é entre as **contas** de diária (`pending`), e `pending.length === 1` leva `remaining` inteiro. Teste `multiquarto com uma conta só` (`account-bill.test.js`): 1500 na conta, `grand_total` 1510 no bill da reserva. O anchor é consistente entre as contas: o índice `accounts_lodging_unique (reservation_id, room_id)` garante no máximo uma conta de diária no quarto principal, e o desempate por `opened_at, id` é determinístico. Teste dos centavos com o principal aberto por último: 333,34 / 333,33 / 333,33. |
| 🟡-1 Bill de conta CLOSED muda depois do fechamento | ⚠️ **Fechado no que foi pedido, mas abriu o N-1** | `closeAccount` grava `closed_room_charges` (`accountBill.js:198-206`), e o bill lê o valor gravado quando a conta não está OPEN (`:226-227`). O teste de mudança de preço deu 600 fixo, com a aberta ficando com 1000 − 600. O realinhamento filtra `status: 'OPEN'` (`reservationRoomAccount.js:71`), e o teste confere que o `room_id` da conta fechada não mudou. O congelamento, porém, não tem contrapartida quando **não há conta aberta** para absorver a diferença (N-1). Contas criadas pela migração da T-04.2 no mesmo `migrate` ficam sem valor gravado até o seguinte (N-3). |
| 🟡-2 Fechamento segura uma conexão e pede outra (pool) | ✅ **Fechado** | `pendingLegacyConsumption(reservationId, transaction)` passa a transação nas duas queries (`pendingLegacyConsumption.js:22-35`), e o `CloseAccountController.js:46` passa a dele. Todo o resto do fechamento (`lodgingShare`, `accountTotal`, itens) já recebia `transaction`. Teste com 6 PUTs em paralelo: todos 200, em menos de 10 s (antes, 60 s e 5×500). |
| 🟡-3 Teste prendia "diária some depois da troca" | ✅ **Fechado** | O teste foi invertido e passou a exigir `room_charges: '400.00'` na conta do quarto antigo. Novo teste com duas contas de diária depois da troca: a soma dá 400, nunca 800. |
| 🟢-1 Rota antiga não relia a estadia depois da trava | ✅ **Fechado** | `CreateConsumptionController.js:79-87` relê `status` com `transaction`, depois do `FOR UPDATE` da conta. O teste simula a corrida com um mock da 1ª leitura e espera 422, sem item gravado. |
| 🟢-2 Fechar a suíte desliga a rota antiga | ✅ **Fechado (documentado)** | D-38 e o 422 de `POST /reservations/{id}/consumptions` no Swagger (`swagger.js:984`). |

---

## Achados novos no escopo

### 🔴 N-1 [Dinheiro / D-33, D-39] Conta da suíte fechada no meio da estadia e mudança de datas: a soma das diárias deixa de ser o total, e não há como corrigir
**Onde:** `app/utils/accountBill.js:142-149`, onde `remaining` é dividido só entre `pending`, e a conta gravada não volta a ser recalculada. Também
`app/Controllers/AccountApi/CloseAccountController.js:39-52`, que fecha a conta de diária com a reserva CHECKED_IN sem nenhuma ressalva.
**Cenário (reproduzido, E e F):**
- **E, prorrogação:** suíte 3 × 100 = 300. Check-in, conta ROOM, `PUT /accounts/:id/close` com `room_charges` 300.00 gravado (o hóspede acertou
  o bar, que é o caso que a D-38 descreve como rotina). Depois, `PUT /reservations/:id { check_out_date }` com +2 noites deixa `total_amount` em 500.00.
  `POST /accounts` ROOM no mesmo quarto responde **422 RN-005**, porque a conta fechada continua ocupando o índice `accounts_lodging_unique`.
  Check-out 200. Resultado: conta **300.00**, `GET /reservations/:id/bill` com `room_total` **500**. **R$ 200 de diária não aparecem em conta nenhuma**, e não há
  caminho pela API para pôr esse valor numa conta. Isso vale para qualquer aumento do total (data, quarto extra, troca para categoria mais cara)
  depois que todas as contas de diária estiverem fechadas, e é o caso padrão com uma conta por reserva (rota antiga, migração da T-04.2, check-in da T-04.6).
- **F, encurtamento:** suíte 4 × 100 = 400. Conta fechada com 400.00 e saída antecipada para 1 noite: `total_amount` 100.00. A conta continua
  com **400.00**. O hóspede é cobrado por 3 noites que a reserva não tem mais, também sem caminho de correção, porque não há reabertura.
  A D-39 aceita esse sentido ("o apresentado não é desfeito"), mas o teste dela só mexe no `total_amount` por `Model.update` numa reserva com 2 contas.
  O caso real, com uma conta e a saída antecipada pela API, não foi considerado.

Hoje o saldo cobrado ainda é o da reserva (D-34), então o dinheiro não se perde **hoje**. Mas é exatamente o invariante que reprovou o 🔴-1
("a soma das diárias das contas é o total"). Na T-04.4, quando o pagamento se ligar à conta, a regra `CLOSED → PAID` vai quitar 300 de uma estadia de 500,
ou cobrar 400 de uma de 100.
**Regra violada:** D-33/D-40 (soma = total) e D-39 ("se o total mudar depois, as abertas absorvem a diferença"), que é falsa quando não há conta aberta.
**Correção sugerida (a menor, toda no escopo):** no `CloseAccountController`, recusar com 422 o fechamento de conta `ROOM` com `charges_lodging: true`
enquanto a reserva estiver `CHECKED_IN`. A conta de diária só fecha no encerramento da estadia (`closeReservationAccounts`), quando as datas já
não mudam mais (`reservationChangeGuard` bloqueia CHECKED_OUT e CANCELLED). Acertar o bar com o hóspede hospedado continua possível numa conta
`DIRECT` ou `charges_lodging: false`, e a D-38 deve dizer isso. Fazer o mesmo ajuste no Swagger do `PUT /accounts/{id}/close`. Testes: o cenário E
(prorrogação) e o F (saída antecipada) pela API, exigindo a soma das contas igual ao `room_total` do bill da reserva depois do check-out.
*Alternativa, que mexe em arquivo do Gabriel:* bloquear a mudança de datas e de quartos quando houver conta de diária fechada. Ela é pior, porque trava a operação.

### 🟡 N-2 [Dinheiro / D-35 × D-39] Reserva excluída: a conta fechada antes da exclusão segue cobrando diária, e a aberta não
**Onde:** `app/utils/accountBill.js:226-227`, onde o valor gravado vence o `reservation` ausente; `config/swagger.js:136`; anexo D-35.
**Cenário (reproduzido, G):** estadia de 200, check-out (grava 200.00) e `DELETE /reservations/:id` pelo ADMIN: o bill da conta mostra **200.00**.
A mesma exclusão com a conta ainda aberta dá **0.00**. Antes do delta, os dois casos davam 0. Agora o resultado depende da ordem, e o
Swagger continua dizendo "0 … com a reserva cancelada/excluída (D-35)".
A D-35 trata a exclusão como "correção de cadastro" (reserva duplicada, por exemplo), e nesse caso a diária gravada é cobrança indevida, que a T-04.4 vai tentar quitar.
**Regra violada:** D-35 e o contrato documentado do campo `room_charges`. A colisão entre a D-35 e a D-39 não foi decidida no anexo.
**Correção sugerida:** decidir e registrar no anexo. Se a exclusão vence: no `lodgingShare`/`accountBill`, reserva ausente (excluída) dá 0 mesmo com valor gravado,
ou o `DeleteReservationController` zera `closed_room_charges` das contas fechadas na mesma transação. Se o gravado vence: corrigir o texto do Swagger
e da D-35. Nos dois casos, um teste com "check-out → DELETE".

### 🟢 N-3 [Dados / D-37] No upgrade direto (T-04.2 e T-04.3 juntas), as contas que a migração de consumo cria ficam sem diária gravada até o próximo `migrate`
**Onde:** `command.js:53-60`, onde `closeEndedStayAccounts` roda **antes** de `migrateConsumptions`, e `database/migrateConsumptions.js:62-66`, que insere `CLOSED` sem `closed_room_charges`.
**Cenário (reproduzido, I):** reserva CHECKED_OUT com consumo legado e sem conta. 1º migrate: `recorded: 0`, a migração cria a conta `CLOSED` e
`closed_room_charges` fica **null**. Só o 2º migrate grava 200.00. É o caminho real de produção: a `main` ainda não tem a T-04.2, então o 1º `migrate`
da release cria todas essas contas. O ensaio do autor partiu de um banco no estado do develop, com a T-04.2 já migrada, e por isso não pegou o caso.
O dano é baixo: com uma conta por reserva encerrada, o cálculo na hora é o `total_amount`, que não muda depois do check-out. Mas a D-37 afirma que as
contas da D-30 recebem o valor, e no 1º migrate isso não acontece.
**Correção sugerida:** separar o passo 2 (gravar a diária das fechadas) e chamá-lo também **depois** de `migrateConsumptions`, ou corrigir o texto da D-37.

### 🟢 N-4 [Robustez] `closeAccount` é exportado e faz UPDATE sem filtro de status
**Onde:** `app/utils/accountBill.js:198-206` (`where: { id, tenant_id }`).
**Cenário (lido no código):** hoje os três chamadores travam e conferem OPEN antes: `CloseAccountController.js:39`, `closeReservationAccounts.js:30`
(`FOR UPDATE ... status = 'OPEN'`, reavaliado depois da espera) e `closeEndedStayAccounts.js:27-35` (`FOR UPDATE OF a ... status = 'OPEN'`). No teste
"fechamento manual × check-out", 8 rodadas, o `closed_at` não foi reescrito. Mas a função é pública e não se protege: um chamador futuro sem trava
regravaria `closed_at` e `closed_room_charges` de uma conta já fechada, ou de uma PAID na T-04.4.
**Correção sugerida:** `where: { id, tenant_id, status: 'OPEN' }` e lançar erro se `affected !== 1`.

---

## Respostas ao foco pedido

1. **A soma é sempre o total?** Com todas as contas de diária abertas, ou fechadas no encerramento, **sim**. Verifiquei fechamento parcial,
   mudança de preço, aumento do total com uma aberta, troca de quarto, duas contas depois da troca, conta excluída (o `findAll` é paranoid, a conta
   excluída sai do rateio e a outra absorve; não existe rota de DELETE de conta) e o migrate (passo 1 grava com as legadas como pendentes, passo 2
   grava o resto em ordem de reserva, `closed_at` e `id`; a soma fecha). **Não** quando todas as contas de diária estão fechadas e o total muda (N-1),
   nem no total menor que o já gravado: aí a soma **passa** do total (F). A D-39 aceita esse segundo caso, mas sem o caso real.
2. **Concorrência:** sem ciclo de travas. Encerramento trava reserva → contas (em ordem de id). Fechamento manual e lançamento travam só a conta.
   O migrate trava só contas. Dois `PUT /close` simultâneos na mesma reserva (H, 8 rodadas): 999 + 531 = 1530 em todas, porque as duas veem a
   outra como pendente com os mesmos pesos, ou a segunda vê a primeira gravada; nos dois casos a soma fecha. `closeAccount` sem filtro de status: N-4, latente.
3. **CHECK × dados no upgrade:** o `sync({ alter })` cria a coluna nula antes do `applyDbConstraints`, e todas as linhas existentes satisfazem os dois CHECKs.
   Se o `sync` falhar, o migrate já aborta antes dos dados (`command.js:49`). No `schema.sql`, o `ADD COLUMN IF NOT EXISTS` cobre a tabela já existente.
   Nenhum caminho reabre conta, então o CHECK `only_closed` não tem violação possível.
4. **Contrato do `GET /reservations/:id/bill`:** `GetBillController.js`, `calculateStayTotal.js` e `tests/bill-consumptions.test.js` não aparecem em
   `git diff develop...HEAD`. O teste da D-40 confere `grand_total` 1510. A coluna nova aparece em `GET /accounts/:id` e está no schema `Account` do Swagger.

## Repassados a outro dev
Nenhum. A correção sugerida para o N-1 fica no `CloseAccountController`, que é deste dev.

## O que foi verificado e está correto
- **Tenant:** `lodgingShare` filtra `tenant_id` na reserva, nas contas e nos quartos. `closeAccount` filtra `tenant_id`. A releitura do 🟢-1 filtra `tenant_id`.
  As queries globais do migrate são intencionais e usam o `tenant_id` da própria conta no rateio.
- **INTERNAL/TABLE/DIRECT** gravam 0.00. Reserva cancelada pelo `closeReservationAccounts` grava 0, porque o status é salvo antes. O `DeleteReservation`
  faz `destroy` antes de fechar, então a conta aberta grava 0.
- **Aritmética:** BigInt em todo o rateio, piso 0 no `remaining`, sem divisão por zero (peso 1 se faltar preço).
- **ESM**, sem `require()`. Não há log com PII (`error.message`).
- **Swagger:** `closed_room_charges` no schema `Account`, a descrição de `room_charges` atualizada (exceto o ponto do N-2) e o 422 da rota antiga.

## Não foi possível verificar
- A suíte completa (767) e a 2ª rodada de mutação não foram reexecutadas. Rodei os 5 arquivos ligados ao delta: 145 passed.
- O anexo `SPEC-04-decisoes-T-04.3.md` ainda não foi commitado, e auditei a versão do working tree.
- Corrida entre o `PUT /room-categories` e dois fechamentos simultâneos (pesos diferentes nas duas contas): a janela é teórica, não foi reproduzida.
