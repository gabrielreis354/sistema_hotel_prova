# QA Red Team — T-04.2 Migração de `consumptions` para `account_items`

**Branch:** `feature/t04-2-consumption-migration` (`08fe278`) · **Dev:** Sirlande · **Base:** develop@`754d278` · **Data:** 19/10/2026
**Arquivos auditados:** 17 (diff `develop...HEAD`): `migrateConsumptions.js`, `command.js`, `applyDbConstraints.js`,
`reservationRoomAccount.js`, `itemAsConsumption.js`, `accountEnums.js`, `AccountItemModel.js`, `ConsumptionModel.js` (removido),
`relations.js`, `db/schema.sql`, os 3 controllers de `ConsumptionApi/`, `GetBillController.js`, `config/swagger.js`,
`tests/consumption-migration.test.js` e `tests/accounts-db.test.js`.
Para ter contexto, li também: `CreateAccountController`, `CreateAccountItemController`, `DeleteAccountItemController`, `ListAccountController`,
`accountRouter.js`, `reservationRouter.js`, `roles.js`, `UpdateReservationController.js` (troca de quarto) e `start.sh` (como o
migrate roda no cluster). Também SPEC-04 §5 e o anexo D-1..D-24, além das D-25..D-28 descritas no pedido.
**Achados no escopo:** 7 (🔴 1 · 🟡 3 · 🟢 3) · **Repassados:** 0

## Veredito
**REPROVADO**: um achado 🔴 de perda financeira (🔴-1). O caminho de dados (cópia, idempotência, rollback, tenant)
está correto e foi provado num banco real. O 🔴 está no que acontece com o **sistema** quando a migração falha, e a correção é pequena.

---

## Ensaio em banco real (como foi feito)

1. Criei uma worktree do `develop`@`754d278` e um banco descartável `qa_t042_rt`. Rodei o `node command.js migrate` do develop.
   O caminho `schema.sql` + migrate quebra no enum de `event_quotes`, um bug já registrado e fora do escopo. Por isso o banco
   foi provisionado só pelo sync do develop, que cria `consumptions` pelo `ConsumptionModel`.
2. Alimentei o banco **pela API do develop**: 2 hotéis, 7 reservas e 10 consumos. Os casos cobertos são: reserva PENDING com um
   consumo excluído por ADMIN, um consumo com `consumed_at` +2 dias (o develop aceitava), reserva CHECKED_IN com conta ROOM aberta
   por `/accounts` e item "Água 2×5,00", reserva CHECKED_OUT com 0,10 + 0,20, reserva CANCELLED, reserva soft-deletada, reserva
   de quarto soft-deletado e consumo no hotel B. Antes da troca, guardei o `bill` e a lista de cada reserva.
3. Rodei o `node command.js migrate` **da branch**. O resultado foi: `10 item(ns), 6 conta(s) de suíte criada(s)`. A tabela
   `consumptions` ficou com o md5 idêntico ao de antes (D-27 ok). Os ids, valores, `deleted_at`/`deleted_by`, `created_at` e
   tenant batem linha a linha. A conta CHECKED_IN aberta por `/accounts` foi reaproveitada.
4. Comparei `bill` e lista com o snapshot do develop. Saíram **byte a byte iguais** em 5 das 7 reservas. Das duas diferentes, a
   CHECKED_IN ganhou o item da T-04.1 (+10,00), como a decisão "todas as contas da reserva" prevê. A outra diferença é o 🟡-1.
5. Rodei o migrate de novo: 0 itens, 0 contas, idempotente. Mas foi aqui que apareceu o 🟡-1.
6. Testei 12 POSTs paralelos na rota antiga numa reserva sem conta: todos deram 201, com **1 conta** e 12 itens. A corrida
   na criação da conta está ok.
7. Injetei uma linha fora da faixa num hotel e uma legítima em outro, e rodei o migrate: deu o 🔴-1.

Apaguei o banco e a worktree no final.

---

## Achados no escopo

