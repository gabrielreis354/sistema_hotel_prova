# QA Red Team — repasses de conta do quarto e webhook PIX: reauditoria das correções (delta)

**Branch:** `fix/repasses-gabriel-out` (`5f9aa4a`) · **Dev:** Gabriel (agente executor) · **Base:** develop@`c6742b2` · **Data:** 21/10/2026
**Auditoria anterior:** `redteam_repasses-gabriel-out_21out2026.md` sobre `54e5da0`, registrada em `c66e97b`. Veredito: APROVADO COM RESSALVAS, com 🟡-1, 🟡-2, 🟢-1, 🟢-2 e 🟢-3.
**Escopo:** `git diff c66e97b..HEAD`, 5 commits (`0041651`, `4f0e2f7`, `c9c2017`, `c91303f`, `5f9aa4a`), 10 arquivos:
- código: `roomChangeAccounts.js`, `RemoveRoomFromReservationController.js`, `UpdateReservationController.js`, `CreateAccountItemController.js` e `config/swagger.js`;
- testes: `tests/reservation-room-accounts.test.js` e `tests/asaas-webhook.test.js`;
- documentos: 2 repasses e o relatório do executor.

**Contexto lido:**
- `accountCharges.js` (`lodgingShare`, D-40) e `accountPayments.js` (`creditOrder`, D-42/D-45);
- `reservationRoomAccount.js` (`realignStaleLodgingAccount`, D-32) e `CreateAccountController.js` (RN-005);
- `PixWebhookController.js` e `db/schema.sql`: `accounts_lodging_unique`, a FK `accounts.reservation_id` e `accounts_room_requires_stay`.

**Achados novos no escopo:** 3 (🔴 0 · 🟡 0 · 🟢 3) · **Repassados:** 0

## Veredito

**APROVADO COM RESSALVAS**

Os cinco achados anteriores fecharam, e reproduzi cada cenário de novo.
- A remoção do quarto extra não apaga mais conta nenhuma.
- A única conta de diária vai para o principal e continua cobrando a estadia.
- A conta com consumo ou pagamento vai para o principal sem diária, e a remoção não é mais bloqueada.
- A soma das diárias continua igual ao total, e o crédito da reserva continua igual ao pago.
- A RN-005 se mantém nos quatro cenários que montei: um extra, dois extras em sequência, o principal só com conta sem diária e o check-out depois da remoção.

As três ressalvas novas são 🟢:
- a corrida citada pelo executor existe, mas é um **deadlock** do PostgreSQL (`40P01`), e não uma violação do índice. A remoção responde 500, o estado fica consistente e a nova tentativa passa;
- o rótulo duplicado depois da remoção;
- uma lacuna de teste que deixou uma mutação viva.

Nenhuma perde dado nem grava valor errado.

**Suíte completa** em banco próprio (`pg-qarep2`, postgres:17, porta 5452, removido no fim): **40 arquivos, 851 passed, 1 skipped**. Cobertura: Statements 83,51 %, Branches 79,13 %, Lines 85,89 %, acima do portão de 60 %. `scripts/qa_checks.sh`: 3 avisos, todos anteriores a esta branch (Swagger de `corporate-client`, `event-quote` e `room-category`, mais dois avisos de frontend), e nenhum erro bloqueante.

---

## Como reproduzi

Usei um teste temporário, `tests/zz_qarep2_scratch.test.js`, que **já foi apagado**. Rodei esse teste sozinho no banco próprio, na branch, e ele imprimiu estes valores:

```
Q1 [["A","Suíte 701",true,true],["B","Suíte 701",false,true]]      ← 2 contas com o mesmo rótulo no principal
Q2 POST concorrente ainda pendente após 1,5 s: true                 ← preso na FK de reservations (FOR KEY SHARE × FOR UPDATE)
Q2 erro remove SequelizeDatabaseError 40P01 deadlock detected
Q2 remove 500 · POST concorrente 201
Q2 contas [["Extra",true,"extra"],["Concorrente",true,"main"]]     ← rollback limpo, nada pela metade
Q2 retry 204 → [["Concorrente",true,"main"],["Extra",false,"main"]]
Q3 antes  [A,B] [["400.00","0.00","400.00"],["600.00","500.00","100.00"]]   ← B (extra) é a titular D-42
Q3 depois [A,B] [["400.00","500.00","-100.00"],["0.00","0.00","0.00"]]      ← crédito 500 preservado, diária 400 = total
Q4 após e1 [["E2",true,"e2"],["E1",true,"main"]] room_charges ["400.00","600.00"]
Q4 após e2 [["E1",true],["E2",false]]          room_charges ["400.00","0.00"]
Q5 check-out 200 → [["CLOSED",true,"400.00"]]                       ← a conta movida fecha com a diária inteira
Q6 409 {"error":"…(RN-005) — escolha outro quarto ou peça ao administrador…","account_ids":["2ddbb633-…"]}
Q7 [["Acomp",false],["Unica diaria",true]] 400.00                   ← principal só com conta sem diária
```

