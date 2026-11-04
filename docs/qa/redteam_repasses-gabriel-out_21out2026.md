# QA Red Team — repasses de conta do quarto e webhook PIX FAILED
**Branch:** fix/repasses-gabriel-out · **Dev:** Gabriel (agente executor) · **Base:** develop@c6742b2 · **Data:** 21/10/2026
**Commits auditados:** 9402818, 568bc7a, 0d31d72, 59650de, 54e5da0
**Arquivos auditados:** 11 no diff (`roomChangeAccounts.js`, `UpdateReservationController`, `RemoveRoomFromReservationController`, `PixWebhookController`, `config/swagger.js`, `tests/reservation-room-accounts.test.js`, `tests/account-bill.test.js`, `tests/asaas-webhook.test.js`, 2 repasses, relatório). Também li os caminhos que travam conta ou reserva: `CreateAccountItem`, `DeleteAccountItem`, `CreateAccount`, `Create/DeleteConsumption`, `CreatePayment`, `accountBill.js` (`lockAccount`, `settlePaymentAccount`), `accountPayments.js` (ordem D-45), `reservationRoomAccount.js` (D-32), `closeReservationAccounts`, `CheckOut`/`Cancel`/`DeleteReservation`, `db/schema.sql` (`accounts_lodging_unique`).
**Achados no escopo:** 5 (🔴 0 · 🟡 2 · 🟢 3) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Os dois repasses estão fechados. A conta aberta acompanha a troca de quarto na mesma transação. O ramo FAILED do webhook relê o pagamento com lock e não sobrescreve mais um PAID paralelo. A ordem de trava segue a D-48 nos dois chamadores, e não achei ciclo de trava com check-out, fechamento, pagamento, lançamento ou webhook.

Ficam duas ressalvas 🟡, as duas na remoção de quarto extra:
- a remoção pode apagar a **única** conta de diária da estadia, e a diária some de todas as contas (reproduzido);
- o novo 409 não tem saída operacional: hóspede que consumiu no quarto extra e desiste dele mantém a diária do extra no total.

Nenhuma das duas perde dado nem grava valor errado, e as duas têm caminho manual. Por isso não reprovam.

**Suíte completa** em banco próprio (`pg-qarep`, postgres:17, porta 5446, removido no fim): 40 arquivos, **851 passed, 1 skipped**. Cobertura: Statements 83,53 %, Branches 79,08 %, Lines 85,91 %. `roomChangeAccounts.js` tem 100 % de linhas.

As reproduções usaram um teste temporário, `tests/zz_qarep_scratch.test.js`, apagado depois de rodar. As mutações foram desfeitas com `git checkout`. O `.env.test` foi restaurado, e o working tree ficou limpo.

### Prova de que os testes não dão falso verde (mutação)
| Mutação | Teste que pega | Resultado |
|---|---|---|
| `openAccountsOfRoom` sem `status: 'OPEN'` | "conta fechada não muda de quarto" e "conta fechada no extra não bloqueia nem é apagada" | 2 falhas |
| pagamento fora do `busy` | "conta aberta com pagamento no extra: 409" | falha |
| `if (taken > 0)` → `if (false)` | "dado legado: o quarto novo já tem conta de diária → 409" | falha |
| rótulo sempre sobrescrito | "rótulo escolhido pela recepção não é sobrescrito" | falha |
| webhook FAILED sem a reconferência `!== 'PENDING'` | "PAID grava primeiro: o FAILED atrasado não sobrescreve" | falha |

---

## Achados no escopo

### 🟡-1 [Dinheiro · rateio D-40] A remoção do extra apaga a única conta de diária, e a diária da estadia sai de todas as contas
**Onde:** `services/core-service/app/utils/roomChangeAccounts.js:94-115`. O `destroy` está na linha 113, e nada confere se sobra outra conta com `charges_lodging: true`.