### 🔴-1 [Dinheiro] Migração que falha deixa o app no schema novo servindo `bill` sem os consumos antigos, em todos os hotéis
**Onde:** `services/core-service/command.js:55` (a migração de dados roda **depois** do sync e das constraints, já commitados),
`database/migrateConsumptions.js:45-59` e `:113-116` (qualquer pré-checagem ou divergência aborta **tudo**, de todos os tenants),
`app/Controllers/ReservationApi/GetBillController.js:36` (lê só `account_items`, sem saber se ainda há consumo não migrado).
Na implantação, `start.sh:94` roda o migrate com `kubectl exec deploy/backend`, ou seja, **depois** que os pods novos já estão
no ar.
**Cenário (reproduzido):**
1. No develop, a API aceitava qualquer `amount > 0`, sem teto: `Number(amount) <= 0` era a única checagem, e a coluna era
   `NUMERIC(12,2)`. Um recepcionista do hotel A digitou `150000000` por engano.
2. O deploy da branch sobe os pods novos, e o operador roda `./start.sh migrate`. O sync adiciona `origin`/`consumed_at` e as
   constraints passam. Depois disso, `migrateConsumptions` lança "1 consumo(s) com amount fora de 0 a 99999999.99… Nada foi
   migrado", e o processo sai com código 1.
3. O schema já é o novo, então os pods novos funcionam sem erro, mas `account_items` não tem nenhum consumo legado de **nenhum**
   hotel. No ensaio, o hotel B tinha um frigobar legítimo de R$ 250,00 ainda não migrado. `GET /reservations/:id/bill` devolveu
   `consumptions_total: 44, balance_due: 244` em vez de 294/494, sem nenhum aviso.
4. Até alguém corrigir a linha e rodar o migrate de novo, todo check-out de qualquer hotel cobra o hóspede **a menos**.

O rollback dos **dados** é total, como prometido. O problema é que o **sistema** fica num estado intermediário que funciona
(fail-open): a falha de um tenant derruba a cobrança correta de todos. O mesmo vale para qualquer exceção dentro da
transação, inclusive a verificação linha a linha (`erradas > 0`).
**Regra violada:** fail-safe em vez de fail-open (CLAUDE.md §7). A SPEC-04 §riscos tem "Migração da T-04.2 perder dado
financeiro" como 🔴 Alto.
**Correção sugerida (a menor):** o `bill` e a lista antiga devem recusar com 503, deixando explícito que a migração está
pendente, quando a reserva ainda tiver consumo pendente. A consulta é barata e tem o mesmo predicado da migração:
`to_regclass('public.consumptions') IS NOT NULL AND EXISTS (SELECT 1 FROM consumptions c WHERE c.reservation_id = :id AND NOT
EXISTS (SELECT 1 FROM account_items ai WHERE ai.id = c.id))`. Assim nenhum hóspede é cobrado a menos, e o DELETE antigo de
um id ainda não migrado também deixa de devolver 404 sem explicação. Como alternativa ou complemento, registre no runbook que o
migrate da T-04.2 precisa rodar e passar **antes** de os pods novos receberem tráfego. Também é bom um teste que simule a
falha e confira o bill.

### 🟡-1 [Dados] O backfill de `consumed_at` roda em **todo** `migrate` e reescreve, sem deixar rastro, dado migrado e lançamento legítimo
**Onde:** `database/applyDbConstraints.js:301-302` (`UPDATE account_items SET consumed_at = created_at WHERE consumed_at >
created_at + interval '1 minute'`, sem filtro de origem e sem condição de "só uma vez"). Também
`app/Controllers/ConsumptionApi/CreateConsumptionController.js:33`, que aceita `consumed_at` até +5 min.
**Cenário (reproduzido):**
- **Legado:** o consumo "Jantar agendado" tem `consumed_at` 21/10 e `created_at` 19/10, e o develop aceitava data futura.
  O 1º migrate copia fiel, e a verificação linha a linha passa. No 2º migrate, que é qualquer deploy seguinte, o backfill
  troca o `consumed_at` para 19/10 e **não mexe em `updated_at`**. Depois disso, `account_items` diverge de `consumptions`
  (a trilha da D-27): a query do ensaio retornou essa linha com valores diferentes. A ordem e a data no `bill` mudam.