### Prova de que os testes não dão falso verde (mutação)

Cada mutação foi desfeita com `git checkout`.

| Mutação | Teste que pega | Resultado |
|---|---|---|
| M1 `dropLodging` sempre `false` | 🟡-2 (o principal já tem diária) | falha |
| M2 `dropLodging` sempre `true` | 🟡-1 (a única diária fica no extra) | falha |
| M3 a remoção não chama `relocate` | 🟡-1, 🟡-2 e "conta com pagamento" | 3 falhas |
| M4 `openAccountsOfRoom` sem `status: 'OPEN'` | as duas "conta fechada…" | 2 falhas |
| M5 `lodgingAccountsOfRoom` sem `charges_lodging: true` | **nenhum** | **sobrevive** (N-3). O Q7 pega: a única diária vira `false` e o bill dá `0.00` |
| M6 o 409 da troca sem `account_ids` | "dado legado … 409 (RN-005)" | falha |
| M7 sem a guarda `if (!locked)` | 🟢-1 (releitura vazia → 404) | falha |
| M8 `PixWebhookController` de `0d31d72` (sem a correção), 5 rodadas | "PAID grava primeiro…" | 5/5 falham |
| M9 controller atual, 10 rodadas | os dois testes de corrida | 10/10 passam |

---

## Situação de cada achado original

| Achado | Situação | Evidência |
|---|---|---|
| 🟡-1 A remoção apagava a única conta de diária | ✅ **Fechado** | `roomChangeAccounts.js:120-126`: `moveRemovedRoomAccounts` move a conta e não apaga. `dropLodging` só vale quando o principal já tem conta de diária, e a conferência usa o mesmo predicado do índice (`:33-38`, sem filtro de status e paranoid). Teste 🟡-1: `room_charges` 400,00 e `count(charges_lodging) = 1`. Q5: o check-out fecha a conta movida com 400,00. M2 e M3 provam o teste. |
| 🟡-2 O 409 sem saída operacional | ✅ **Fechado** | A remoção nunca recusa por conta. A conta com consumo ou pagamento vai para o principal com `charges_lodging: false` quando o principal já cobra a diária (D-5, conta dividida). Os itens e os pagamentos não mudam, só `room_id`, `label` e `charges_lodging`. O teste confere o consumo de 15,00 e o pagamento de 50,00 intactos. O Swagger do DELETE perdeu o 409 de conta e documenta a regra nova. |
| 🟢-1 500 em lançamento concorrente | ✅ **Fechado** | `CreateAccountItemController.js:154-157` responde 404 com rollback. Nenhuma rota faz mais soft delete de conta em runtime, então o caminho ficou quase inalcançável. A guarda continua valendo como defesa. O spy só anula o `findOne` com `lock`, e não há outro desses antes da linha 147: o 404 vem da guarda nova. M7 prova. |
| 🟢-2 O 409 da troca sem `account_ids` e com "feche" | ✅ **Fechado** | `roomChangeAccounts.js:84-97` e `UpdateReservationController.js:98`. O texto não manda mais fechar (D-41), e o schema do 409 do PUT declara `account_ids` via `allOf`, compatível com quem lia `RoomOccupied`. Q6 e M6 confirmam. |
| 🟢-3 Corrida do webhook com `setTimeout` | ✅ **Fechado. É determinístico** | `asaas-webhook.test.js:325-341`. A segunda resposta do PSP só sai depois do `save` da primeira notificação. A segunda só grava depois de receber essa resposta. Por isso a ordem "1ª grava → 2ª tenta" vale independentemente da velocidade da máquina. O spy pega qualquer `save` de `Payment`, mas na janela da corrida só as duas notificações gravam: o `book()` roda antes do `race()`, e o restore global é feito em `afterEach` (`:74-80`). Se a gravação mudar para um caminho sem `save`, o teste trava por timeout e falha, sem dar falso verde. M8 (5/5) e M9 (10/10). |

