# QA Red Team — T-04.3 Bill da conta e fechamento

**Branch:** `feature/t04-3-account-bill` (`47a5ffa`) · **Dev:** Sirlande · **Base:** develop@`2ad97fc` · **Data:** 19/10/2026
**Arquivos auditados:** 16 (diff `develop...HEAD`, 7 commits `f70d461..47a5ffa`): `accountBill.js`, `closeReservationAccounts.js`,
`GetAccountBillController.js`, `CloseAccountController.js`, `CreateAccountItemController.js` (comentário), `accountRouter.js`,
`closeEndedStayAccounts.js`, `command.js`, `config/swagger.js`, os 4 controllers do Gabriel (`CheckOut`, `CancelReservation`,
`DeleteReservation`, `ContractApi/CancelContract`) e `tests/account-{bill,close,items}.test.js`.
Para ter contexto, li também: `calculateStayTotal.js`, `accountTotal.js`, `pendingLegacyConsumption.js`, `roles.js`,
`reservationRoomAccount.js` (realinhamento D-32), `CreateAccountController.js`, `DeleteAccountItemController.js`, os 2 controllers
de `ConsumptionApi/` que escrevem, `UpdateReservationController.js`, `recalculateReservationTotal.js`, `reservationChangeGuard.js`,
o trigger `reservations_sincroniza_quartos`, `migrateConsumptions.js` (status das contas que ela cria), `database/connections/sequelize.js`,
a SPEC-04 §T-04.3 e os anexos D-1..D-38.
**Achados no escopo:** 6 (🔴 1 · 🟡 3 · 🟢 2) · **Repassados:** 0 novos (1 complemento ao repasse já existente para o Gabriel)

## Veredito
**REPROVADO.** Um achado 🔴 de dinheiro (🔴-1). O rateio só fecha com o total da reserva quando **todo** quarto da reserva tem a
própria conta de diária. No caso mais comum, uma reserva multiquarto com **uma** conta só (a que a rota antiga cria, e a que o
check-in da T-04.6 vai criar por padrão), a diária dos outros quartos não entra em conta nenhuma. A D-33 promete
"soma das diárias das contas é sempre o total da reserva", e o código não cumpre isso. A correção é pequena e fica toda em `lodgingShare`.

---

## Como reproduzi

Criei um teste temporário (`tests/zz_redteam_t043_tmp.test.js`, **já apagado**) e rodei sozinho na branch, no banco de teste
(`npx vitest run tests/zz_redteam_t043_tmp.test.js`). Os quatro cenários abaixo passaram e imprimiram estes valores:

```
A bill 900.00 910.00                         ← conta única de uma reserva de 1500.00
A old reservation bill ... "room_total":1500,"grand_total":1510
A closed bill CLOSED 900.00 910.00
B close 200 0.00 10.00                        ← conta fechada sem diária depois da troca de quarto
B post /accounts 422 {"error":"Já existe uma conta cobrando a diária ... (RN-005)"}
B closed bill after CLOSED true 400.00 410.00 ← a conta CLOSED mudou de quarto e de valor
B legacy after close 422 {"error":"Conta CLOSED não aceita consumo novo"}
C 200 [ '200.00', '200.00' ] [ 'CLOSED 100.00', 'CLOSED 300.00' ]
D 60023 ms [ 500, 500, 500, 200, 500, 500 ]   ← 6 fechamentos simultâneos
```

---

## Achados no escopo

### 🔴-1 [Dinheiro / D-33] Na reserva multiquarto com uma conta só, a diária dos outros quartos não é cobrada em conta nenhuma
**Onde:** `services/core-service/app/utils/accountBill.js:68-76` (`shareOf` e a sobra calculada sobre **todos** os quartos do pivô)
**Cenário (reproduzido, A):** reserva com Luxo (300) como principal e Standard (200) como extra, 3 noites, `total_amount` 1500.00.
Check-in, depois `POST /reservations/:id/consumptions` (rota antiga), que cria **uma** conta ROOM no quarto principal. O
`GET /accounts/:id/bill` mostra `room_charges` **900.00** e `total` 910.00, e o `GET /reservations/:id/bill` mostra `grand_total` 1510.
Depois do check-out, a conta fica `CLOSED` com 910.00. Os **R$ 600,00** do quarto extra não aparecem em conta nenhuma.
O mesmo acontece:
- com qualquer conta aberta por `/accounts` só no quarto principal;
- quando a conta do extra é `charges_lodging: false`;
- com as contas que a migração da T-04.2 criou para reservas multiquarto antigas (ela cria só a conta do principal: `migrateConsumptions.js:62-82`);
- e, quando a T-04.6 entrar, no caminho padrão do check-in ("Check-in sem body cria 1 `Account`", CA-04.6.a).

