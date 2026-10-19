# QA Red Team — T-04.2 Migração de `consumptions` para `account_items`: reauditoria das correções (delta)

**Branch:** `feature/t04-2-consumption-migration` (`66fca6c`) · **Dev:** Sirlande · **Base:** develop@`754d278` · **Data:** 19/10/2026
**Auditoria anterior:** `redteam_t042-consumption-migration_19out2026.md` (REPROVADO por 🔴-1; 🟡-1 a 🟡-3 e 🟢-1 a 🟢-3)
**Escopo:** só as correções. `e1ec5e3` (testes RED) e `66fca6c` (fix): `migrateConsumptions.js`, `applyDbConstraints.js`,
`pendingLegacyConsumption.js` (novo), `reservationRoomAccount.js`, `GetBillController.js`, os 3 controllers de `ConsumptionApi/`,
`tests/consumption-migration.test.js` e `tests/accounts-db.test.js`. Para ter contexto, li também: `CreateAccountController`,
`UpdateReservationController`, `RemoveRoomFromReservationController`, `reservationChangeGuard`, `command.js`, `start.sh`,
`config/swagger.js` (rotas de consumo e bill), o anexo D-28 a D-32 e o repasse do dev ao Weslley.
**Arquivos auditados:** 10 (diff) + 9 (contexto)
**Achados novos no escopo:** 6 (🔴 0 · 🟡 2 · 🟢 4) · **Repassados:** 2 (Gabriel e Weslley, ambos 🟡/🟢)

## Veredito

**APROVADO COM RESSALVAS**

O 🔴-1 está fechado, e eu o reproduzi num banco real no estado do `develop` com dois hotéis. A reserva com dado inválido
fica para trás **inteira**. O outro hotel migra. O `migrate` sai com código 1 e lista a reserva. O `bill` dela responde 503,
nunca um valor menor. Corrigido o dado, o `migrate` seguinte migra o resto e sai com 0. Não sobrou nenhum caminho de perda
financeira nas correções.

As ressalvas são estas. O 🟡-3 está **parcialmente** fechado: a correção só funciona quando os dois lançamentos passam pela
rota antiga. Pelo caminho principal (`/accounts`), a reserva ainda termina com duas contas cobrando diária (achado N-1). Além
disso, o Swagger não acompanhou o 503 nem o 422 novo (N-2).

Suíte: 711 testes verdes e 1 ignorado, numa worktree limpa do `66fca6c`. `tests/bill-consumptions.test.js` não foi alterado
contra o develop (CA-04.2.e).

---

## Situação de cada achado original