**Cenário (reproduzido):**
1. Reserva CHECKED_IN com o quarto principal A e o extra C (2 noites × 200 cada).
2. A recepção abriu só uma conta, a do quarto C, com `charges_lodging: true`. Ela está vazia. O bill dela mostra `room_charges: 800.00`.
3. `DELETE /reservations/:id/rooms/C` → **204**. O `total_amount` da reserva passa a 400,00.
4. Contas de diária da reserva depois da remoção: **0**. Os R$ 400 da estadia no quarto A não aparecem em nenhum bill de conta. No check-out, o `closeReservationAccounts` fecha zero contas, e nada apresenta a diária.

Antes desta branch, a conta de C continuava existindo, e pela D-40 ("o peso de cada conta é o preço do quarto dela, inclusive se o quarto saiu da reserva") ela levava o total. A correção troca "conta apontando para o quarto errado" por "diária sem conta". É o mesmo sintoma do 🔴-1 que originou a D-40.

O caso exige que a única conta de diária esteja no extra, o que é estreito mas possível. A família pode abrir a conta no quarto onde o titular dorme, que não é o principal da reserva. A recepção ainda consegue abrir uma conta no quarto A depois. Por isso classifiquei 🟡, e não 🔴.

**Regra violada:** D-40 (o total da reserva é dividido entre as contas que cobram diária, e nunca fica sem conta). O próprio JSDoc da linha 83 diz "ela passa para as contas que ficam pelo rateio da D-40", e isso é falso quando não fica nenhuma.

**Correção sugerida:** em `releaseRemovedRoomAccounts`, se a conta vazia cobra diária e não há outra conta de diária desta reserva fora do quarto removido, **mover** a conta para o quarto principal em vez de apagá-la. Isso reaproveita o `moveRoomAccounts`, com o mesmo cuidado de rótulo, e é o que o `realignStaleLodgingAccount` (D-32) já faria. Teste: o cenário acima, conferindo `count(charges_lodging) === 1` e `room_charges === '400.00'` na conta que ficou.

---

### 🟡-2 [Operação] O 409 da remoção não tem saída: o hóspede que consumiu no extra não consegue devolver o quarto
**Onde:** `services/core-service/app/utils/roomChangeAccounts.js:99-111` e `RemoveRoomFromReservationController.js:154-157`.

**Cenário:**
1. Família com dois quartos, CHECKED_IN. Na conta do quarto extra há um frigobar de R$ 15.
2. No 2º dia, a família devolve o quarto extra. A recepção chama `DELETE /reservations/:id/rooms/<extra>` e recebe **409** "acerte a conta antes de remover o quarto da reserva".
3. "Acertar" não tem caminho válido:
   - fechar a conta só funciona se ela não cobra diária (D-41);
   - se ela for fechada, a remoção passa, mas a conta fechada fica apontando para fora da estadia (o defeito original, aceito pela D-23);
   - se ela cobra diária, não fecha antes do check-out;
   - não existe transferência de item entre contas.
   A única saída para a conta de diária é o ADMIN excluir o consumo real e relançá-lo em outra conta.
4. Sem isso, o total continua com as diárias do quarto devolvido, e o hóspede é cobrado por noites que não usou. A recepção pode também excluir o consumo verdadeiro. Ele fica com `deleted_by`, mas some do bill e reaparece relançado à mão.

O executor registrou isso como pendência 🟢-3 do relatório. Eu subo para 🟡: o fluxo é rotineiro em hotel, e o contorno obriga a excluir lançamento financeiro verdadeiro.

**Regra violada:** CLAUDE.md §1 (a feature tem que mapear para a operação real) e o espírito da D-23 (o que foi lançado não é apagado para contornar regra).

**Correção sugerida:** para a conta com item, mover para o quarto principal em vez de recusar. Se o principal já tem conta de diária, mover com `charges_lodging: false` (vira conta dividida da suíte, D-5). O consumo fica intacto e a conta passa a apontar para dentro da estadia. A mudança de `charges_lodging` precisa de decisão do Sirlande, dono de `accounts`. Se não houver acordo, manter o 409 e registrar como decisão (D-xx), com o contorno oficial documentado.