---

## Achados novos no escopo

### 🟢 N-1 [Concorrência] A remoção do extra e um `POST /accounts` de diária no principal geram deadlock: a remoção responde 500
**Onde:** `services/core-service/app/utils/roomChangeAccounts.js:124-125`. A leitura `mainHasLodging` não trava nada, e o `UPDATE` vem depois, em `relocate`, na linha 59. O outro lado está em `CreateAccountController.js:131-157`, que faz a pré-checagem e o `INSERT` sem transação e sem travar a reserva.

**Cenário (reproduzido, Q2):**
1. Reserva CHECKED_IN com o principal A e o extra C. A única conta de diária está em C, e A não tem conta.
2. A recepção remove C. A remoção trava a reserva com `FOR UPDATE` e lê "A não tem diária" (`mainHasLodging = false`).
3. Na mesma janela, outro terminal faz `POST /accounts {room_id: A}` de diária. A pré-checagem passa, porque a conta movida ainda não está gravada. O `INSERT` grava a tupla no índice `accounts_lodging_unique` e fica preso na FK `accounts.reservation_id`: o `FOR KEY SHARE` espera o `FOR UPDATE` da remoção.
4. A remoção faz o `UPDATE` da conta de C para `(reserva, A, lodging)`. O índice único espera a transação do `INSERT`, e o `INSERT` espera a remoção. O PostgreSQL derruba a remoção com **`40P01 deadlock detected`**.
5. Resultado: `DELETE` **500 "Erro interno do servidor"**, e o `POST` responde 201.

Nada fica pela metade: o pivô e a conta de C continuam como estavam. A nova tentativa responde 204, e a conta de C vai para A com `charges_lodging: false`.

**Classificação:** 🟢. A janela vai do lock da reserva ao `UPDATE`, que são algumas consultas. O estado final é consistente, e a nova tentativa resolve. O executor previu o 500 na pendência 4 do relatório, mas atribuiu a causa ao índice. A causa real é um deadlock. Isso importa para a correção: um `catch` de `UniqueConstraintError` não pegaria esse erro.

A troca de quarto (`moveRoomAccounts`) não tem a mesma corrida. O quarto novo só entra em `reservation_rooms` no commit da troca, e antes disso o `POST /accounts` nele responde 422 ("O quarto não pertence a esta reserva").

**Regra violada:** contrato de erro (500 para uma condição esperada) e D-48 na prática. O `POST /accounts` de conta ROOM grava sem passar pela trava da reserva, então a ordem "reserva → contas" não é respeitada por todos os caminhos.

**Correção sugerida:** escolher uma das duas.
- **(a)** Em `CreateAccountController`, para `type === 'ROOM'`, abrir uma transação e travar a reserva (`FOR UPDATE`) antes da pré-checagem da RN-005. Isso alinha o caminho com a D-48, e a corrida vira "espera, depois 422". O arquivo é do Sirlande, então precisa do aval dele.
- **(b)** Na remoção, tratar `40P01` com uma nova tentativa única ou com 409 "tente de novo".

A opção (a) é a correta. A (b) é paliativa.

### 🟢 N-2 [Operação · D-15] A conta movida pega o rótulo do principal, e o garçom vê duas "Suíte 701"
**Onde:** `roomChangeAccounts.js:57`. O `relocate` troca o rótulo gerado pelo sistema mesmo quando a conta passa para um quarto que já tem conta com esse rótulo (`dropLodging`).

**Cenário (reproduzido, Q1):**
1. O principal 701 tem a conta "Suíte 701", que cobra a diária.
2. O extra 702 tem a conta "Suíte 702", aberta pela família do segundo quarto.
3. A recepção remove o 702. Resultado: duas contas abertas chamadas **"Suíte 701"** no mesmo quarto, uma com diária e outra sem.
4. O garçom lista as contas pelo rótulo (D-15, sem nome de hóspede). Ele não tem como saber em qual das duas lançar.

O consumo continua cobrado do mesmo hóspede, então não há perda. Mas a conta dividida perde a identificação, que era justamente o que diferenciava os dois grupos da família.

**Regra violada:** D-15 (a conta é identificada só pelo rótulo) e D-5. A conta dividida existe para separar quem paga o quê.

**Correção sugerida:** com `dropLodging`, manter o rótulo antigo ("Suíte 702"). A outra opção é acrescentar a origem, como "Suíte 701 (ex-702)". Teste: dois rótulos distintos depois da remoção.

