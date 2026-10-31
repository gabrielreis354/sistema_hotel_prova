# QA Red Team — reauditoria delta da validação de tenant em FK (ressalvas de 30/10)
**Branch:** fix/tenant-fk-validation · **Dev:** Gabriel (agente executor), em área da Sirlande · **Delta:** 085b29a..9ea7eef · **Base:** develop@94f7abf (contida); develop atual 625e0a7 · **Data:** 31/10/2026
**Arquivos auditados:** 20 do delta (13 controllers, `findInTenant.js`, `roomRules.js`, `swagger.js`, 3 testes, docs)
**Achados no escopo:** 3 (🔴 0 · 🟡 1 · 🟢 2) · **Repassados:** 0 (o repasse de 30/10 para a Sirlande, sobre os GETs com `:id` não-UUID, continua valendo)

## Veredito
**APROVADO COM RESSALVAS**

As 7 ressalvas de 30/10 estão corrigidas. Repeti as sondas na ponta 9ea7eef:

| Ressalva | Sonda em 085b29a | Sonda em 9ea7eef |
|---|---|---|
| 🟡-1 reserva no quarto em exclusão | 201, reserva com `room: null` | **404** `Quarto não encontrado` |
| 🟡-1 quarto na categoria em exclusão (fluxo novo: `FOR UPDATE` → `count` → destroy) | `category: null` | **404** `CATEGORY_NOT_FOUND` |
| 🟡-2 `number` null, vazio, objeto, lista, `true` ou espaços | 500 ou gravado | **400** `INVALID_INPUT`, `field: number` |
| 🟡-3 `PUT`/`DELETE /rooms/abc` e `/room-categories/abc` | 500 | **404** |
| 🟢-3 `"P "` ao lado de `"P"` | 201 | **409** `CATEGORY_NAME_TAKEN`; `"  Z7  "` é gravado como `"Z7"` |
| 🟢-4 Swagger | PUT sem corpo | `requestBody` do PUT documentado, com a regra de transição e `number` |
| 🟢-2 travas sem teste (M5/M6) | mutações sobreviviam | `rooms-race.test.js` cobre M5, M6 e as 10 corridas |

O único 🟡 novo é um efeito colateral da própria correção. O `FOR SHARE` escolhido entra em **deadlock** com o check-in e o check-out quando dois quartos são travados em ordem inversa. A vítima do deadlock recebe um 409 falso: "Quarto indisponível no período solicitado", com os quartos livres. Não há perda de dado (a repetição grava). A correção é trocar uma palavra, e eu a validei localmente (ver 🟡-D1).

**Merge com a develop:** a `develop` está em 625e0a7. Desde 093d14b só mudou infra (`infra/k8s/observability`, `rabbitmq-setup.sh`, `start.sh`), sem nada em `services/`. `git merge-tree` não acusa conflito. **Não é preciso merge antes do PR.**

## Achados no escopo

### 🟡-D1 [Concorrência / deadlock] `LOCK.SHARE` nos quartos conflita com o `UPDATE status` do check-in e do check-out; com dois quartos em ordem inversa, o Postgres derruba uma das transações
**Onde:** `ReservationApi/CreateReservationController.js:43` (principal, depois extras) · `ContractApi/SignContractController.js:79` (laço sobre `room_ids`). O conflito é com `ReservationApi/CheckInController.js:37,45` e `CheckOutController.js:37,45` (principal `room.save`, depois extras `RoomModel.update`).
**Por quê:** `FOR SHARE` conflita com o `FOR NO KEY UPDATE` que todo `UPDATE rooms SET status` pega. Antes do delta, a reserva só pegava o `FOR KEY SHARE` implícito da FK, que **não** conflita com esse UPDATE. O deadlock nasceu no delta.
**Cenário (reproduzido em 9ea7eef, Postgres 17 próprio na 5457):**
1. A reserva R1 tem principal Y e extra X (maio). O check-in de R1, emulado na ordem exata do controller, trava a reserva e faz `UPDATE` em Y.
2. Ao mesmo tempo chega `POST /reservations {room_id: X, extra_room_ids: [Y]}` para junho, um período livre. Ele pega `FOR SHARE` em X e espera em Y.
3. O check-in vai fazer `UPDATE` em X e espera o `FOR SHARE`. Isso é um ciclo.
4. Log do Postgres:
   ```
   ERROR:  deadlock detected
   DETAIL:  Process 122 waits for ShareLock on transaction 1221; blocked by process 121.
            Process 121 waits for ShareLock on transaction 1222; blocked by process 122.
            Process 122: SELECT ... FROM "rooms" ... WHERE ("RoomModel"."deleted_at" IS NULL AND ("RoomModel"."id" = 'b76dea31-...' ...)) FOR SHARE;
   ```