O teste `tests/account-bill.test.js:144` só cobre o caso em que cada quarto tem a sua conta, e o ensaio do autor (540+810) também.
O resultado é que o caso quebrado não tem cobertura.
**Regra violada:** D-33 ("a soma das diárias das contas é sempre o total da reserva, centavo por centavo"). A alternativa
descartada pela própria D-33 ("os outros quartos ficam com 0") virou o comportamento real: o principal fica com uma fração e os outros ficam com 0.
**Correção sugerida:** ratear só entre os quartos que **têm** conta cobrando diária (`charges_lodging: true`, não excluída,
de qualquer status). A conta do quarto principal fica com `total − Σ partes das outras contas de diária`, ou seja, recebe também a parte dos
quartos sem conta própria. Se não existir conta de diária no principal, a sobra fica com a conta de diária de menor `opened_at`. Faltam
testes para: (i) 2 quartos e 1 conta, com a conta ficando com 1500; (ii) 3 quartos e contas no principal e em 1 extra, com a soma igual a 1500.

### 🟡-1 [Dinheiro / D-23] O bill de uma conta `CLOSED` muda depois do fechamento
**Onde:** `services/core-service/app/utils/accountBill.js:33-77`, onde `lodgingShare` recalcula a cada leitura a partir do `total_amount`, do pivô
e do preço **atual** das categorias. Também `app/utils/reservationRoomAccount.js:43-80`: o realinhamento não confere o status da conta.
**Cenários (reproduzidos):**
- **C:** reserva de 2 quartos com categorias de 100 e 100, uma conta em cada quarto e check-out. As duas contas ficam `CLOSED` com 200.00 cada.
  Depois, `PUT /room-categories/:id { price_per_night: 300 }` em uma das categorias. As mesmas contas `CLOSED` passam a mostrar **100.00 e 300.00**.
- **B:** conta da suíte, troca de quarto e `PUT /accounts/:id/close`, que fecha com `room_charges` 0.00 e `total` 10.00. Em seguida,
  `POST /accounts` ROOM no quarto novo responde **422**, mas antes disso o `realignStaleLodgingAccount` já moveu o `room_id` da conta
  **CLOSED**. A conta passa a mostrar **400.00 / 410.00**. Uma requisição que falhou alterou um registro fechado.

**Regra violada:** D-23 e o comentário de `CloseAccountController.js:11-12` ("o que foi apresentado ao cliente não muda mais").
Na T-04.4, a regra `CLOSED → PAID` vai comparar o pagamento com um saldo que se move sozinho.
**Correção sugerida:** congelar a diária no fechamento. A forma mínima é gravar `room_charges` (ou `lodging_amount`) na conta quando ela vai para
`CLOSED` (no `CloseAccountController` e no `closeReservationAccounts`) e o `accountBill` usar o valor gravado quando `status !== 'OPEN'`.
No `realignStaleLodgingAccount`, filtrar `status: 'OPEN'`.
Se gravar a diária for considerado "persistir saldo" (CA-04.3.b), vale lembrar que o CA proíbe persistir o **balance**, não a diária apresentada. Registrar isso como decisão.

### 🟡-2 [Disponibilidade] `PUT /accounts/:id/close` segura uma conexão e pede outra: 5 fechamentos simultâneos travam o pool por 60 s
**Onde:** `services/core-service/app/Controllers/AccountApi/CloseAccountController.js:25-46`. A transação abre (conexão 1) e trava a conta. Depois,
`pendingLegacyConsumption(account.reservation_id)` roda **sem** a transação e pede a conexão 2. O pool é o padrão do Sequelize (máx. 5, sem
configuração em `database/connections/sequelize.js`).
**Cenário (reproduzido, D):** 6 contas ROOM e 6 `PUT /accounts/:id/close` em paralelo. Cada fechamento segura uma conexão e espera outra.
O pool esgota e todo o backend fica parado até o `acquire` estourar: **60 023 ms**, `[500, 500, 500, 200, 500, 500]`, log
`CloseAccountController: Operation timeout`. Não houve dado corrompido, porque tudo voltou atrás. Mas durante esse minuto nenhuma rota responde, inclusive o
lançamento do garçom. Basta somar 5 transações em andamento de qualquer rota, e a recepção fechando contas no fim do turno é exatamente o pico.
**Regra violada:** KISS/robustez. Nenhuma outra rota de `/accounts` faz *hold-and-wait* de conexão.
**Correção sugerida:** chamar `pendingLegacyConsumption` **antes** de `sequelize.transaction()`. O consumo antigo só some, não aparece no meio da operação,
então a checagem prévia basta. Outra opção é aceitar `transaction` em `pendingLegacyConsumption` e repassá-la.