### 🟢 N-3 [Testes] Mutação sobrevivente: nenhum teste cobre "principal só com conta sem diária"
**Onde:** `tests/reservation-room-accounts.test.js`, no bloco `DELETE …`. O filtro `charges_lodging: true` de `lodgingAccountsOfRoom` (`roomChangeAccounts.js:34`) pode ser removido sem que nenhum teste falhe (M5).

**Cenário:** com a mutação, a remoção passa a tratar *qualquer* conta do principal como "já tem diária". No caso Q7, o principal tem só uma conta "Acompanhante" sem diária, e a única conta de diária está no extra. A conta movida vira `charges_lodging: false`, e a diária da estadia some de todas as contas (`room_charges 0.00`). É exatamente o 🟡-1 que esta rodada fechou. Hoje o código está certo (Q7 passa), mas uma regressão nessa linha não seria pega.

**Correção sugerida:** acrescentar o cenário Q7 ao bloco do `DELETE`. O principal tem uma conta com `charges_lodging: false`, e a única conta de diária está no extra. Depois da remoção, conferir `count(charges_lodging) = 1` e `room_charges = total`.

---

## Repassados a outro dev

Nenhum. O N-1 nasce da regra nova desta branch. A correção preferida, a opção (a), cai em `CreateAccountController.js`, que é do Sirlande, e isso está sinalizado no próprio achado. A pendência 1 do executor já pede o aval do Sirlande à regra nova: convém levar o N-1 junto.

## O que foi verificado e está correto

- **RN-005 / `accounts_lodging_unique`:** o predicado de `lodgingAccountsOfRoom` é o do índice parcial: sem filtro de status, `deleted_at IS NULL` via paranoid. Nos cenários Q4, Q5 e Q7 e nos testes, o resultado é sempre uma conta de diária por quarto. Uma remoção seguida de outra fica serializada pela trava da reserva, e a segunda enxerga a conta movida pela primeira (Q4).
- **Rateio D-40:** a conta que perde `charges_lodging` sai do `pending` de `lodgingShare`, e o total vai inteiro para a conta de diária do principal. Q3: 400 + 0 = total. A conta fechada do extra não é tocada (D-23), e o teste confirma.
- **Titular D-42 / crédito D-45:** quando a titular era a conta do extra e perde a diária, a titularidade passa para a conta de diária do principal. O crédito de 500 continua somando 500, e o saldo −100 é a devolução prevista pela D-44 (Q3). Só a apresentação das contas abertas muda, e nenhum valor gravado muda.
- **Ordem de trava D-48:** reserva (`FOR UPDATE`) → contas do extra (`FOR UPDATE ORDER BY id`) → `UPDATE` só das linhas travadas. A leitura das contas do principal não trava, porque elas não são escritas. Contra lançamento, pagamento, fechamento, check-out e webhook não há ciclo novo. A única exceção é o `POST /accounts`, que não trava a reserva (N-1).
- **Tenant isolation:** todas as consultas novas usam `reservation.tenant_id`, e a reserva é lida com o tenant do JWT. `roomOf` filtra pelo tenant. O teste de outro hotel devolve 404 e não move a conta.
- **Transação:** o movimento, o `pivot.destroy` e o recálculo correm na mesma transação. No deadlock, o rollback deixa tudo como estava (Q2).
- **Contrato da API:** o 204 do DELETE e o 200 do PUT não mudaram. O 409 de conta do DELETE saiu do código e do Swagger. O 409 do PUT ganhou `account_ids`, sem remover campo.
- **ESM, sem `require()`, sem PII em log:** o `console.error(error)` da remoção imprime só ids e SQL.
- **Comentário desatualizado** fora do diff: `reservationRoomAccount.js:49-50` ainda diz "Sobras (remoção de quarto extra que tinha conta) ficam para o repasse ao Gabriel". É informativo e não é achado. Fica para quem mexer no arquivo.

## Não foi possível verificar

- **Decisão registrada:** a regra nova muda `charges_lodging` de conta aberta, e `accounts` é área do Sirlande. Ainda não existe D-xx no anexo da SPEC-04. O executor registrou isso como pendência 1 (aval do Sirlande). Não pesa no veredito, mas deve ser fechado antes do merge em `develop`.
- **Cliente tipado do frontend:** `openapi.json` não foi regenerado. A defasagem é anterior a esta branch, como já registrado na auditoria anterior.
- **Carga real:** reproduzi o deadlock com um gancho determinístico. Não medi a frequência sob uso concorrente real.