5. A requisição foi a vítima. O `isRoomOccupiedError` mapeia `40P01` para **409 `{"error":"Quarto indisponível no período solicitado"}`**, embora os quartos estivessem livres. A mesma requisição repetida logo depois respondeu **201**.

Quando a vítima é o check-in, o recepcionista recebe **500** no check-in (`CheckInController.js:60`). A sonda com o check-in real e a criação em paralelo, sem emulação, passou em 20 de 20 rodadas: a janela é estreita, mas existe, e o log acima é dela. O `SignContract` tem o mesmo desenho (vários quartos com `FOR SHARE` em laço) e sofre o mesmo ciclo por analogia. Não reproduzi esse caso à parte.
**Regra violada:** a convenção de ordem de trava do projeto (o comentário de `CreatePaymentController` e as D-48 registram que travas cruzadas viram deadlock e 500). Uma mensagem de erro que mente para a recepção ("indisponível" com o quarto livre).
**Correção sugerida:** trocar `LOCK.SHARE` por **`LOCK.KEY_SHARE`** nas 8 leituras de referência.
- `FOR KEY SHARE` continua conflitando com o `FOR UPDATE` do `DeleteRoom` e do `DeleteRoomCategory`, então a espera e a reavaliação de `deleted_at` seguem iguais.
- Ele é compatível com o `UPDATE status`, o que acaba com o ciclo.
- **Validado localmente** (só em `/tmp`, sem commit): com a troca, a sonda de deadlock responde **201**, as duas sondas de exclusão continuam **404**, e `rooms-race.test.js` mais `rooms-categories-rules.test.js` ficam verdes (85 de 85).
- Acrescentar a sonda de ordem inversa como teste de regressão.

### 🟢-D2 [Mensagem de erro] `40P01` virando "Quarto indisponível" esconde o deadlock
**Onde:** `utils/checkReservationConflict.js:64-68` (comportamento que já existia), usado em `CreateReservationController.js:88` e `SignContractController.js:125`.
**Cenário:** é o 409 falso do 🟡-D1. O mapeamento foi criado para a corrida no EXCLUDE do pivô, onde "indisponível" é verdade. Para um deadlock de trava, não é.
**Correção sugerida:** com o 🟡-D1 corrigido, o caso deixa de ocorrer nessas rotas. Se quiserem robustez, separar o `40P01` em 409 com "tente de novo" ou repetir a transação uma vez.

### 🟢-D3 [Operação] O novo 409 da reserva pública deixa uma cobrança PIX órfã
**Onde:** `PublicBookingApi/CreateBookingController.js:126-132`
**Cenário:** o quarto é excluído entre a escolha e a gravação. A cobrança do sinal já foi criada no PSP, e o hóspede recebe 409 "Sem disponibilidade". É o mesmo padrão do rollback que já existia (linha 230): o QR nunca chega ao hóspede e o `providerChargeId` vai para o log. É aceitável e consistente, mas o hotel precisa reconciliar.
**Correção sugerida:** nenhuma agora. Registrar junto da pendência de cancelar a cobrança órfã no PSP, se ela existir.

## Respostas pedidas na rodada

