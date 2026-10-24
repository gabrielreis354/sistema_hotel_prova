### 2026-10-21 — Gabriel (agente executor)

- **Branch:** `fix/repasses-gabriel-out` (a partir de `origin/develop` em `c6742b2`), com push feito. Sem PR e sem merge, como pedido.
- **Objetivo da sessão:** corrigir dois defeitos que o qa-redteam repassou ao Gabriel: a conta do quarto na troca e na remoção de quarto (🟡, repasse de 19/10) e o ramo FAILED do webhook PIX sem lock (🟢, repasse de 17/10).

#### O que foi feito

**1. Troca e remoção de quarto levam junto a conta aberta** (RN-005 / D-3, D-5)

- `PUT /reservations/:id` com `room_id` novo: na mesma transação, as contas `ROOM` **OPEN** do quarto que sai passam para o quarto novo. Isso vale para a conta de diária e para as contas divididas sem diária. O rótulo gerado pelo sistema ("Suíte 906") acompanha; o rótulo escolhido pela recepção fica. Conta CLOSED ou PAID não muda (D-23, D-39). Se o quarto novo já tem conta de diária desta reserva, a troca responde **409** (RN-005). Esse estado só existe em dado legado, de antes desta correção.
- `DELETE /reservations/:id/rooms/:roomId` (quarto extra):
  - conta OPEN **vazia** (sem item e sem pagamento não excluídos): é desligada (soft delete) na mesma transação;
  - conta OPEN **com item ou pagamento**: a remoção é recusada com **409**, mensagem clara e `account_ids`;
  - conta fechada ou paga: não bloqueia a remoção e não é tocada.
- **Por que essa regra é a mais segura:**
  - A diária de uma conta aberta nunca foi gravada (D-39). O valor é calculado a cada leitura e passa para as contas que ficam pelo rateio da D-40. Desligar uma conta vazia não desfaz nada que já foi apresentado.
  - Apagar uma conta com consumo ou dinheiro sumiria com registro financeiro. Deixá-la apontando para um quarto fora da estadia é o próprio defeito do repasse. Por isso, recusar é o caminho fail-safe.
  - Só desligar `charges_lodging` deixaria uma conta ROOM vazia apontando para fora da estadia, o que fere a D-5.
  - A alternativa "recusar sempre que houver conta aberta" travaria a remoção para sempre: a conta de diária não fecha antes do check-out (D-41), e não existe rota para excluir conta.
- **Trava:** a reserva é travada primeiro, depois as contas em ordem de id. É a mesma ordem do projeto (D-48), então não há deadlock com check-out nem com pagamento.
- **Código:** utilitário novo `services/core-service/app/utils/roomChangeAccounts.js` (`moveRoomAccounts` e `releaseRemovedRoomAccounts`). O rótulo é gerado por `roomAccountLabel`, de `reservationRoomAccount.js`, e não foi duplicado. O Swagger (`config/swagger.js`) documenta os novos 409.
- O `realignStaleLodgingAccount` do Sirlande (D-32) **não foi alterado**. Ele continua servindo de rede para o dado legado.
- Ajustei um teste do Sirlande: o caso "duas contas cobrando diária depois de uma troca" em `tests/account-bill.test.js`. Esse estado não surge mais pela API, então o teste agora o reconstrói direto no banco, como dado legado. O que o teste verifica não mudou: as duas contas dividem o total, nunca o dobram.
- Máquina de estados da reserva e regra de fechamento de conta da T-04.3: **sem mudança**.

**Evidência:** o cenário do repasse vive em `tests/reservation-room-accounts.test.js`, com 13 testes: reserva CHECKED_IN, conta da suíte com frigobar, troca de quarto. O teste confere que a conta fica no quarto novo, que o bill mostra `room_charges: 400.00, consumptions: 15.00, total: 415.00`, e que um segundo `POST /accounts` de diária no quarto novo recebe 422. RED (commit `9402818`): 6 falhas pelo motivo certo, por exemplo `expected '<quarto antigo>' to be '<quarto novo>'`, `expected 204 to be 409` e `expected null not to be null`. GREEN em `568bc7a`.

> Observação: o `room_charges: 0.00` citado no complemento do repasse já não acontecia no `develop`, porque a D-40 da T-04.3 passou a ratear a diária entre as contas. O que ainda estava errado era a conta apontando para o quarto antigo. Isso está corrigido e coberto pelo RED acima.