---

### 🟢-1 [Concorrência] Lançamento de item concorrente com a remoção do quarto devolve 500
**Onde:**
- causa: `services/core-service/app/Controllers/AccountApi/CreateAccountItemController.js:147-152`. O `locked` pode ser `null`, e `locked.status` lança `TypeError`;
- gatilho novo desta branch: `roomChangeAccounts.js:113`. É a primeira operação em runtime que faz soft delete de conta. Antes, não havia rota para isso.

**Cenário (reproduzido):**
1. O garçom lança "Água" na conta vazia do quarto extra.
2. Ao mesmo tempo, a recepção remove o quarto.
3. O `CreateAccountItem` leu a conta antes de abrir a transação e depois espera a trava dela.
4. A remoção faz o commit do soft delete. O `SELECT … FOR UPDATE` é reavaliado com `deleted_at IS NULL` e volta vazio.
5. Resultado: **500 "Erro interno do servidor"**, quando o certo seria 404 ou 422.

Nada é gravado, e a próxima tentativa da fila responde 404. O `CreatePaymentController` já trata `null` com 404, e o `DeleteAccountItem` também.

**Regra violada:** Fail Fast / contrato de erro (500 para condição esperada).
**Correção sugerida:** `if (!locked) { await transaction.rollback(); return response.status(404).json({ error: 'Conta não encontrada' }); }`. A linha está no arquivo do Sirlande (T-04.1), então convém avisá-lo junto com a pendência 2 do relatório do executor.

### 🟢-2 [Contrato] O 409 da troca não diz qual conta bloqueia, e manda "fechar" o que não fecha
**Onde:** `roomChangeAccounts.js:61-62` e `UpdateReservationController.js:98`.

**Cenário:**
1. Em dado legado, o `PUT /reservations/:id {room_id}` responde 409 "feche ou ajuste as contas antes de trocar".
2. A resposta não traz `account_ids`, ao contrário do 409 da remoção. A recepção não sabe qual conta é.
3. "Feche" é impossível para uma conta de diária com a estadia em andamento (D-41).

**Correção sugerida:** devolver `account_ids` com as contas de diária do quarto novo e trocar o texto por "ajuste as contas (…) ou peça ao administrador". Declarar `account_ids` no schema do 409 do PUT.

### 🟢-3 [Testes] Corrida do webhook depende de `setTimeout(400)`, e a conta excluída não tem autor
- `tests/asaas-webhook.test.js:330`: a segunda resposta do Asaas mockado sai 400 ms depois. Se a primeira notificação levar mais que isso para gravar (CI lento), as duas chegam juntas no lock. O teste continua passando, mas deixa de exercitar a corrida descrita. Sugestão: liberar a segunda resposta por um sinal de "primeira gravou", por exemplo um spy no `PaymentModel.prototype.save`, em vez de tempo.
- O caso "FAILED grava primeiro" já passava antes da correção, porque o ramo PAID tinha lock. É um teste de simetria, não um RED, e o relatório do executor diz isso corretamente.
- `roomChangeAccounts.js:113`: o soft delete da conta não registra quem removeu, porque `AccountModel` não tem `deleted_by`. A conta está vazia, então não há valor envolvido. Mesmo assim, é a primeira exclusão de conta do sistema, e a pergunta "quem apagou a conta do 902?" fica sem resposta. Sugestão: registrar em log estruturado (sem PII), ou pedir `deleted_by` ao Sirlande.

---

## Repassados a outro dev
Nenhum. O 🟢-1 está no escopo, porque esta branch tornou o caminho alcançável. A correção sugerida cai num arquivo do Sirlande, e está sinalizada no próprio achado.