- **Rota nova:** `POST /reservations/:id/consumptions` com `consumed_at = agora + 4 min` dá 201 (reproduzido). No próximo deploy
  o valor é reescrito em silêncio.
- **Ao contrário:** o item "Água", lançado por `/accounts` 16 s antes do migrate, ficou com `consumed_at` = hora do migrate,
  depois do `created_at`, porque a folga de 1 min o protege da correção. É o caso que a D-26 diz ser impossível.

**Regra violada:** imutabilidade da trilha financeira (CA-04.2.b/c, D-27). Também a D-26, que manda a rota recusar data no
futuro, enquanto o banco "corrige" para trás no deploy seguinte.
**Correção sugerida:** o backfill tem de ser **único**. Por exemplo, só rodar no mesmo migrate em que a coluna nasceu (checar
`information_schema` antes do sync), ou limitar a `origin = 'ACCOUNT' AND consumed_at >= <instante do sync>`. Nunca pode tocar
`LEGACY_CONSUMPTION`. Também é preciso alinhar as duas folgas (5 min na rota e 1 min no backfill).

### 🟡-2 [Operação/D-28] Contas ROOM criadas `OPEN` para estadias encerradas, canceladas ou excluídas, que nunca fecham e enchem a lista do garçom
**Onde:** `database/migrateConsumptions.js:66-79`, que cria a conta OPEN para **toda** reserva com consumo, de qualquer status
e inclusive soft-deletada. `app/utils/reservationRoomAccount.js:35-50` faz o mesmo na rota antiga para reserva CANCELLED
ou CHECKED_OUT.
**Cenário (reproduzido):** depois do migrate, `GET /accounts?status=OPEN` (a tela do garçom, D-15) mostra
`Suíte 103` (CHECKED_OUT), `Suíte 104` (CANCELLED), `Suíte 105` (reserva **excluída**) e `Suíte 101` (PENDING), lado a lado com a
única que está de fato em uso, `Suíte 102 — Maria`. Num hotel em produção isso vira dezenas de "Suíte 101" abertas, uma por
estadia antiga com consumo. O garçom não consegue lançar nelas (D-22 devolve 422), então não há cobrança indevida. Mas não
tem como saber qual é a atual. O anexo diz que a conta ROOM "fecha no check-out" (pendência 6, T-04.3), e **essas já passaram
do check-out**: nenhum fluxo vai fechá-las. Depois de `PUT /reservations/:id/cancel`, `POST /reservations/:id/consumptions`
continua dando 201 e mantém a conta aberta.
**Regra violada:** a máquina de estados da conta fica incoerente com a da reserva. A D-28 previa a exceção para **lançar**, não
para manter a conta aberta para sempre.
**Correção sugerida:** na migração, a conta de reserva com `status IN ('CHECKED_OUT','CANCELLED')` ou `deleted_at IS NOT NULL`
deve nascer `CLOSED` com `closed_at`. Mesmo sem a T-04.3, o status CLOSED já existe na allowlist. Na rota antiga, a mesma
regra vale ao **criar** a conta. Outra opção é registrar a pendência explícita para a T-04.3 fechar essas contas em lote.