1. **Sondas na ponta nova:** rodadas e listadas na tabela do veredito. Única sobra: `GET /rooms/abc` ainda dá 500, fora do delta e já repassado à Sirlande em 30/10.
2. **Deadlock nas ordens novas:**
   - `CreateReservation` (transação aberta antes de ler os quartos) e `SignContract` (contrato com `FOR UPDATE`, depois quartos com `FOR SHARE`): **ciclo com check-in e check-out**, confirmado no 🟡-D1.
   - `AddRoom`, `UpdateReservation`, reserva pública e conta avulsa travam **um** quarto só e não esperam nada que o check-in segure: sem ciclo.
   - Exclusão de categoria (categoria com `FOR UPDATE`, depois `count` sem trava nos quartos) × `CreateRoom` (categoria com `SHARE`, depois INSERT) × `UpdateRoom` (quarto com `FOR UPDATE`, depois categoria com `SHARE`): nenhum lado espera um quarto que o outro segure, então **sem ciclo**.
   - `DeleteRoom` trava só o quarto e lê o resto sem trava: sem ciclo.
   - Troca de quarto (`UpdateReservation`): reserva com `FOR UPDATE`, depois um quarto com `SHARE`, depois contas. Não cruza com o check-in de outra reserva, porque trava um quarto só.
3. **Não travar o quarto na conta ROOM: a justificativa se sustenta.** A conta ROOM trava a reserva com `FOR UPDATE`, exige `CHECKED_IN` e lê o pivô **dentro dessa trava**.
   - Um quarto num pivô de reserva `CHECKED_IN` não pode ser excluído: o `DeleteRoom` acha a reserva em `ROOM_HOLDING_RESERVATION_STATUSES` e responde 409, e o quarto ainda está `OCCUPIED`.
   - A remoção do quarto da reserva e o check-out também travam a mesma reserva, então ficam em série com a criação da conta. Quem chega depois enxerga o que o outro gravou (422 "não pertence", ou a conta movida ou fechada junto).
   - Travar o quarto ali, antes da reserva (a validação do `room_id` vem antes, na linha 115), inverteria a ordem reserva → quarto do check-in.
4. **O contrato público da reserva não vaza nada.** O 409 novo usa a mesma constante `NO_AVAILABILITY` do 409 de sempre, só `{error}`, sem id de quarto, sem o motivo da exclusão e sem detalhe de banco. O log interno leva só o `providerChargeId`, sem PII.

## O que foi verificado e está correto
- `findInTenant` aceita `lock` sem mudar o comportamento de quem não passa a opção.
- O 404 de categoria e de quarto não-UUID não consulta o banco.
- `numberError`:
  - No cadastro, ausente, null ou `''` mantém a mensagem antiga "number obrigatório" na lista `errors` (cliente antigo preservado).
  - Na edição, ausente significa não mudar.
  - O valor é gravado aparado.
- `category_id` canônico (`category.id`) no Create e no Update.
- `DeleteRoomCategory`: `FOR UPDATE`, depois `count` e destroy na mesma transação. A sonda confirma a espera e o 404 do `POST /rooms` concorrente.
- Rollback: os caminhos novos de 404 e 409 fecham a transação antes de responder. Os `catch` usam `if (!t.finished)`, sem rollback duplo.
- Saída real da suíte em 9ea7eef: `Test Files 49 passed (49)` · `Tests 1089 passed | 1 skipped (1090)`. Cobertura: Statements 85.35%, Branches 82.28%, Functions 89.1%, Lines 87.14%.
- `qa_checks.sh`: `⚠ 3 aviso(s). Nenhum erro bloqueante.`, os mesmos 3 avisos de sempre.

## Não foi possível verificar
- O deadlock do `SignContract` foi apontado por analogia de ordem de trava, sem sonda própria.
- Com check-in e criação reais em paralelo, sem emulação, o deadlock não apareceu em 20 rodadas. A reprodução usou a ordem exata de travas do `CheckInController`, emulada numa transação manual contra o endpoint real de criação.