## O que foi verificado e está correto
- **Ordem de trava (D-48):** os dois chamadores travam a reserva antes (`UpdateReservationController.js:33-37`, `RemoveRoomFromReservationController.js:22`). Depois, `openAccountsOfRoom` trava as contas com `ORDER BY id`. Conferi os outros caminhos:
  - check-out, cancelamento e exclusão: reserva → contas;
  - `lockAccount` (pagamento com conta e fechamento): reserva → conta;
  - `CreateAccountItem`, `DeleteAccountItem` e `CreateConsumption`: só a conta, com leitura da reserva sem trava;
  - webhook PAID: pagamento → reserva → contas, e nenhum outro caminho trava pagamento.

  Não há ciclo.
- **Lançamento × remoção:** com a conta travada pela remoção, o item concorrente espera. Depois do commit, ele vê a conta excluída (🟢-1) ou, na ordem inversa, a remoção vê o item e responde 409. Não sobra item órfão em conta apagada.
- **Tenant isolation:** todas as consultas novas filtram `tenant_id` a partir da reserva lida com tenant do JWT: contas, `count`, quartos, itens e pagamentos. Os testes de outro hotel devolvem 404 e não mexem na conta.
- **Soft delete da conta vazia:**
  - item e pagamento excluídos não contam (paranoid);
  - pagamento direto na conta conta;
  - o crédito rateado da reserva (D-45, `account_id` nulo) não fica gravado na conta, porque é recalculado na leitura. Apagar a conta vazia move a fatia dela para as que ficam, sem perda.
  - Se a conta apagada era a titular (D-42), o sinal passa a aparecer em outra conta. Isso é só apresentação, de conta ainda aberta.
- **Índice `accounts_lodging_unique`** (`db/schema.sql:336`) inclui contas fechadas. O `count` sem filtro de status, em `roomChangeAccounts.js:57`, está alinhado com ele. Sem o 409, a troca bateria no índice e viraria 500.
- **Rótulo:** só o rótulo gerado pelo sistema (`roomAccountLabel`, reaproveitado sem duplicar) acompanha a troca. `paranoid: false` no quarto preserva o histórico.
- **Webhook FAILED:**
  - relê com `LOCK.UPDATE` dentro da transação;
  - a allowlist `!== 'PENDING'` é fail-safe;
  - responde `already_processed` como o ramo PAID;
  - `if (!transaction.finished)` evita rollback duplo.

  O RED do 1º teste de corrida é real (mutação M5).
- **Teste do Sirlande** (`tests/account-bill.test.js:270-272`): a alteração é justificada. Pela API, o estado "duas contas de diária depois de uma troca" deixou de existir. O teste reconstrói o dado legado direto no banco, e a asserção (dividir sem dobrar, soma 400) ficou igual. O teste vizinho, "troca → bill do stale = 415", continua sem alteração e passa a cobrir a conta movida. Não esconde regressão.
- **Swagger:** o PUT documenta o novo 409 (RN-005) e o efeito nas contas. O DELETE documenta o 409 com `account_ids` e o soft delete. O corpo de sucesso das duas rotas não mudou. O schema inline do 409 do DELETE mantém `error: string`, compatível com quem lia `Error`.
- **Contrato fora dos 409:** o 200 do PUT devolve a mesma reserva, e o 204 do DELETE continua igual. O único efeito colateral novo é a mudança de `room_id`/`label` das contas abertas, que está documentada. Máquina de estados da reserva: sem mudança.
- **ESM, transação, sem `require()`, sem PII em log:** OK.

## Não foi possível verificar
- **Deadlock sob carga real:** a análise de ordem de trava foi feita lendo o código. Não rodei laço de concorrência troca × check-out × pagamento.
- **Cliente tipado do frontend:** `frontend/packages/api-client/openapi.json` não foi regenerado, e não tem nem `/accounts` (última geração em 07/10). A defasagem é anterior a esta branch e não tem portão no CI, então não pesa no veredito. Quem for consumir os 409 novos no front precisa rodar `pnpm --filter @hotel/api-client generate`.
- **Dado de produção:** não sei quantas reservas já estão no estado legado ("conta de diária no quarto antigo"). Esse número diz com que frequência o 409 da troca vai aparecer na recepção.