### 🟡-3 [Teste que trava o bug] O teste da D-32 afirma que a diária some depois da troca de quarto
**Onde:** `services/core-service/tests/account-bill.test.js:204-220`
**Cenário (reproduzido, B):** reserva com 1 quarto (400.00) e troca de quarto com `PUT /reservations/:id`. O teste espera
`room_charges: '0.00'` e `total: '15.00'` na única conta da estadia, e não exige que **outra** conta cobre os 400.00. A diária da estadia inteira
fica fora das contas. A conta pode ser fechada assim (B: `close 200 0.00 10.00`) e o check-out fecha do mesmo jeito.
A D-33 §3 diz que "o risco de dinheiro do N-1 está neutralizado". O que foi neutralizado foi a cobrança dupla, que virou cobrança **zero**.
**Regra violada:** D-33 (soma = total) e o critério de teste "teste que passaria com a regra de negócio quebrada".
**Correção sugerida:** a causa raiz é do módulo de reservas e já está repassada ao Gabriel (`para_gabriel_19102026.md`, 🟡 troca de quarto).
No escopo desta branch, a correção do 🔴-1 já resolve: a conta de diária cujo quarto saiu do pivô deve ser tratada como a "conta de diária
sem quarto próprio" e receber a sobra, em vez de 0. Outra opção é chamar `realignStaleLodgingAccount` no bill e no fechamento, só para conta `OPEN`.
O teste deve passar a afirmar `room_charges: '400.00'`.

### 🟢-1 [Documentação / D-36] O "limite conhecido" diz que a conta aberta na corrida não recebe item, mas pela rota antiga ela recebe
**Onde:** D-36, "Limite conhecido", × `app/Controllers/ConsumptionApi/CreateConsumptionController.js:58-80`. A checagem
`CLOSED_STAY_STATUSES` é feita **antes** da transação e não se repete depois do `FOR UPDATE` da conta.
**Cenário (lido no código, SUSPEITA não reproduzida, porque depende de intercalar duas requisições):** a reserva CHECKED_IN ainda não tem conta. O
`POST /reservations/:id/consumptions` lê CHECKED_IN, e nesse momento o check-out confirma sem conta para fechar. A rota antiga então cria a conta OPEN e
a trava, e como `locked.status === 'OPEN'` o item **entra**. A conta fica OPEN numa estadia encerrada até o próximo `migrate`.
O dinheiro não se perde, porque o item fica gravado e cobrado. Mas a D-36 afirma que "ela não recebe item", e isso só é verdade em `/accounts`.
**Correção sugerida:** reler `reservation.status` dentro da transação, depois da trava, como o `CreateAccountItemController` faz para ROOM. Também dá para só corrigir o texto da D-36.

### 🟢-2 [Operação] Fechar a conta da suíte durante a estadia desliga a rota antiga de consumo até o fim da hospedagem
**Onde:** `CloseAccountController.js` (D-38 permite fechar com o hóspede hospedado) × `reservationRoomAccount.js:84-91`. A rota antiga
pega a conta de diária sem filtrar status.
**Cenário (reproduzido, B):** depois do `PUT /accounts/:id/close`, todo `POST /reservations/:id/consumptions` responde
`422 Conta CLOSED não aceita consumo novo`. Uma conta nova pela recepção só sai com `charges_lodging: false`, porque a RN-005 recusa outra conta de diária.
O frontend que ainda usa a rota antiga perde o lançamento de frigobar nas noites que restam. Isso não está registrado na D-38 nem no Swagger do `POST /reservations/{id}/consumptions`.
**Correção sugerida:** registrar na D-38 e na descrição do 422 da rota antiga. Se for preciso, fazer a rota antiga abrir uma conta ROOM `charges_lodging: false` quando a conta de diária estiver fechada.

---