**2. Webhook PIX: o ramo FAILED relê o pagamento com lock**

- O `PixWebhookController`, no ramo FAILED, agora relê o `Payment` com `lock: transaction.LOCK.UPDATE` dentro da transação e só grava se o status ainda for `PENDING` (allowlist). Em qualquer outro status, responde `already_processed`, como o ramo PAID já fazia.
- **Evidência:** dois testes de concorrência em `tests/asaas-webhook.test.js`. As duas notificações leem o pagamento PENDING, e a consulta ao Asaas mockado é segurada até as duas chegarem nela, para a ordem ser determinística.
  - PAID grava primeiro: o resultado tem que ser PAID + CONFIRMED. No RED (`0d31d72`), as respostas eram `[ 'confirmed', 'not_approved' ]`, ou seja, reserva CONFIRMED com sinal FAILED. GREEN em `59650de`.
  - FAILED grava primeiro: FAILED + reserva PENDING. Já passava antes e continua passando.
- Fora do escopo, sem mexer: estorno ou chargeback depois de PAID (T-06.13), `PaymentApi/*` e `paymentRouter.js`.

#### Saída real da verificação

Banco de teste próprio (`pg-repasses`, postgres:17, porta 5443). `npm run test:coverage`, depois de todos os commits de código:

```
 Test Files  40 passed (40)
      Tests  851 passed | 1 skipped (852)
All files          |   83.53 |    79.14 |   88.79 |   85.91 |
Statements   : 83.53% ( 2765/3310 )
Branches     : 79.14% ( 1419/1793 )
Functions    : 88.79% ( 325/366 )
Lines        : 85.91% ( 2500/2910 )
```

Linha de base no `develop` (`c6742b2`), antes das mudanças: 39 arquivos, 836 passed e 1 skipped, Statements 83.4%. São 15 testes novos e nenhuma regressão.

`bash scripts/qa_checks.sh`: `⚠ 3 aviso(s). Nenhum erro bloqueante.` Os 3 avisos já existiam antes e estão em arquivos que esta sessão não tocou: Swagger de `corporate-client`, `event-quote` e `room-category`, e dois avisos de UI em `frontend/`.

#### Commits gerados

| Hash | Mensagem |
|------|----------|
| `9402818` | `test(reservations): RED da conta do quarto na troca e na remocao de quarto` |
| `568bc7a` | `fix(reservations): troca e remocao de quarto levam junto a conta aberta` |
| `0d31d72` | `test(webhooks): RED da corrida PAID x FAILED no webhook PIX` |
| `59650de` | `fix(webhooks): ramo FAILED do webhook PIX rele o pagamento com lock` |
| (este) | `docs(historico): relatorio dos repasses de conta do quarto e webhook` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Rodar o qa-redteam na branch antes do merge em `develop` | 🟡 Média | Foco: `roomChangeAccounts.js` e o novo 409 do DELETE de quarto |
| 2 | Avisar o Sirlande (dono de `accounts`) | 🟡 Média | Três pontos: a troca agora move a conta; a conta vazia do extra removido é desligada por soft delete; ajustei um teste dele em `account-bill.test.js`. O `realignStaleLodgingAccount` continua como rede para dado legado |
| 3 | Escape para conta com lançamento num extra que se quer remover | 🟢 Baixa | Hoje o ADMIN exclui o item e relança em outra conta. Uma rota de transferência de item entre contas resolveria melhor, se aparecer em uso real |
| 4 | 🟢 do repasse de 19/10 ainda abertos | 🟢 Baixa | Catálogo de eventos com `reservation_id: UUID \| null` e estorno depois de PAID (T-06.13) |

---

### 2026-10-21 — Rodada 2: achados da auditoria qa-redteam

- **Origem:** `docs/qa/redteam_repasses-gabriel-out_21out2026.md` (commit `c66e97b`). O veredito foi **APROVADO COM RESSALVAS**, com 0 🔴, 2 🟡 e 3 🟢. Todos foram corrigidos nesta rodada, na mesma branch, sempre RED antes do GREEN.
- **A regra de remoção de quarto extra mudou.** A regra da rodada 1, descrita acima (desligar a conta vazia, 409 na conta com item ou pagamento), está **substituída**.

#### O que mudou