| Achado | Situação | Evidência |
|---|---|---|
| 🔴-1 Migração que falha deixa o `bill` sem os consumos antigos | ✅ **Fechado** | Ensaio (abaixo): `exit=1`, a reserva do hotel B ficou para trás inteira (inclusive o frigobar legítimo de R$ 250), e as 5 do hotel A migraram. `pendingLegacyConsumption(B)=true` e `(A)=false`. No teste de reprodução com 2 hotéis, o bill de A deu **503** e o de B deu 200 com `consumptions_total: 250`. Depois de corrigir o dado: `exit=0`, 2 itens, total de 1.750,00, e pendente `false`. Chamado sem a tabela antiga, `to_regclass` devolve `false` sem erro de análise (`pendingLegacyConsumption.js:20-23`). Consumo excluído não bloqueia, e há teste para isso. |
| 🟡-1 Reparo de `consumed_at` reescreve dado migrado e lançamento legítimo | ✅ **Fechado** (resíduo aceitável) | `applyDbConstraints.js:305-306` só olha `origin = 'ACCOUNT'`. No ensaio, o "Jantar agendado" (+2 dias) sobreviveu ao 2º `migrate`. Rota antiga com folga de 60 s (`CreateConsumptionController.js:48`), igual à do reparo: um lançamento válido nunca cai no filtro. **Resíduo:** o 3º caso do achado original continua como estava, porque um item de `/accounts` lançado menos de 1 min antes do 1º `migrate` fica com `consumed_at` = hora do migrate. São segundos, e só uma vez. Não vale reabrir. |
| 🟡-2 Contas `OPEN` para estadia encerrada | ✅ **Fechado** para o que foi pedido | Ensaio: CHECKED_OUT, CANCELLED e PENDING soft-deletada nasceram `CLOSED` com `closed_at`. PENDING e CHECKED_IN nasceram `OPEN`. A rota antiga dá 422 para CHECKED_OUT e CANCELLED antes de criar conta (teste `reserva encerrada (%s)`). Ver N-5 para o que continua abrindo depois. |
| 🟡-3 Troca de quarto deixa duas contas cobrando diária | ⚠️ **Parcial** | O cenário original (consumo pela rota antiga → troca → consumo pela rota antiga) está fechado: sobra 1 conta, re-apontada, e há teste. Mas o mesmo estado final ainda se produz quando o 2º passo vai por `POST /accounts` (reproduzido, N-1). |
| 🟢-1 DELETE antigo excluía o mesmo item N vezes | ✅ **Fechado** | `DeleteConsumptionController.js:44-55`: trava a conta e **depois** relê o item na transação. Em READ COMMITTED a releitura vê o `deleted_at` já commitado e devolve 404. Teste com 8 rodadas × 5 DELETEs: exatamente um 204 por rodada. |
| 🟢-2 Entrada mais frouxa que `/accounts` | ✅ **Fechado** | Reproduzi: `"0.001"`, `true`, `[5]`, `1e-7`, `"10."`, `0`, `consumed_at: 0`, `consumed_at: ""`, `description` com 201 caracteres e só espaços dão **400**. `" 10 "` passa como 10,00 (aceitável). |
| 🟢-3 Verificação linha a linha incompleta | ✅ **Fechado** | `migrateConsumptions.js:103-120` confere `description`, `quantity`, `unit_price`, `created_at` (com o mesmo `COALESCE` do INSERT) e `a.reservation_id IS DISTINCT FROM c.reservation_id`. É exatamente o que sugeri. |

---

## Ensaio em banco real (como foi feito)

1. Worktree do `develop`@`754d278` e banco descartável `qa_t042_delta`. Rodei o `node command.js migrate` do develop (sync cria
   `consumptions` pelo `ConsumptionModel`).
2. Por SQL: hotel A com 5 reservas (PENDING com um consumo "Jantar agendado" de +2 dias, CHECKED_OUT, CANCELLED, PENDING
   soft-deletada e CHECKED_IN com um consumo excluído por ADMIN) e hotel B com 1 reserva CHECKED_IN, com frigobar de R$ 250 e
   um consumo de R$ 150.000.000 digitado errado. md5 de `consumptions` registrado.
3. `migrate` da branch: `7 item(ns), 5 conta(s)`, depois `❌ ... 1 reserva(s) ficaram para trás ... Reservas: b0…e0001`,
   **exit=1**. Contas: 101 PENDING `OPEN` · 102 CHECKED_OUT `CLOSED` · 103 CANCELLED `CLOSED` · 104 excluída `CLOSED` · 105
   CHECKED_IN `OPEN`. Os 4 `CLOSED` têm `closed_at`.
4. 2º `migrate`: 0 novos e exit=1 de novo (idempotente). O "Jantar agendado" continuou no futuro. md5 de `consumptions` igual (D-27).
5. Corrigi o valor (`1500.00`). O 3º `migrate` deu `2 item(ns), 1 conta`, **exit=0**, e o pendente de B ficou `false`.
6. Testes de reprodução numa worktree do `66fca6c` (arquivo temporário, já apagado): bill cross-tenant, DELETE de consumo não
   migrado, `EXPLAIN` do pendente, as variantes de troca de quarto, a corrida com `/accounts` e a validação de entrada.

Banco e worktrees apagados ao final.

---

## Achados novos no escopo