## Repassados a outro dev
Nenhum achado novo. Acrescentei um complemento ao repasse 🟡 de troca de quarto que já existia
(`docs/qa/repasses/para_gabriel_19102026.md`): com a T-04.3, o efeito deixou de ser "diária cobrada duas vezes" e passou a ser
"diária não cobrada". Isso não muda a correção sugerida, só a prioridade.

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | (complemento) troca de quarto deixa a conta de diária no quarto antigo e agora zera a diária | `UpdateReservationController.js:85-90` | Gabriel | `docs/qa/repasses/para_gabriel_19102026.md` |

## O que foi verificado e está correto
- **Tenant:** `GetAccountBill` e `CloseAccount` fazem `findOne` com `tenant_id`, e outro hotel recebe 404. `lodgingShare` filtra `tenant_id` na reserva
  e nos quartos, o pivô é lido pela reserva já validada, os itens são filtrados por `tenant_id`, e `closeReservationAccounts` filtra `tenant_id` e `status: 'OPEN'`.
- **WAITER:** a allowlist de `roles.js` não casa `/accounts/:id/bill` nem `PUT .../close` (regex de um segmento), e `requireRole('ADMIN','RECEPTIONIST')`
  repete a regra. Os testes de 403 existem.
- **Rotas:** `/:id/bill` e `/:id/close` têm segmento literal depois do `:id` e não colidem com `GET /:id`.
- **Rateio, aritmética:** BigInt nos produtos, `new Set` cobre quarto duplicado no pivô, a sobra dos centavos fica no principal (o teste B2B dá 333,34 + 333,33 + 333,33),
  reserva cancelada ou excluída dá 0 (D-35), INTERNAL dá 0 (CA-04.3.f), e uma categoria sem preço leva à divisão igual, sem divisão por zero.
- **Concorrência das travas:** lançamento, exclusão de item e fechamento travam a conta. Check-out, cancelamento, cancelamento de contrato e exclusão travam a reserva
  e depois as contas pelo `UPDATE`. Nenhum caminho trava reserva depois de conta, então não há ciclo. Fechamento manual e check-out simultâneos:
  o `UPDATE ... status='OPEN'` reavalia a linha depois da espera e não reescreve o `closed_at`.
- **Fechamento automático:** as 4 transições chamam `closeReservationAccounts` dentro da transação, antes do `commit`. `DeleteReservation` passou a usar
  transação e `FOR UPDATE`, e o rollback é seguro. `closeEndedStayAccounts` é um `UPDATE` só (atômico), filtra `deleted_at IS NULL` na conta, inclui reserva
  soft-deletada, é idempotente e roda antes de `migrateConsumptions`. A migração já cria como `CLOSED` as contas de estadia encerrada (`migrateConsumptions.js:74-76`).
- **Contrato antigo:** `GetBillController.js` e `tests/bill-consumptions.test.js` não aparecem no diff.
- **LGPD:** o bill não traz `guest_id`, nome, documento nem `created_by` dos itens (`ITEM_ATTRIBUTES`). Os `console.error` registram só `error.message`.
- **Swagger:** as duas rotas novas estão documentadas, com o schema `AccountBill`, 401/403/404/422/503, e o efeito colateral está descrito nas 3 rotas de reserva.
- **ESM:** sem `require()`. O `import()` dinâmico em `command.js` segue o padrão do arquivo.

## Não foi possível verificar
- **🟢-1** não foi reproduzido: precisa intercalar check-out entre duas consultas da rota antiga, e o harness não tem ponto de injeção. Ficou confirmado só pela leitura do código.
- O comportamento do pool em produção (K8s) não foi medido. O 🟡-2 foi medido com o pool padrão (5), que é o configurado em `sequelize.js`.
- A suíte completa (750) e as 22 mutações do autor não foram reexecutadas. Rodei só o arquivo de reprodução.
- O cancelamento de contrato não está no Swagger do core-service (ponto em aberto 4 do anexo, do Gabriel), então o contrato da API dessa rota não foi conferido contra a documentação.
- Durante a auditoria apareceu, no working tree e sem commit, uma alteração de outra sessão em `tests/account-close.test.js`: `describe('Diária gravada no fechamento (D-39)')`, com a coluna `closed_room_charges`. Ela parece tratar o 🟡-1. **Não foi auditada**, porque não está em `47a5ffa`. Quando entrar em commit, precisa de reauditoria delta, inclusive para conferir se a "aberta leva o resto do total" não reabre o 🔴-1.