**🟡-1 e 🟡-2 — remoção de quarto extra.** As contas `ROOM` OPEN do quarto removido passam para o **quarto principal** da reserva, na mesma transação e com a mesma ordem de trava (D-48: reserva → contas por id).
- **O principal já tem conta de diária da reserva:** a conta movida passa a `charges_lodging: false` e vira conta dividida da suíte (D-5). Isso preserva a RN-005.
- **O principal não tem:** a conta mantém `charges_lodging` e passa a cobrar a diária.
- **Rótulo:** o gerado pelo sistema acompanha o quarto; o da recepção fica.
- **Conta fechada ou paga:** não muda (D-23).
- **Resultado:**
  - nenhuma conta é apagada (o soft delete de conta saiu do runtime);
  - nenhum consumo ou pagamento se perde;
  - a diária nunca fica sem conta;
  - a remoção não é mais bloqueada por conta aberta. O 409 por conta aberta foi removido, e o Swagger foi atualizado.
- **Cenário do 🟡-1 reproduzido:** principal A, extra C, e a única conta de diária, vazia, em C.
  - Antes: a remoção apagava a conta, e não sobrava nenhuma conta de diária.
  - Agora: a conta vai para A, com `count(charges_lodging) = 1` e `room_charges = 400.00`.

**🟢-1 — `CreateAccountItemController`.** Se a releitura com trava volta vazia (a conta sumiu entre a leitura e a trava), a resposta é **404** com rollback, e não mais 500 (`TypeError`). O teste simula a releitura vazia com um spy no `findOne` que tem `lock`.

**🟢-2 — 409 RN-005 da troca de quarto.** A resposta traz `account_ids` com as contas de diária do quarto novo. A mensagem não manda mais "fechar", porque a D-41 não deixa fechar a conta de diária com a estadia em andamento. Agora ela diz o que a recepção pode fazer: "escolha outro quarto ou peça ao administrador para ajustar essa conta". O schema do 409 do PUT declara `account_ids`.

**🟢-3 — teste de corrida do webhook.** O `setTimeout(400)` foi trocado por um sinal: a segunda resposta do Asaas mockado só sai quando a primeira notificação grava o pagamento (spy no `PaymentModel.prototype.save`). Conferido por mutação:
- com o `PixWebhookController` de antes da correção, o teste falha (`[ 'confirmed', 'not_approved' ]`);
- com a correção, passa em 3 rodadas seguidas.

O soft delete de conta, que era o outro ponto do 🟢-3, deixou de existir com a regra nova.

#### ⚠ Toca `accounts` — precisa do conhecimento do Sirlande

A regra nova de remoção **muda contas**, e `accounts` é do Sirlande. A remoção de quarto extra agora:
- muda `room_id`, e às vezes `label`, de contas abertas;
- pode passar `charges_lodging` de `true` para `false` numa conta aberta. Isso muda quem leva a diária no rateio (D-40) e qual é a conta titular do crédito da reserva (D-42).

Nada que já foi apresentado é desfeito: conta fechada não muda, e a diária de conta aberta não é gravada (D-39). Mesmo assim, é uma regra nova sobre contas e precisa do aval dele.

A guarda de 404 em `CreateAccountItemController.js` também está num arquivo dele (T-04.1). É só uma guarda, sem mudança de regra.

**Sugestão:** registrar a regra como decisão no anexo de decisões da SPEC-04.

#### Saída real da verificação (rodada 2)

Banco próprio (`pg-repasses`, postgres:17, porta 5443). `npm run test:coverage`:

```
 Test Files  40 passed (40)
      Tests  851 passed | 1 skipped (852)
All files          |   83.51 |    79.18 |   88.79 |   85.89 |
Statements   : 83.51% ( 2761/3306 )
Branches     : 79.18% ( 1423/1797 )
Functions    : 88.79% ( 325/366 )
Lines        : 85.89% ( 2497/2907 )
```

O total de testes não mudou em relação à rodada 1. Em `reservation-room-accounts.test.js`, saíram 4 testes da regra antiga e entraram 4: 🟡-1, 🟡-2, conta com pagamento movida, e o 🟢-1. O teste do 409 da troca ganhou as asserções do 🟢-2.