### 🟡 N-1 [Dinheiro futuro / RN-005] D-32 só cobre a rota antiga: com `/accounts` no meio, a reserva continua com duas contas cobrando diária
**Onde:** `app/utils/reservationRoomAccount.js:184-185` (sai cedo quando já existe conta no quarto atual, sem olhar as obsoletas)
e `:196-211` (o re-apontamento só roda dentro da rota antiga, de forma preguiçosa). Também
`app/Controllers/AccountApi/CreateAccountController.js:127-137`: a checagem da RN-005 considera só o `room_id` pedido e não
procura conta obsoleta da mesma reserva.
**Cenário (reproduzido):**
1. Reserva PENDING no quarto 904. `POST /reservations/:id/consumptions` → 201, e nasce a conta `Suíte 904` (D-28).
2. `PUT /reservations/:id { room_id: 905 }` → 200, uma troca de rotina antes do check-in. Depois, `PUT .../check-in` → 200.
3. A recepção abre a conta da suíte pela tela nova: `POST /accounts { type: ROOM, room_id: 905, … }` → **201**.
4. `POST /reservations/:id/consumptions` → 201. Ele encontra a conta de 905 e retorna antes do re-apontamento.
5. Resultado: `[Suíte 904, OPEN, charges_lodging]` e `[Suíte nova, OPEN, charges_lodging]`. Uma delas aponta para um quarto fora de
   `reservation_rooms`. É o estado do 🟡-3 original. Em 6 rodadas concorrentes (rota antiga ∥ `/accounts`), 5 terminaram assim.

Variantes reproduzidas, todas pela mesma causa:
- Multiquarto: o extra 2 tem a conta própria e é removido (`DELETE /reservations/:id/rooms/:roomId` → 204). Como o principal já
  tem conta, a do extra fica cobrando diária fora da estadia. Se o extra removido volta como principal, a conta do principal
  antigo é que sobra.
- Duas contas obsoletas (extra removido e principal trocado): só uma é re-apontada, e a escolha depende da ordem do `findOne`,
  sem `order`. A outra fica.
- Migração atrasada (D-31): a reserva fica para trás, recebe consumo pela rota antiga, troca de quarto e depois é migrada.
  O INSERT de `migrateConsumptions.js:77-81` procura só por `r.room_id` e cria a segunda conta.

**Regra violada:** RN-005 / D-3. O commit e o comentário de `reservationRoomAccount.js` prometem "nunca duas cobrando diária".
Hoje o `bill` não soma diária por conta, então não há dinheiro errado **hoje**. O risco é a T-04.3.
**Correção sugerida:** a invariante precisa valer onde a conta nasce e onde o quarto muda, não só na rota antiga.
(a) No `CreateAccountController` (seu, T-04.1), quando há conta `charges_lodging` da reserva num quarto fora de
`reservation_rooms`, re-apontar a conta em vez de criar outra, ou recusar com 422 explicando. (b) Na troca e na remoção de
quarto, re-apontar ou desligar `charges_lodging` na mesma transação. Isso é do Gabriel, ver repasse. (c) Antes da T-04.3,
registrar como critério dela: "fechamento recusa reserva com conta de diária fora de `reservation_rooms`".