### 🟡-3 [Dinheiro futuro] A troca de quarto depois de um consumo deixa duas contas cobrando diária na mesma reserva
**Onde:** `app/utils/reservationRoomAccount.js:28-35` (a conta é procurada por `reservation.room_id` **atual**) e
`UpdateReservationController.js:49-85` (a troca de `room_id` não toca nas contas).
**Cenário (reproduzido):** uma reserva PENDING no quarto 201 recebe um consumo, e a conta `Suíte 201` é criada com
`charges_lodging: true`. Depois `PUT /reservations/:id { room_id: 202 }` dá 200, e um novo consumo dá 201. A reserva fica com
**duas** contas ROOM `charges_lodging: true`: `Suíte 201` e `Suíte 202`. A primeira aponta para um quarto que não pertence mais à
reserva, coisa que o `CreateAccountController` recusaria, porque valida o quarto contra o `reservation_rooms`. Hoje o `bill`
soma certo, porque ignora a diária das contas. Mas a RN-005 diz que é "uma conta cobrando diária por quarto da estadia", e o
fechamento por conta da T-04.3 vai cobrar a diária duas vezes, ou cobrar a de um quarto que o hóspede não usou. Com a D-28,
esse caminho fica comum: a troca de quarto antes do check-in é rotina, e antes da T-04.2 não havia conta ROOM antes do check-in.
**Regra violada:** RN-005 / D-3, e "conta de suíte pertence à estadia e ao quarto" (D-5).
**Correção sugerida:** na rota antiga, reutilizar qualquer conta `charges_lodging` da reserva em vez de filtrar pelo `room_id`
atual. Ou então fazer a troca de quarto atualizar `room_id` e `label` da conta da suíte ainda sem fechamento, na mesma
transação. A troca de quarto pertence ao módulo de reservas. Se a decisão for mexer no `UpdateReservationController`, alinhar
com o dono antes.

### 🟢-1 [Concorrência] O DELETE antigo lê o item antes de travar a conta: o mesmo item é excluído N vezes
**Onde:** `app/Controllers/ConsumptionApi/DeleteConsumptionController.js:27-45`. O `findOne` do item fica fora do lock, e o
`FOR UPDATE` da conta só vem depois.
**Cenário (reproduzido):** 3 DELETEs concorrentes no mesmo item deram três respostas 204 em 19 de 20 rodadas. O segundo e o
terceiro regravam `deleted_at`/`deleted_by`, e com dois ADMINs a trilha registra quem excluiu **por último**. O dinheiro não
muda, porque o item sai do total uma vez só. O `DeleteAccountItemController` não tem o problema: trava a conta primeiro e
busca o item depois, já filtrando os excluídos. O develop tinha o mesmo defeito, então não é regressão.
**Correção sugerida:** depois do lock, buscar o item de novo com `transaction`, ou travar antes e buscar depois, como o
`/accounts` faz.

### 🟢-2 [Validação] A rota antiga aceita entradas que a `/accounts` recusa
**Onde:** `CreateConsumptionController.js:25-44`.
**Cenário (reproduzido):** `amount: "0.001"` ou `0.004` dá 201 com um item **faturável de R$ 0,00**. Isso é uma cortesia sem
motivo, o caso que a D-21 fechou em `/accounts`. Além disso, `amount: true` dá 1,00, `amount: [5]` dá 5,00 e
`consumed_at: 0` dá 1970. Uma `description` de 5.000 caracteres dá 201, quando o limite em `/accounts` é 200. A maior parte disso
já existia no develop, mas agora a rota antiga grava na mesma tabela que a `/accounts` protege.
**Correção sugerida:** reaproveitar o `parsePrice` e o regex de 2 casas de `productValidation.js`, além do mesmo teto de
`description`. Recusar `cents === 0`.

### 🟢-3 [Migração] A verificação linha a linha não confere tudo que o CA promete
**Onde:** `database/migrateConsumptions.js:101-111`.
**Cenário:** a verificação compara `total`, `consumed_at`, `deleted_*`, `tenant` e `origin`. Não compara `created_at` (que é o
próprio CA-04.2.b), `description`, `unit_price`/`quantity`, nem se a conta do item pertence **à reserva do consumo**. Hoje o
INSERT está certo, e nenhum desses campos divergiu no ensaio. Mas a verificação existe justamente para pegar o dia em que o
INSERT mudar.
**Correção sugerida:** acrescentar `ai.created_at IS DISTINCT FROM COALESCE(c.created_at, c.consumed_at)`,
`ai.description <> c.description`, `ai.unit_price <> c.amount OR ai.quantity <> 1`, e um JOIN com `accounts` exigindo
`a.reservation_id = c.reservation_id AND a.tenant_id = c.tenant_id`.