RED da rodada 2 (`0041651`): **5 falhas pelo motivo certo**, com 8 testes passando:
- `expected undefined to deeply equal [ Array(1) ]` (🟢-2);
- `expected AccountModel{…} to match object {…}` (🟡-1);
- `expected 409 to be 204` duas vezes (🟡-2, pagamento);
- `expected 500 to be 404` (🟢-1).

`bash scripts/qa_checks.sh`: `⚠ 3 aviso(s). Nenhum erro bloqueante.` São os mesmos 3 avisos de antes, em arquivos que não toquei.

#### Commits gerados (rodada 2)

| Hash | Mensagem |
|------|----------|
| `0041651` | `test(reservations): RED dos achados da auditoria qa-redteam de 21/10` |
| `4f0e2f7` | `fix(reservations): remocao de quarto extra move as contas para o principal` |
| `c9c2017` | `fix(accounts): lancamento em conta que some antes da trava responde 404` |
| `c91303f` | `test(webhooks): corrida PAID x FAILED sincronizada por sinal, sem setTimeout` |
| (este) | `docs(historico): rodada 2 dos repasses - achados do qa-redteam` |

#### Pendências (atualizadas)

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Aval do Sirlande à regra nova de remoção, que mexe em `charges_lodging` de conta aberta, e à guarda de 404 no `CreateAccountItem` | 🟡 Média | Registrar como decisão no anexo da SPEC-04 |
| 2 | Reauditoria do qa-redteam, com foco na rodada 2 | 🟡 Média | Antes do PR `develop → main` |
| 3 | A pendência 3 da rodada 1 (escape para conta com lançamento) | — | **Resolvida** pela regra nova: a conta é movida, nunca bloqueia |
| 4 | Corrida entre `POST /accounts` de diária no principal e a remoção que move a conta de diária para lá | 🟢 Baixa | O índice `accounts_lodging_unique` recusa a segunda, então não há dado errado, mas a remoção responderia 500. Tratar só se aparecer em uso real |
| 5 | 🟢 do repasse de 19/10 ainda abertos | 🟢 Baixa | Catálogo de eventos com `reservation_id: UUID \| null` e estorno depois de PAID (T-06.13) |
| 6 | Regenerar o cliente tipado (`pnpm --filter @hotel/api-client generate`) | 🟢 Baixa | A defasagem já existia antes desta branch (ver "Não foi possível verificar" da auditoria) |

---

### 2026-10-24 — Rodada 3: achados da reauditoria delta

- **Origem:** `docs/qa/redteam_repasses-gabriel-out_delta_21out2026.md` (commit `6a63194`). O veredito foi **APROVADO COM RESSALVAS**: os 5 achados anteriores fecharam e sobraram 3 🟢 novos.
- Os três foram fechados, com RED antes do GREEN.
- Arquivo de retomada criado: `docs/retomada/fix-repasses-gabriel-out.md`.

#### O que mudou

**🟢 N-1 — deadlock entre a remoção de extra e o `POST /accounts` de diária**
- **Correção certa** (`CreateAccountController.js`, `d17250b`): para conta `ROOM`, a rota agora abre transação e trava a reserva (`FOR UPDATE`) antes de checar o status, o quarto da estadia e a RN-005, e antes do `INSERT`.
  - É a ordem da D-48 (reserva → contas).
  - Quem chega depois espera e enxerga o que o outro gravou. A corrida vira **422 RN-005**.
  - O realinhamento da D-32 continua fora da transação, como antes. Ele só muda `room_id`/`label` de conta e não toca a linha da reserva, então não espera a trava.
  - O contrato da rota não mudou.
- **Defesa na remoção** (`RemoveRoomFromReservationController.js`, `ff3457a`): se o banco ainda escolher a remoção como vítima de deadlock (40P01), a transação volta inteira e é repetida **uma vez**. Se repetir, a resposta é **409** "tente de novo", nunca 500. O Swagger documenta esse 409.
- **Testes:**
  - **Concorrência determinística:** a remoção é pausada logo depois de ler "o principal não tem diária" e só segue quando o `POST` está esperando trava no banco. A espera é por condição (`pg_stat_activity`), não por tempo.
  - RED: deadlock e 500.
  - GREEN: remoção 204, `POST` 422 e uma conta de diária, estável em 5 rodadas.
  - **Mutação:** com o `CreateAccountController` antigo, o teste volta a falhar (`expected 500 to be 422`).
  - Dois testes da defesa, simulando 40P01 com spy:
    - na 1ª tentativa: a remoção repete e responde 204;
    - repetido: 409, e nada muda.