### 🟡 N-2 [Contrato] Swagger não documenta o 503 novo nem o 422 por status da reserva, e a descrição do POST ficou falsa
**Onde:** `config/swagger.js:904-913` (`/bill`, sem 503), `:916-922` (GET da lista, sem 503), `:928` ("aceita reserva de
**qualquer status**"), `:939` (400 sem as regras novas: 2 casas, texto ISO, `description` ≤ 200) e `:941` (422 só cita "conta
fechada", não a reserva CHECKED_OUT/CANCELLED).
**Cenário:** o cliente tipado gerado (`frontend/packages/api-client/src/schema.d.ts`) não conhece o 503 do `bill`. Quem
implementar o fechamento de caixa (Weslley, T-05.7) vai tratar o 503 como erro genérico. Hoje nenhuma tela chama essas
rotas, então não há quebra em produção. Mas a documentação contradiz a D-30 na própria rota.
**Regra violada:** CLAUDE.md §6, "endpoint … ausente do Swagger quebra o cliente tipado".
**Correção sugerida:** acrescentar `503` em `/bill` e no GET da lista ("consumos desta reserva ainda não migrados — tente após o
`migrate`"). Corrigir a descrição do POST e os textos de 400 e 422. Regenerar o `schema.d.ts`.

### 🟢 N-3 [Desempenho] Todo `bill` e toda lista fazem seq scan em `consumptions`, de todos os hotéis, até a tabela ser apagada
**Onde:** `app/utils/pendingLegacyConsumption.js:25-31`.
**Cenário (EXPLAIN reproduzido):** `Seq Scan on consumptions c … Filter: (deleted_at IS NULL) AND (reservation_id = …)`. O único
índice da tabela é `consumptions_pkey`, e nem o `ConsumptionModel` nem o `schema.sql` do develop criaram índice em
`reservation_id`. A tabela não recebe mais escrita, mas fica até o `DROP` da D-27 (pendência 1, sem data). Cada fechamento de
conta lê o legado inteiro do SaaS, além de 2 round-trips (o `to_regclass` em cada request).
**Correção sugerida:** no `migrateConsumptions`, quando a tabela existir, `CREATE INDEX IF NOT EXISTS
consumptions_reservation_idx ON consumptions (reservation_id) WHERE deleted_at IS NULL`. Isso é barato e não altera dado (D-27).

### 🟢 N-4 [Rótulo] Conta re-apontada com rótulo da recepção passa a nomear o quarto errado
**Onde:** `app/utils/reservationRoomAccount.js:206-210`.
**Cenário (reproduzido):** hóspede CHECKED_IN no 906, e a recepção abre `Suíte 906 — João`. Troca para o 907 no meio da estadia e
lança pela rota antiga. A conta passa a ter `room_id = 907` e `label = "Suíte 906 — João"`. A lista do garçom mostra "906". Se
o 906 receber outro hóspede, o garçom tende a lançar o consumo do novo hóspede nessa conta. A D-22 aceita, porque a reserva do
João está CHECKED_IN. Antes do fix, o rótulo estava desatualizado do mesmo jeito, então não é regressão. Mas o fix agora
**move** a conta e deixa o rótulo para trás.
**Correção sugerida:** ao re-apontar, quando o rótulo contém o número antigo, trocar só o número
(`label.replace(oldRoom.number, room.number)`), ou anexar "(→ 907)".

### 🟢 N-5 [Operação / D-30] Conta `OPEN` continua aberta depois do check-out e do cancelamento, e o DELETE antigo muda de resposta conforme a origem
**Onde:** `migrateConsumptions.js:73-76` decide `CLOSED` só no instante da migração. `CancelReservationController` e
`CheckOutController` não tocam em contas.
**Cenário (reproduzido):** uma reserva CHECKED_IN recebe consumo pela rota antiga, e a conta nasce `OPEN`. Depois, `check-out`
→ 200. A conta continua `OPEN` no `GET /accounts?status=OPEN` do garçom, e `DELETE` antigo do item → **204**. Numa reserva
CHECKED_OUT cuja conta veio da migração, o mesmo DELETE → **422**. É o mesmo estado da reserva com respostas diferentes, que
dependem só da origem do dado. Toda reserva aberta no deploy da T-04.2 e encerrada antes da T-04.3 deixa uma conta aberta para
sempre. A pendência 6 da T-04.1 fala em fechar no **check-out**, mas não cita **cancelamento** nem as estadias encerradas
nesse intervalo. Também não há mais caminho para cobrar um frigobar conferido depois do check-out: as duas rotas recusam. A D-30
registra o custo de contrato, mas não esse custo operacional.
**Correção sugerida:** acrescentar à pendência da T-04.3: fechar a conta ROOM no check-out **e no cancelamento**, mais um
fechamento em lote das contas `OPEN` de reservas CHECKED_OUT/CANCELLED/excluídas. Registrar no anexo como o hotel cobra
consumo tardio (é esperado, ou fica para a T-04.3).

### 🟢 N-6 [Contrato] DELETE antigo de consumo ainda não migrado responde 404, e não 503
**Onde:** `DeleteConsumptionController.js:37-38` (a 1ª leitura, antes da trava). O 503 só cobre `bill` e lista.
**Cenário (reproduzido):** reserva com consumo vivo em `consumptions` não migrado, e `DELETE …/consumptions/<id>` → `404
Consumo não encontrado`. O ADMIN que quer estornar um lançamento errado de uma reserva que ficou para trás conclui que ele não
existe, mas o `bill` continua 503 por causa dele. Não há perda: o item não entra em total nenhum.
**Correção sugerida:** no ramo 404, chamar `pendingLegacyConsumption(reservationId)` e devolver 503 com a mesma mensagem.

---

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | Troca e remoção de quarto não levam junto a conta que cobra a diária (causa raiz de N-1) | `UpdateReservationController.js:85-90`, `RemoveRoomFromReservationController.js:38` | Gabriel | `docs/qa/repasses/para_gabriel_19102026.md` |
| 🟢 | Complemento ao repasse do dev: `migrate` só **antes** do rollout deixa os pods antigos gravando em `consumptions` depois da migração, e essas reservas ficam em 503 até o próximo deploy. Rodar também **depois** do rollout | `start.sh:91-94` | Weslley | `docs/qa/repasses/para_weslley_19102026.md` (acrescentado) |

---

## O que foi verificado e está correto

- **Commit parcial e erro:** o throw vem **depois** do `sequelize.transaction(...)` resolver (`migrateConsumptions.js:134`). As
  válidas ficam commitadas, e `command.js` cai no `catch` → `process.exit(1)`. Como a migração de dados é o último passo do
  `migrate`, nenhuma etapa fica pulada.
- **Reserva nunca pela metade:** uma linha inválida, mesmo **excluída**, tira a reserva inteira (`paraTras` sai do conjunto
  dos pendentes sem filtrar `deleted_at`). No ensaio, o frigobar legítimo de R$ 250 do hotel B não migrou sozinho.
- **Sem falso negativo no 503:** o pendente não filtra tenant **de propósito**. Filtrar esconderia o consumo de hotel divergente
  (tenant do consumo ≠ tenant da reserva). A reserva já foi validada no tenant antes da chamada. O resultado é só um booleano,
  sem vazamento.
- **Sem falso positivo:** consumo excluído não migrado não bloqueia (teste novo). Reserva soft-deletada já é 404 antes do
  pendente. Banco sem `consumptions` → `false` sem erro.
- **Nenhum outro leitor de total sem guarda que gere cobrança:** `reservationConsumptionItems` só é usado por `bill` e lista.
  `accountTotal` (`GET /accounts/:id`) mostra o total parcial, que é a pendência 6 já registrada no anexo. Pagamento e PIX não
  leem consumo.
- **Corrida no re-apontamento:** duas rotas antigas simultâneas re-apontam a mesma linha para o mesmo quarto, sem conflito. A
  colisão com `/accounts` cai no `UniqueConstraintError` → `findOne(where)`, sem 500. O resultado ruim é o de N-1, não um erro.
- **`Op.notIn` com lista vazia:** inalcançável. O trigger sempre mantém o principal em `reservation_rooms`.
- **422 da D-30:** vem antes de `reservationRoomAccount`, então não cria conta (teste). O 422 já existia no contrato da rota
  (conta fechada). Nenhuma tela chama a rota, e o teste protegido usa PENDING.
- **Folgas de `consumed_at` alinhadas:** rota com 60 s sobre o relógio da aplicação e reparo com 1 min sobre o `created_at`, que
  vem do mesmo relógio. Um lançamento válido nunca é reparado.
- **ESM, sem `require()`. Logs só com `error.message`. Nenhuma PII nova.**

## Não foi possível verificar

- Volume de produção: não medi o seq scan de N-3 com milhões de linhas, só confirmei o plano.
- Provisionamento por `db/schema.sql` seguido do migrate: segue bloqueado pelo bug conhecido do enum de `event_quotes`, fora
  do escopo. O ensaio usou o sync do develop, como na auditoria anterior.
- O comportamento real da T-04.3, que ainda não existe. N-1 e N-5 são riscos para ela.