---

## Repassados a outro dev
Nenhum. O migrate do develop quebra num banco provisionado por `db/schema.sql` (enum `event_quotes_status`). Encontrei isso no
ensaio, mas o problema já está registrado em relatórios anteriores (`redteam_docker-compose-rabbitmq_21set2026.md` e outros).

## O que foi verificado e está correto
- **Sem perda nem duplicação (CA-04.2.a):** 10/10 consumos viraram itens com o mesmo id e o mesmo valor. O `ON CONFLICT (id)
  DO NOTHING` e o filtro `NOT EXISTS` sobre `account_items` (que inclui os soft-deletados, por ser SQL cru) tornam a migração
  idempotente. O 2º e o 3º migrate deram 0/0.
- **Rollback dos dados:** uma linha fora da faixa abortou sem item nem conta criados (ensaio e teste `valor acima da coluna`).
- **CA-04.2.b/c:** `created_at`, `deleted_at` e `deleted_by` foram preservados. O excluído ficou fora do bill e da lista.
- **Tenant:** a pré-checagem `consumo.tenant ≠ reserva.tenant` aborta. A conta herda o tenant da reserva, e todas as queries
  novas (`reservationConsumptionItems`, DELETE e POST) filtram `tenant_id` no item **e** na conta. Testei uma reserva de outro
  hotel e um item de outra reserva: 404.
- **Reserva e quarto soft-deletados:** a migração não filtra `deleted_at` em `reservations`/`rooms`, então nada fica para trás.
  `reservationRoomAccount` usa `paranoid: false` no quarto.
- **Concorrência na criação da conta:** 12 POSTs paralelos resultaram em 1 conta (índice parcial `accounts_lodging_unique` mais
  a nova busca).
- **Contrato:** bill e lista ficaram byte a byte iguais ao develop em 5/7 reservas. As diferenças são as previstas e a do 🟡-1.
  Campos, tipos (`amount` string na lista, number no bill), ordenação e códigos foram mantidos.
  `tests/bill-consumptions.test.js` não foi alterado no diff. A suíte teve 698 testes verdes.
  Observação: na **resposta do POST**, `amount` passou de "o que o cliente mandou" (o develop devolvia `50`, número) para
  `"50.00"`. Isso agora segue o Swagger (`type: string`), e o cliente tipado já espera string.
- **D-27:** a tabela `consumptions` ficou intacta (md5 igual antes e depois). Não sobrou `ConsumptionModel` nem `require()`.
- **D-25:** o CHECK `created_by IS NOT NULL OR origin = 'LEGACY_CONSUMPTION'` foi aplicado, e o `DROP NOT NULL` explícito
  funcionou num banco do develop.
- **LGPD:** o rótulo é `Suíte <número>`, sem nome. Os logs passaram a `error.message`, sem objeto. Não há PII nova.
- **D-28 e garçom:** o WAITER não alcança `/reservations/*` (allowlist em `roles.js`). Assim a exceção não fura a D-21 nem a D-22
  para o garçom. Lançar via `/accounts` numa conta criada pela rota antiga continua exigindo CHECKED_IN.
- O DELETE antigo de item lançado por `/accounts` exige ADMIN, faz o mesmo lock e grava `deleted_by`. Equivale ao DELETE novo.
- O Swagger cobre os campos novos (`origin`, `consumed_at`, `created_by` nulável) e os 422/403 das rotas antigas.

## Não foi possível verificar
- Volume real de produção: o ensaio teve 10 linhas. Não medi o tempo de lock nem o tamanho do `IN (:ids)` com dezenas de
  milhares de consumos. O ideal é trocar por um `NOT EXISTS` direto nas queries, em vez de passar a lista de ids.
- Banco provisionado por `db/schema.sql` seguido de migrate: está bloqueado pelo bug conhecido do enum de `event_quotes`, fora
  do escopo.
- O comportamento na T-04.3 (fechamento), que ainda não existe. Os 🟡-2 e 🟡-3 são riscos para ela.