**🟢 N-2 — rótulo duplicado** (`roomChangeAccounts.js`, `ff3457a`)
- A conta movida que **não** vira a conta de diária do principal leva a origem no rótulo gerado pelo sistema: **"Suíte 701 · ex-702"**.
- Por que esse formato:
  - o garçom lista contas só pelo rótulo (D-15), e duas "Suíte 701" no mesmo quarto não se distinguem;
  - manter "Suíte 702" mandaria o garçom a um quarto que saiu da estadia e pode já ser de outro hóspede;
  - com dois extras removidos, os rótulos ficam "ex-702" e "ex-703", distintos entre si.
- A conta que vira a conta de diária do principal fica com "Suíte 701", e o rótulo da recepção nunca muda.

**🟢 N-3 — mutação sobrevivente** (teste em `1de70ad`)
- Novo cenário: o principal tem só conta sem diária, e a única conta de diária está no extra.
- Depois da remoção, a conta movida segue com `charges_lodging: true`, há uma conta de diária e `room_charges` dá 400,00.
- **Mutação conferida:** tirar `charges_lodging: true` de `lodgingAccountsOfRoom` faz o teste falhar.

#### ⚠ Toca `accounts` — precisa do conhecimento do Sirlande (atualizado)

O `CreateAccountController.js` (T-04.1, Sirlande) passou a usar transação e a travar a reserva para conta ROOM. É uma mudança de concorrência, sem regra nova. Soma-se ao que já estava na rodada 2:
- a remoção de extra move contas e muda `charges_lodging` e rótulo;
- a guarda de 404 no `CreateAccountItemController`.

**Sugestão:** registrar tudo numa decisão D-xx do anexo da SPEC-04.

#### Saída real da verificação (rodada 3)

Banco próprio (`pg-repasses`, porta 5443). `npm run test:coverage`:

```
 Test Files  40 passed (40)
      Tests  856 passed | 1 skipped (857)
All files          |   83.58 |     79.2 |   88.64 |      86 |
Statements   : 83.58% ( 2786/3333 )
Branches     : 79.2% ( 1440/1818 )
Functions    : 88.64% ( 328/370 )
Lines        : 86% ( 2519/2929 )
```

São 5 testes novos em relação à rodada 2: N-1 concorrência, 40P01 com nova tentativa, 40P01 repetido, N-2 e N-3.

RED (`1de70ad`): 4 falhas pelo motivo certo, com 14 testes passando:
- N-2: `expected AccountModel{…} to match object {…}`;
- N-1: `expected 500 to be 422`, porque o deadlock derrubou o `POST`;
- defesa: `expected 500 to be 204` e `expected 500 to be 409`.

`bash scripts/qa_checks.sh`: `⚠ 3 aviso(s). Nenhum erro bloqueante.` São os mesmos avisos de antes.

#### Commits gerados (rodada 3)

| Hash | Mensagem |
|------|----------|
| `1de70ad` | `test(reservations): RED dos achados da reauditoria delta de 21/10` |
| `d17250b` | `fix(accounts): POST /accounts de conta ROOM trava a reserva antes da RN-005` |
| `ff3457a` | `fix(reservations): remocao de extra resiste a deadlock e nao duplica rotulo` |
| (este) | `docs(historico): rodada 3 dos repasses e arquivo de retomada` |

#### Pendências (atualizadas)

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Aval do Sirlande e registro como D-xx | 🟡 Média | Cobre a remoção que move contas e muda `charges_lodging`/rótulo, a trava da reserva no `POST /accounts` ROOM e a guarda de 404 no lançamento |
| 2 | Pendência 4 da rodada 2 (corrida remoção × `POST /accounts`) | — | **Resolvida** (N-1) |
| 3 | Comentário desatualizado em `reservationRoomAccount.js:49-50` ("Sobras … ficam para o repasse ao Gabriel") | 🟢 Baixa | Arquivo do Sirlande. Atualizar quando alguém mexer nele |
| 4 | 🟢 do repasse de 19/10 ainda abertos | 🟢 Baixa | Catálogo com `reservation_id: UUID \| null` e estorno depois de PAID (T-06.13) |
| 5 | Regenerar o cliente tipado | 🟢 Baixa | Defasagem anterior a esta branch |
