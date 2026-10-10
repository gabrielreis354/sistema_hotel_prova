# QA Red Team — reserva multiquarto e contrato (Etapa F, P-1 a P-4)
**Branch:** fix/reserva-multiquarto-contrato @ `0c39f0b` (4 commits) · **Base:** develop@`c6226bc` · **Data:** 10/10/2026
**Delegação:** `docs/delegacoes/rodada3_gabriel_04out2026.md`, Etapa F (CA-F.1.a–e, F.2, F.3, F.4)
**Arquivos auditados:** 16 do diff + 14 lidos por contexto (CheckIn/CheckOut/Cancel/Delete/Get de reserva, PixWebhook, CreateBooking, getAvailableCategories, ListAvailableRooms, Delete/UpdateContract, routers, auth/role middleware, swagger, command.js, seed)
**Achados:** 16 (🔴 2 · 🟡 9 · 🟢 5) + 2 repassados

## Veredito
**REPROVADO**

Dois motivos, ambos com correção pequena:

1. **A garantia de banco do CA-F.1.b tem uma corrida que deixa a cópia do período velha — reproduzida.**
   Alterar as datas de uma reserva e adicionar um quarto nela ao mesmo tempo grava o quarto novo no
   pivô com o período **antigo**. Daí em diante nem o EXCLUDE nem `checkReservationConflict` enxergam
   esse quarto no período real, e ele pode ser vendido duas vezes sem erro nenhum. É exatamente a classe
   de defeito da P-1, só que agora por concorrência. A correção é uma cláusula `FOR SHARE`.
2. **`PUT /reservations/:id` aceita `guest_id` de outro tenant** e o `GET` devolve o cadastro completo
   desse hóspede (CPF, e-mail, telefone). O defeito já existia, mas está no bloco de validação que esta
   branch reescreveu — e onde ela já corrigiu o mesmo furo para `room_id` ("antes, qualquer id era
   aceito"). Uma linha resolve.

O resto da entrega está sólido. Os triggers cobrem toda escrita em `reservations` (inclusive em lote e
soft delete), o principal entra pelo banco, `RemoveRoom` protege o principal, os testes reproduzem a P-1 e
a concorrência foi provada por mutação. P-2 e P-3 estão corretos. Os 🟡 são de comportamento silencioso e
de dívida, não de vazamento.

## Achados

### 🔴 [Concorrência / CA-F.1.b] Cópia do período no pivô fica velha com UPDATE de datas e INSERT de quarto concorrentes
**Onde:** `services/core-service/database/applyDbConstraints.js:216-222` (função `reservation_rooms_copia_periodo`), em conjunto com `:259-261` (`UPDATE reservation_rooms SET updated_at = now()` do trigger da reserva)

**Cenário (reproduzido no banco de teste e desfeito em seguida):** reserva R de 10 a 12/01 com um quarto.
- tx1 (`PUT /reservations/R`, datas novas): `UPDATE reservations SET check_in_date='2030-01-01', check_out_date='2030-01-05'`. O trigger recopia as linhas do pivô **que tx1 enxerga**. A transação ainda não fez commit.
- tx2 (`POST /reservations/R/rooms`, quarto Q): `INSERT INTO reservation_rooms`. O BEFORE INSERT lê `reservations` com o snapshot de tx2, que ainda vê as datas antigas. A FK pega `FOR KEY SHARE`, que **não** conflita com o `FOR NO KEY UPDATE` de tx1, então **não bloqueia** (medido: "INSERT do tx2 bloqueou? não").
- Os dois fazem commit. Pivô de R:

```
room_id  (principal)  2030-01-01 → 2030-01-05  blocks_room=true
room_id  (Q, extra)   2028-01-10 → 2028-01-12  blocks_room=true   ← período velho
```

O quarto Q está na reserva de 01 a 05/01/2030, mas o banco e a aplicação o tratam como ocupado em
2028 e livre em 2030. Uma terceira reserva vende Q em 2030: `201`, venda dupla, nenhum erro. O dado
fica errado até a próxima alteração de R. Aí o EXCLUDE dispara num PUT sem relação nenhuma com isso
(ex.: troca de hóspede com datas no corpo) e devolve 409 ao recepcionista. A ordem inversa (INSERT antes,
UPDATE depois) dá o mesmo resultado: o UPDATE do trigger não enxerga a linha que tx2 ainda não confirmou.

A corrida pede duas pessoas na mesma reserva ao mesmo tempo (uma adiciona quarto, outra muda as
datas). É rara. Mas o EXCLUDE existe justamente para a corrida rara, e o CA-F.1.b diz "a aplicação pode
errar, o banco não deixa". Aqui o banco deixa.

**Regra violada:** CA-F.1.b; invariante anti-double-booking (SPEC-01 §4).
**Correção sugerida:** travar a mãe na leitura da cópia:
```sql
SELECT r.check_in_date, r.check_out_date, (r.status <> 'CANCELLED' AND r.deleted_at IS NULL)
  INTO NEW.check_in_date, NEW.check_out_date, NEW.blocks_room
  FROM reservations r
 WHERE r.id = NEW.reservation_id
   FOR SHARE;
```
`FOR SHARE` conflita com o `FOR NO KEY UPDATE` do UPDATE da reserva. Se o INSERT chega primeiro, o
UPDATE espera, e o `UPDATE reservation_rooms` do trigger (snapshot novo em READ COMMITTED) passa a ver a
linha. Se o UPDATE chega primeiro, o INSERT espera e relê a versão já confirmada. Teste: o mesmo par
UPDATE/INSERT em duas conexões `pg` com BEGIN manual, conferindo depois que o período do quarto Q é o
novo (o script usado aqui está descrito em "Estado do ambiente").

### 🔴 [Multi-tenancy / LGPD] `PUT /reservations/:id` grava `guest_id` de outro tenant sem conferir, e o GET devolve o hóspede alheio
**Onde:** `services/core-service/app/Controllers/ReservationApi/UpdateReservationController.js:48` (atribuição sem validação). O vazamento sai por `GetReservationController.js:14` (`include: GuestModel` sem `attributes` nem filtro de tenant).

**Cenário (confirmado por leitura; pré-existente, `develop` tem o mesmo código):** admin do hotel A envia
`PUT /reservations/<reserva de A>` com `{ "guest_id": "<uuid de hóspede do hotel B>" }`. A FK só
confere se o hóspede existe, então o `save()` passa. Em seguida, `GET /reservations/<id>` devolve
`guest` com o cadastro completo do hóspede de B: nome, CPF, e-mail, telefone, endereço. É vazamento
entre tenants de dado pessoal (LGPD art. 46). O atacante precisa conhecer um UUID de B. Isso reduz a
probabilidade, mas não é controle de acesso. Esta branch reescreveu o bloco de validação logo acima
(linhas 24-28) e fechou o mesmo furo para `room_id`, com o comentário "antes, qualquer id era aceito".
O `guest_id`, duas linhas abaixo, ficou aberto.

**Regra violada:** CLAUDE.md §7 ("Queries sem tenant_id — vazamento cross-tenant é crítico"); checklist §1 (recurso referenciado precisa ser validado no tenant).
**Correção sugerida:** antes da linha 48,
`if (guest_id !== undefined && !(await GuestModel.findOne({ where: { id: guest_id, tenant_id: tenantId } }))) return response.status(404).json({ error: 'Hóspede não encontrado' });`
Mais um teste em `tenant-isolation.test.js`: PUT com hóspede de outro tenant → 404.

### 🟡 [Regra de negócio / trigger] Trocar o principal por um quarto que já é extra da mesma reserva tira um quarto da reserva sem avisar
**Onde:** `UpdateReservationController.js:37-40` + `applyDbConstraints.js:249-251`

**Cenário (reproduzido dentro de uma transação com ROLLBACK):** reserva família com principal A e extra
B. O recepcionista quer "promover" B a principal: `PUT { room_id: B }`. O conjunto conferido vira
`{B}`, e o trigger apaga a linha de A e não insere B, que já existe. Resultado: pivô `[A, B]` → `[B]`,
o total cai para uma diária de um quarto, A volta a ficar livre no período, e a resposta é `200`. A
família chega e falta um quarto. Nenhum teste cobre esse caminho. O teste existente da troca
(`reservation-multiroom.test.js:101`) usa uma reserva de um quarto só.

**Regra violada:** Fail Fast / efeito colateral proibido ("o que NÃO deve mudar", CLAUDE.md §4-P).
**Correção sugerida:** decidir a semântica e torná-la explícita. A mais simples é recusar com `409`
("o quarto já está na reserva — remova-o antes ou escolha outro"). A alternativa é, quando
`NEW.room_id` já estava no pivô, **manter** `OLD.room_id` como extra (troca de papéis) e recalcular.
Nos dois casos, com teste.

### 🟡 [Migração / dinheiro] Banco legado: principal trocado por PUT na develop deixa linha velha no pivô, que vira ocupação fantasma e cobrança a mais
**Onde:** `applyDbConstraints.js:272-281` (preenchimento) + `recalculateReservationTotal.js:16-30`

**Cenário (confirmado por leitura; não reproduzido):** em `develop`, `UpdateReservationController`
trocava `reservations.room_id` e **não** mexia no pivô (`git show origin/develop:…UpdateReservationController.js:30-35`).
Uma reserva criada no quarto X (pivô: X) e depois trocada para Y fica com pivô `{X}` e principal Y.
O migrate desta branch insere Y e não remove X, e o pivô vira `{X, Y}`. Consequências: (a) X fica
bloqueado no período pelo EXCLUDE e pela disponibilidade, sem ninguém nele; (b) a próxima alteração
de datas recalcula `total_amount` somando X e Y, e o hóspede é cobrado por dois quartos; (c) se X foi
vendido depois para outra reserva, o migrate **aborta** acusando "venda dupla" que não existe. O
teste de migrate do executor usou o seed, que não tem esse caso. Não há como distinguir, só pelo dado,
uma linha velha de principal de um extra legítimo.
**Correção sugerida:** antes do `ALTER TABLE … ADD CONSTRAINT`, listar (sem apagar) as reservas cujo
pivô tem quarto ≠ `room_id` **e** cujo `updated_at` > `created_at`, e registrar a lista no PR para
conferência manual. Ou documentar a limitação em `ARQ_DATABASE.md` e no relatório da sessão. Se o
banco de produção ainda não tem dado real, basta registrar.

### 🟡 [Dinheiro / CA-F.4.c] O recálculo dispara pela presença do campo, não pela mudança, e reprecifica a estadia inteira pelo preço de hoje
**Onde:** `UpdateReservationController.js:22,57-58`; `AddRoomToReservationController.js:32`; `RemoveRoomFromReservationController.js:26`; `recalculateReservationTotal.js:14-31`

**Cenário:** reserva criada a R$ 100/noite (total 200.00). O admin sobe a categoria para R$ 150. O
recepcionista corrige só o hóspede, mas o formulário manda o objeto inteiro (`guest_id`,
`check_in_date`, `check_out_date` iguais aos atuais). `datesOrRoomChanged` é `true`, porque testa
`!== undefined` e não `!==` o valor atual, e o total vai a 300.00 sem que nada da estadia tenha mudado.
O mesmo vale para adicionar ou remover um extra, que reprecifica **todos** os quartos pelo preço
corrente. Também vale em `CHECKED_IN` e `CHECKED_OUT`, quando já houve pagamento. O mercado congela a
tarifa na reserva. A SPEC-07 vai tratar tarifa por período, mas hoje o efeito já é cobrança a mais.
**Regra violada:** CLAUDE.md §7 (risco financeiro); CA-F.4.c pede recalcular "na alteração de datas ou de quartos", não em toda escrita.
**Correção sugerida:** calcular `datesOrRoomChanged` comparando com os valores atuais
(`room_id !== undefined && room_id !== reservation.room_id`, idem datas). Registrar como pendência da
SPEC-07 o congelamento da tarifa por quarto, ou recusar a alteração de quartos e datas fora de
`PENDING`/`CONFIRMED`.

### 🟡 [DRY / CA-F.4 "uma única função"] A estadia ainda é calculada em mais dois lugares, com `Number`
**Onde:** `app/Controllers/PublicBookingApi/CreateBookingController.js:74-76`; `app/utils/getAvailableCategories.js:20,44,57`

**Cenário:** a delegação pede "Uma única função de cálculo […] para a troca [pela SPEC-07] ser num lugar
só". O motor de reserva direta cota (`getAvailableCategories`) e grava (`CreateBooking`) o total com
`Number(price) * nights` e `toFixed`, e a alteração da mesma reserva DIRECT recalcula com
`calculateStayTotal`, em centavos. Hoje os resultados coincidem para preço com 2 casas × noites
inteiras. Mas quando a SPEC-07 trocar `calculateStayTotal`, o site público vai continuar cotando pela
regra antiga, e a reserva DIRECT muda de preço na primeira edição da recepção. O diff mexeu em
`CreateBookingController` e deixou o cálculo lá.
**Regra violada:** CLAUDE.md §7 ("Lógica de negócio duplicada"); regra da tarefa (DECIMAL nunca por `Number`).
**Correção sugerida:** `CreateBooking` usa `calculateStayTotal({ roomIds: [availableRoom.id], … })`.
`getAvailableCategories` usa `toCents`/`countNights`/`fromCents` (ou uma `quoteStay(price, nights)`
exportada do mesmo módulo).

### 🟡 [Autorização / CA-F.3, intenção] A reserva-bloco B2B pode ser cancelada, encolhida ou ampliada pela recepção pelas rotas de reserva
**Onde:** `routes/apis/reservationRouter.js:29,34,36-37`; `recalculateReservationTotal.js:14`

**Cenário:** a P-3 fechou `PUT /contracts/:id/cancel` para não-ADMIN, com a justificativa "vendas e
eventos é decisão de gerência". Mas um `RECEPTIONIST` chama `PUT /reservations/<bloco>/cancel` e o
bloco vira `CANCELLED`, todos os quartos do evento são liberados e o contrato continua `SIGNED`. O mesmo
recepcionista pode remover quartos do bloco (`DELETE /reservations/<bloco>/rooms/:roomId`) ou
adicionar (`POST …/rooms`). Neste caso o recálculo pula B2B, e o quarto entra **de graça** no bloco. A
delegação só pediu sign/cancel. Mesmo assim, a intenção do controle se contorna em uma chamada.
**Correção sugerida:** registrar no PR como pendência da decisão de papéis do contrato (a mesma do
`POST /` e do `PUT /:id`). A correção mínima é recusar (`409`/`403`) cancel, add-room e remove-room
quando `source === 'B2B'`, mandando a operação para o contrato.

### 🟡 [Concorrência / CA-F.2.b] Contrato lido fora da transação e sem lock em sign e cancel
**Onde:** `CancelContractController.js:25` (lê o contrato antes do `sequelize.transaction()` da `:33`); `SignContractController.js:48`

**Cenário (por leitura):** dois admins, um assina e outro cancela o mesmo contrato `GENERATED`. O cancel
lê `reservation_id = null` e pula o bloco. O sign cria a reserva-bloco e grava `SIGNED`. O cancel grava
`status = 'CANCELLED'` (o `save` só envia o campo alterado). Resultado: contrato `CANCELLED` com
reserva-bloco `CONFIRMED` segurando os quartos, e ninguém cancela pelo contrato, porque ele "já está
cancelado" (409). Do mesmo jeito, dois `sign` simultâneos com listas de quartos disjuntas criam dois
blocos, e o primeiro fica órfão. O lock que a branch pôs na **reserva** não cobre isso, porque o
estado que decide é o do **contrato**.
**Correção sugerida:** nas duas rotas, reler o contrato dentro da transação com
`lock: t.LOCK.UPDATE` e conferir o status de novo.

### 🟡 [Contrato de API] Swagger não acompanha as respostas novas
**Onde:** `config/swagger.js:175-182` (`ReservationRoomPivot` sem `check_in_date`, `check_out_date`, `blocks_room`, que o `201` de `POST /reservations/{id}/rooms` agora devolve); `:872-879` (409 descrito só como "Já vinculado"; agora também é quarto ocupado, com `room_ids`); `:882-887` (`DELETE /reservations/{id}/rooms/{roomId}` sem o `409` novo do principal, sem `404`); `POST/PUT /reservations` sem `room_ids` no corpo do 409 e sem o `404` de quarto no PUT. As rotas `/contracts/*` não constam do Swagger (pré-existente), então o `403` novo de sign/cancel também não.
**Cenário:** o cliente tipado do frontend (gerado do Swagger) não conhece `room_ids` nem os novos códigos. O módulo de reservas da próxima delegação vai tratar o 409 de ocupação como genérico.
**Correção sugerida:** atualizar os schemas e responses citados. Os campos do pivô são cópias mantidas pelo banco: marcar como `readOnly`, ou omitir da resposta com `attributes`.

### 🟡 [Provisionamento] Banco montado só por `db/schema.sql` fica com a disponibilidade cega
**Onde:** `package.json:14` (`setup:db` → `psql -f db/schema.sql`); `db/schema.sql:170-185` (só as colunas; triggers e EXCLUDE ficam no migrate)
**Cenário:** antes desta branch, a aplicação inseria o principal no pivô e consultava `reservations.room_id`.
Agora ela **depende** dos triggers para as duas coisas. Num banco provisionado por `npm run setup:db`
sem `node command.js migrate`, nenhuma reserva tem o principal no pivô, as cópias ficam `NULL` e
`checkReservationConflict` (`check_in_date < …` com NULL) nunca acha conflito. Só o EXCLUDE de
`reservations` segura o principal, e os extras ficam sem proteção nenhuma. O `recalculateReservationTotal`
também passa a ignorar o principal. O README manda usar o migrate, mas o script continua publicado.
**Correção sugerida:** remover o `setup:db`, ou fazê-lo chamar `node command.js migrate`. Outra opção
é falhar no boot (ou no `/health`) se o trigger `reservations_sincroniza_quartos` não existir.

### 🟡 [Validação / dinheiro] `calculateStayTotal` aceita estadia de zero ou menos noites
**Onde:** `app/utils/calculateStayTotal.js:26,33,49-50`; nenhuma validação de ordem das datas em `CreateReservationController.js:16-21` nem em `UpdateReservationController.js:30-31`, e o banco do migrate **não** tem o `CHECK (check_out_date > check_in_date)` que o `schema.sql:150` declara.
**Cenário:** `POST /reservations` com `check_in_date = check_out_date = 2028-01-10` → `nights = 0`, total
`"0.00"`, `201`. O `daterange('[)')` vazio não sobrepõe nada, então a reserva não bloqueia o quarto,
mas o check-in marca o quarto `OCCUPIED`. Com datas invertidas, o `daterange` dá erro no EXCLUDE → `500`
em vez de `400`. Além disso, `fromCents` com valor negativo gera texto inválido (`-30050` → `"-300.-50"`).
Hoje esse caminho fica escondido pelo erro do `daterange`, mas a função nova, que vai ser substituída
pela SPEC-07, não falha cedo. A parte das datas é pré-existente. O `calculateStayTotal` é novo.
**Correção sugerida:** em `calculateStayTotal`, `if (nights < 1) return { error: { status: 400, message: 'check_out_date deve ser posterior a check_in_date' } }`. A mesma checagem no PUT, antes do conflito.

### 🟢 [Testes] O teste de centavos passaria com o `parseFloat` antigo
**Onde:** `tests/reservation-multiroom.test.js:214-219`
**Cenário:** `node -e 'console.log(33.33*3)'` → `99.99`. Além disso, a coluna `DECIMAL(12,2)`
arredonda qualquer float no INSERT, e o `RETURNING` devolve o valor arredondado. Pela API, nenhum
valor distingue centavos de float. O CA-F.4.b fica sem prova.
**Correção sugerida:** teste unitário de `toCents`/`fromCents`/`calculateStayTotal`
(ex.: `toCents('150.10') * 3 === 45030`, `fromCents(45030) === '450.30'`, `toCents('0.1') === 10`).

### 🟢 [Testes] O caso `WAITER` do CA-F.3.b passa pela camada errada
**Onde:** `tests/reservation-multiroom.test.js:280` (`it.each(['RECEPTIONIST', 'WAITER'])`)
**Cenário:** o `WAITER` recebe 403 do `isRouteAllowedForRole` em `middlewares/auth.middleware.js:29-32`
(a allowlist dele não inclui `/contracts`). Sem o `requireRole('ADMIN')`, esse caso passaria igual.
Só o `RECEPTIONIST` prova a regra nova. Não está errado, mas o nome do teste promete mais do que prova.
**Correção sugerida:** comentar isso no teste, ou acrescentar um papel que passe pela allowlist (ex.: o `RECEPTIONIST` já cobre).

### 🟢 [Testes] Lacunas de cobertura do comportamento novo
Sem teste: troca do principal por um extra (🟡 acima); add-room em reserva B2B (fica de graça); tenant
isolation dos caminhos novos (`extra_room_ids` ou `POST …/rooms` com quarto de outro tenant → 404;
`PUT room_id` de outro tenant → 404); `CHECKED_OUT` continua bloqueando no banco (a divergência
registrada); recálculo de reserva DIRECT; corrida de `AddRoom` duplicado. O teste de concorrência
(`:145-153`) depende do tempo. Ele pode passar pela checagem da aplicação, e não pelo EXCLUDE, se uma
requisição terminar antes da outra. A mutação do executor mostra que hoje ele exercita o banco, mas
isso não é garantido.

### 🟢 [Consistência de erro] Códigos e corpos divergentes para a mesma situação
- O 409 da corrida (`isRoomOccupiedError`) não traz `room_ids`, e o 409 da checagem da aplicação traz. O cliente não sabe qual quarto perdeu (`CreateReservationController.js:78` vs `:44`; idem Update, AddRoom e Sign). No Sign, a mensagem também muda ("Quarto(s) indisponível(is) no período do evento" vs `ROOM_OCCUPIED_MESSAGE`).
- Transição de estado proibida: `CancelReservation`, `CheckIn` e `CheckOut` usam **422**. `CancelContract` com bloco `CHECKED_IN` usa **409** (exigido pelo CA-F.2.a) e `RemoveRoom` do principal usa **409**. Fica para registrar a convenção no PR.
- `AddRoom` concorrente do mesmo quarto na mesma reserva: o `UNIQUE (reservation_id, room_id)` estoura `SequelizeUniqueConstraintError` → **500** (`AddRoomToReservationController.js:31,44-46`).
- `calculateStayTotal` devolve **404** "Quarto não encontrado" quando um quarto do pivô foi soft-deletado depois (`DeleteRoomController` não impede). A partir daí, qualquer alteração de datas da reserva falha com mensagem enganosa. Categoria com preço `0.00` → **422** "não possui preço definido".

### 🟢 [Ordem no migrate] Venda dupla legada interrompe também os CHECKs e índices seguintes
**Onde:** `applyDbConstraints.js:51` (`applyRoomOccupancy` roda antes dos CHECKs de products e da cura dos índices únicos)
**Cenário:** banco legado com venda dupla → `throw` → os CHECKs e os índices únicos parciais das linhas seguintes não são aplicados até alguém resolver as reservas. As duas coisas não têm relação.
**Correção sugerida:** chamar `applyRoomOccupancy` por último.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | Contrato assinado excluído (`DELETE /contracts/:id`) mantém a reserva-bloco `CONFIRMED` segurando os quartos. E a alteração de `check_in`/`check_out` do contrato assinado não move o bloco | `ContractApi/DeleteContractController.js:8`, `UpdateContractController.js:27-28` | Gabriel (trilha B2B) | sem arquivo — o orquestrador decide (esta auditoria não altera outros arquivos) |
| 🟢 | `CheckIn`/`CheckOut` leem o pivô fora da transação (`findAll` sem `transaction: t`) | `CheckInController.js:27`, `CheckOutController.js:27` | Gabriel | idem |

## O que foi verificado e está correto
- **Todas as escritas em `reservations` passam pelo trigger.** O trigger é `FOR EACH ROW` e dispara também em `Model.update` em lote. Cobertos: Create, Sign, CreateBooking (INSERT); Update, CheckIn, CheckOut, Cancel, CancelContract, PixWebhook (`PENDING→CONFIRMED`) e soft delete (`destroy` paranoid = `UPDATE deleted_at`). Não existe caminho de `restore()` nem de `force: true` em reserva ou quarto na aplicação (grep). Se um DBA restaurar, o trigger recopia `blocks_room` e o EXCLUDE decide. Hard delete da reserva → `ON DELETE CASCADE` no pivô.
- **Escritas diretas no pivô:** Create (extras), Sign (2..N), AddRoom (INSERT → BEFORE copia) e RemoveRoom (recusa o principal, `RemoveRoomFromReservationController.js:16`). Os mixins do `belongsToMany 'rooms'` (`setRooms`/`addRooms`) não são usados.
- **Triggers:** o INSERT da reserva insere o principal; a troca de `room_id` apaga o antigo e insere o novo sem duplicar (`NOT EXISTS`); a reserva sem pivô (legado) recebe a linha pelo preenchimento. A comparação OLD/NEW dentro da função evita o `UPDATE OF col` que quebrava o 2º migrate. O predicado do EXCLUDE do pivô (`blocks_room`) é o mesmo do EXCLUDE de `reservations`, que continua como segunda barreira.
- **CA-F.1.a:** Create, Update (todos os quartos atuais + o novo principal), AddRoom, Sign e a disponibilidade (`ListAvailableRooms`, `getAvailableCategories`, `CreateBooking`) usam `checkReservationConflict` sobre o pivô.
- **CA-F.1.c:** `SequelizeExclusionConstraintError` (23P01, também quando vem de dentro do trigger) → 409 em Create, Update, AddRoom, Sign e CreateBooking. Só há dois EXCLUDE no banco, então o mapeamento não engole outra constraint.
- **CA-F.1.d:** o cancelamento e a exclusão liberam os extras (teste + `blocks_room`). **CA-F.1.e:** nenhum arquivo de teste existente foi alterado no diff.
- **F.2:** allowlist `PENDING`/`CONFIRMED`, `409` com mensagem por status, `rollback` mantém o contrato, lock na reserva-bloco, contrato e bloco na mesma transação.
- **F.3:** `requireRole('ADMIN')` em sign e cancel. O teste com `RECEPTIONIST` prova. As outras escritas do router foram registradas no comentário (`contractRouter.js:22-24`).
- **F.4:** `toCents`/`fromCents` corretos para valores ≥ 0 com até 2 casas. `countNights` em UTC, sem erro de fuso. A soma é por quarto, cada um com a sua categoria. B2B não é recalculado (preço do contrato).
- **Tenant:** `calculateStayTotal` filtra `tenant_id`. Todos os chamadores de `checkReservationConflict` passam `tenantId`. As consultas ao pivô partem de uma reserva já validada no tenant. AddRoom e o `room_id` do PUT validam o quarto no tenant.
- **ESM:** nenhum `require()`. Transação onde há 2+ escritas (Create, Update+recálculo, AddRoom, RemoveRoom, Sign, CancelContract).
- **Divergência registrada pelo executor (CHECKED_OUT):** confirmada. A aplicação ignora `CANCELLED` e `CHECKED_OUT` (`checkReservationConflict.js:25`); o banco ignora só `CANCELLED`. Num check-out antecipado, a disponibilidade oferece o quarto e o banco recusa com `409` (antes era `500`). Não foi contada como achado, porque a delegação manda registrar e não corrigir.
- `npx vitest run tests/reservation-multiroom.test.js` isolado: **24/24 passam** (8,4 s).

## Não foi possível verificar
- Suíte completa, cobertura e `qa_checks`: não rodados (banco compartilhado). Os números do executor foram aceitos sem conferência.
- Migrate em banco legado (3 execuções seguidas, venda dupla → código 1): não refeito. O caso da 🟡 "principal trocado na develop" não foi reproduzido, só lido.
- `/security-review` (exigido pela delegação por haver mudança de autorização): fora do escopo deste agente.
- Cliente tipado do frontend: não regenerado para medir o impacto do Swagger desatualizado.

## Estado do ambiente ao encerrar
- Dois scripts `pg` em `scratchpad/` (fora do repositório) rodaram no banco **de teste** `gestao_hotel_test`, depois da execução isolada do arquivo de teste:
  - `race.mjs` (corrida do 🔴): fez commit de um UPDATE de datas e de um INSERT no pivô. Depois **desfez os dois**: apagou a linha inserida e restaurou as datas originais, o que fez o trigger recopiar o período.
  - `swap.mjs` (troca de principal): rodou inteiro dentro de `BEGIN … ROLLBACK`.
- Nenhum arquivo do repositório foi alterado além deste relatório. Nada foi commitado.

---

## Reauditoria (10/10)
**Commits auditados:** `0c39f0b..681d464` (6 commits: `e1b9ef7`, `a3ee53f`, `7724cc8`, `f7fbe34`, `de572eb`, `681d464`) · 18 arquivos
**Achados novos:** 6 (🔴 0 · 🟡 4 · 🟢 2)

### Veredito
**APROVADO COM RESSALVAS**

Os dois 🔴 estão corrigidos e conferidos.
- **🔴-1:** rodei de novo o script de corrida (`race2.mjs`) contra o trigger com `FOR SHARE`. Agora o INSERT do quarto extra **espera** o COMMIT do UPDATE (807 ms, que é o tempo que o script segura a transação) e copia o período novo (2030-01-01 → 2030-01-05). Na primeira auditoria ele terminava sem esperar e copiava 2028.
- **🔴-2:** corrigido. O teste confere o 404 e que o GET não devolve o hóspede de outro hotel.

`npx vitest run tests/reservation-multiroom.test.js` isolado: **36/36**.

Nenhum achado novo é 🔴. Os quatro 🟡 novos são de robustez e concorrência:
- um deadlock reproduzido que vira 500;
- um padrão `return fail()` que pode derrubar o processo quando o banco falha;
- o bypass por UUID em maiúsculas que o /security-review achou na remoção existe também na proteção nova da troca de principal;
- o cancelamento de reserva continua sem lock.

### Estado dos achados da primeira auditoria

| # | Sev. | Achado | Estado | Evidência |
|---|------|--------|--------|-----------|
| 1 | 🔴 | Cópia do período velha (trigger) | ✅ **Resolvido** | `applyDbConstraints.js` (`FOR SHARE`); reproduzido de novo, agora espera e copia o período novo |
| 2 | 🔴 | `guest_id` de outro tenant no PUT | ✅ **Resolvido** | `UpdateReservationController.js:37-40` + teste "🔴-2" |
| 3 | 🟡 | Troca do principal por um extra | ⚠️ **Resolvido com furo** | 409 em `:61-63`, mas comparando o **texto** da requisição. Ver N3 |
| 4 | 🟡 | Principal antigo deixado pela develop | ✅ **Mitigado** (decisão: só listar) | `applyDbConstraints.js:290-303`. A lista sai só no 1º migrate (depois o preenchimento esconde os casos). Ver 🟢 N6 |
| 5 | 🟡 | Recálculo pela presença do campo | ✅ **Resolvido**, com ressalva registrada | Compara o valor (`:42-45`). Add/remove ainda reprecificam pelo preço atual; registrado para a ADR-007. CHECKED_OUT/CANCELLED bloqueados (`reservationChangeGuard.js`) |
| 6 | 🟡 | Cálculo duplicado com `Number` | ✅ **Resolvido** | `CreateBooking` usa `calculateStayTotal` + sinal em centavos. `getAvailableCategories` usa `countNights`/`categoryStayTotal`. A resposta pública em `Number(string de 2 casas)` é só serialização: aceita (contrato do site) |
| 7 | 🟡 | B2B alterável pela recepção | ✅ **Resolvido** | Guarda em Cancel, PUT de quarto/datas, add e remove (409). Check-in e check-out **não** passam pela guarda (conferido: `CheckIn/CheckOutController` não importam a guarda, e o teste de P-2 faz check-in no bloco → 200). `DELETE /reservations/:id` do bloco continua liberado, mas é só ADMIN. Ver N6 |
| 8 | 🟡 | Contrato sem lock em sign e cancel | ✅ **Resolvido** | `CancelContractController` lê o contrato `FOR UPDATE` dentro da transação; `SignContractController` relê com lock e confere `GENERATED`. Ordem de lock contrato → reserva nos dois, sem ciclo com check-in (reserva → quarto) |
| 9 | 🟡 | Swagger | ✅ **Resolvido** | Schema `RoomOccupied` (com `room_ids` opcional documentado), campos do pivô, 400 de datas, 409 de B2B, principal e CHECKED_OUT, DELETE de quarto com 404/409. Detalhe em N6 |
| 10 | 🟡 | `setup:db` sem triggers | ✅ **Resolvido** | `package.json:14` encadeia `node command.js migrate` |
| 11 | 🟡 | Zero noites / datas invertidas | ✅ **Resolvido** | 400 em Create (`:21`) e Update (`:50`). `calculateStayTotal` recusa lista vazia e noites ≤ 0 ou NaN. `paranoid: false` em quarto e categoria |
| 12 | 🟢 | Teste de centavos passava com float | ✅ **Resolvido** | `tests/calculate-stay-total.test.js` (unitário puro) |
| 13 | 🟢 | Caso WAITER pela camada errada | ✅ Anotado | — |
| 14 | 🟢 | Lacunas de teste | ✅ **Resolvido** | Testes de swap, B2B (4 rotas), cross-tenant, CHECKED_OUT, add concorrente, mesmas datas |
| 15 | 🟢 | Erros inconsistentes | ✅ **Parcial**, aceito | 409 da corrida sem `room_ids` agora documentado. AddRoom duplicado concorrente serializado pelo lock (409, não 500). Quarto soft-deletado não dá mais 404. Diferença 409/422 entre rotas registrada |
| 16 | 🟢 | Ordem no migrate | ✅ **Resolvido** | Ocupação por último, erro agregado ao das falhas de índice |
| SR-1 | Médio | Remover o principal com UUID em maiúsculas | ✅ **Resolvido** na remoção (`RemoveRoom…:30`, compara `pivot.room_id`). **A mesma classe sobrevive na troca:** N3 |
| SR-2 | Médio | Add/remove simultâneos com total sobre foto parcial | ✅ **Resolvido** | `lock: UPDATE` na reserva em Add, Remove e Update, + teste com dois POST paralelos |
| SR-3 | Médio | P-3 contornável pela rota de reserva | ✅ **Resolvido** | = #7 |
| Repasse | 🟢 | CheckIn/CheckOut leem o pivô fora da transação | ✅ **Resolvido** | Reserva `FOR UPDATE` + pivô e quartos na transação |

### Achados novos

#### 🟡 N1 [Concorrência / CA-F.1.c] Duas reservas com os mesmos dois quartos em papéis trocados → deadlock → 500
**Onde:** `CreateReservationController.js:57-70` (o trigger insere o principal, depois o loop insere os extras) e `:79` (só `23P01` vira 409); `SignContractController.js:105`; `checkReservationConflict.js` (`isRoomOccupiedError` reconhece só `SequelizeExclusionConstraintError`)

**Cenário (reproduzido no banco de teste, `deadlock.mjs`, com ROLLBACK das duas transações):**
- A: principal X, extra Y. B: principal Y, extra X. Mesmo período, ao mesmo tempo.
- A insere a reserva (o trigger põe X no pivô). B insere a dele (o trigger põe Y).
- A insere Y e espera a entrada não confirmada de B no índice do EXCLUDE. B insere X e espera A. O PostgreSQL detecta o ciclo e aborta uma das duas:
  ```
  [ 'A: 40P01 deadlock detected', 'B ok' ]
  ```
- O Sequelize não mapeia `40P01` para `ExclusionConstraintError`. O perdedor recebe **500** e o log mostra um erro interno.

Os dados não se corrompem (rollback), mas o CA-F.1.c diz "nunca 500". O deadlock nasceu nesta branch: na develop cada reserva gravava uma única linha na tabela com EXCLUDE, e o ciclo era impossível. O mesmo ciclo vale entre Create e Sign, e entre dois Sign com listas sobrepostas.
**Correção sugerida:** em `isRoomOccupiedError`, aceitar também `error?.parent?.code === '40P01'`. A disputa é de ocupação e a resposta certa é 409, ou repetir uma vez. Teste com duas conexões em ordem cruzada, como o script.

#### 🟡 N2 [Robustez] `return fail(...)` sem `await` e `sequelize.transaction()` fora do `try`: falha do banco vira rejeição não tratada e o Node 24 encerra o processo
**Onde:** `UpdateReservationController.js:18-22` e todos os `return fail(...)` (`:33,39,49,50,58,62,70,82`); idem `AddRoomToReservationController.js:17-21`, `RemoveRoomFromReservationController.js:11-15`, `CheckInController.js:13-17`, `CheckOutController.js:13-17`

**Cenário (semântica conferida com Node 24.14):**
1. `return fail()` dentro de `try` **não** passa pelo `catch` quando a promise rejeita. O `catch` só pega o que for `await`ado. Teste mínimo: `async function h(){ try { return fail() } catch {} }` com `fail` rejeitando → `unhandledRejection`. Quando o `rollback()` falha (conexão caída, banco reiniciando: o Sequelize faz `forceCleanup` e relança), a rejeição sai do handler.
2. `await sequelize.transaction()` está **antes** do `try`. Com o pool esgotado (o padrão do Sequelize é `max: 5`, e agora há `FOR UPDATE` segurando conexão) ou com o banco fora do ar, a rejeição também sai do handler.

O Express 4 não trata promise de handler. Não há `process.on('unhandledRejection')` no serviço (grep), e o Node ≥ 15 encerra o processo por padrão. Um soluço do banco derruba o core-service inteiro, com todas as requisições em andamento, em vez de devolver 500. Antes desta rodada, Update, AddRoom e RemoveRoom faziam tudo dentro do `try`; CheckIn e CheckOut já tinham o `findOne` fora (pré-existente).
**Correção sugerida:** `return await fail(...)` (ou `await fail(...); return;`) e mover `const transaction = await sequelize.transaction()` para dentro do `try`, com `transaction?.finished` no `catch`.

#### 🟡 N3 [Integridade] A proteção do 🟡-3 (trocar o principal por um extra) se contorna com o UUID em maiúsculas, a mesma classe do SR-1
**Onde:** `UpdateReservationController.js:42` (`room_id !== reservation.room_id`) e `:61` (`roomIds.has(room_id)`), comparando o **texto da requisição** com o valor que veio do banco

**Cenário (por leitura; o efeito do trigger foi reproduzido na 1ª auditoria com `swap.mjs`):**
- Reserva com principal A e extra `a6100b8e-…`. O cliente envia `PUT { room_id: "A6100B8E-…" }`.
- `RoomModel.findOne` acha o quarto (o PostgreSQL compara uuid sem diferenciar maiúsculas). `roomIds` tem a forma minúscula, então `has()` dá `false` e o 409 não dispara.
- O `save` grava B, e o trigger apaga A e não insere B (`NOT EXISTS`). A reserva perde A em silêncio, o total cai e A fica livre para revenda: exatamente o cenário que o 🟡-3 fechou.

O teste "🟡-3" usa o id em minúsculas, por isso passa.
**Correção sugerida:** depois do `findOne`, usar `room.id` (o valor do banco) em `roomChanged`, no `has()` e na atribuição `reservation.room_id`. Mais um caso de teste com `.toUpperCase()`.

#### 🟡 N4 [Concorrência / máquina de estados] Cancelamento de reserva e webhook PIX ainda leem sem lock e sobrescrevem a transição concorrente
**Onde:** `CancelReservationController.js:18` (findOne sem transação nem lock) e `:33-34` (`save`); `WebhookApi/PixWebhookController.js:64-73` (findOne na transação, mas **sem** `lock`)

**Cenário (por leitura):**
- **Cancel × check-in:** o Cancel lê `PENDING`. O check-in (agora com `FOR UPDATE`) grava `CHECKED_IN` e confirma. O `save` do Cancel espera o lock e depois grava `status='CANCELLED'` por cima. Resultado: hóspede no quarto, reserva `CANCELLED`, `blocks_room=false`. O quarto fica livre para `POST /reservations`, que consulta só o pivô, enquanto está `OCCUPIED`.
- **Webhook × cancel:** o webhook lê `PENDING`, o Cancel confirma `CANCELLED`, e o webhook grava `CONFIRMED`. A reserva cancelada ressuscita. Se o quarto já foi revendido, o EXCLUDE recusa e o webhook dá 500, com o pagamento revertido junto.

O comentário novo do `CheckInController.js:10-12` diz que essa corrida está fechada, mas só um lado ficou travado. O defeito é pré-existente e está na área que a rodada endureceu.
**Correção sugerida:** o mesmo padrão do CheckIn: transação, `findOne` com `lock: UPDATE` e a checagem do status depois do lock. No webhook, só acrescentar `lock: transaction.LOCK.UPDATE`.

#### 🟢 N5 [Contrato interno] `PixProvider.createCharge` passa a receber `amount` como string
**Onde:** `CreateBookingController.js:139` (`amount: depositAmount`, agora `"135.09"`) contra `services/pix/PixProvider.js:11` (`@param {number} params.amount`)
**Cenário:** o `FakePixProvider` faz `Number(amount).toFixed(2)` e funciona. Um provedor real escrito pelo contrato (`amount * 100` funciona por coerção, mas `amount + taxa` concatena) recebe uma string. Corrija a doc da interface (string decimal) ou envie `Number(depositAmount)` só na fronteira com o provedor.

#### 🟢 N6 [Miúdos]
- A lista de "principal antigo" (`applyDbConstraints.js:290-303`) sai **só no 1º migrate**. O preenchimento logo abaixo insere o principal, e a consulta não acha mais os casos. Se o operador perder o log, não há como reencontrá-los. Registre a consulta no relatório ou no PR. Para suspeitas B2B ou CHECKED_OUT, o `DELETE /reservations/:id/rooms/:roomId` sugerido no aviso agora devolve 409 (guarda).
- `POST /reservations` com data em formato inválido que passa na comparação de texto (ex.: `2028-13-40` > `2028-01-10`): `calculateStayTotal` devolve 400 com `{ error }`, mas o Swagger do 400 da criação declara `ValidationErrors` (`{ errors: [] }`).
- `getAvailableCategories` converte o preço em `Number` (`:44`) e depois de volta para centavos (`categoryStayTotal`). O resultado está correto para 2 casas, mas é uma volta desnecessária. Dá para passar a string original.
- Check-in de R1 e check-out de R0 ao mesmo tempo, com dois quartos em papéis trocados (principal de um = extra do outro), travam linhas de `rooms` em ordem oposta. É o mesmo deadlock da N1 em outra tabela, muito raro e pré-existente na forma.
- `DELETE /reservations/:id` (ADMIN) de uma reserva-bloco libera os quartos do contrato `SIGNED`. É só ADMIN, que poderia cancelar o contrato. Fica registrado.

### Lock ordering — o que foi conferido
- **Ordem nos caminhos com lock:** Cancel/Sign de contrato: contrato → reserva. CheckIn/CheckOut: reserva → quartos. Update/Add/Remove: reserva → pivô. O `FOR SHARE` do trigger roda na **mesma** transação que já tem o `FOR UPDATE` da reserva, então não conflita consigo. Nenhum caminho trava reserva → contrato, logo **não há ciclo entre locks de linha** entre CheckIn, CancelContract, Update e o trigger.
- **O único ciclo encontrado** é entre esperas do **EXCLUDE** em reservas diferentes (N1), e o análogo em `rooms` (N6).
- **`FOR SHARE` contra UPDATE da reserva:** a corrida do 🔴-1 agora serializa nas duas ordens. A ordem UPDATE → INSERT foi medida por mim; a ordem inversa foi testada pelo executor.

### Padrão `fail()` + `transaction.finished` — o que foi conferido
- No Sequelize 6.37.8, `rollback()` marca `finished = 'rollback'` **antes** do `await` (`query-interface.js:564`), e `commit()` marca no `finally`. O `if (!transaction.finished) await transaction.rollback()` do `catch` nunca tenta um segundo rollback, nem depois de commit falho. Correto.
- O defeito do padrão é o `return` sem `await` e a abertura fora do `try` (N2), não a checagem de `finished`.

### Não foi possível verificar
- Suíte completa, cobertura, `qa_checks` e migrate com caso fantasma: aceitos do executor, não refeitos (banco compartilhado).
- N3 e N4 não foram reproduzidos por HTTP, só por leitura. O efeito do trigger na N3 já tinha sido reproduzido na 1ª auditoria.

### Estado do ambiente ao encerrar (reauditoria)
- Rodei `npx vitest run tests/reservation-multiroom.test.js` isolado (nenhum vitest rodando, Postgres no ar).
- `race2.mjs`: commit de um UPDATE de datas e de um INSERT no pivô; depois apagou a linha e restaurou as datas.
- `deadlock.mjs`: as duas transações terminaram em ROLLBACK, e nada persistiu.
- Os scripts ficaram no scratchpad, fora do repositório. Nenhum arquivo do repositório foi alterado além deste relatório. Nada foi commitado.

---

## Tratamento da reauditoria (agente executor, 10/10)

Veredito da reauditoria: **APROVADO COM RESSALVAS, 0 🔴**. Ressalvas tratadas antes do PR:

| Achado | Tratamento | Evidência |
|---|---|---|
| N1 deadlock vira 500 | `isRoomOccupiedError` trata `40P01` como ocupação → 409 (o banco escolheu a outra reserva) | Teste novo de papéis trocados, 5 rodadas: antes `[201, 500]`, depois `[201, 409]` |
| N2 rejeição escapa do handler | `return await fail(...)` e transação aberta dentro do `try` nos 5 controllers; rollback do `catch` protegido | Suíte verde |
| N3 troca de principal com UUID em maiúsculas | Update e Create usam o id **canônico** do banco em toda a lógica | Teste novo: antes 200, depois 409 |
| N4 cancelamento de reserva sem lock | `CancelReservationController` lê com `FOR UPDATE` na transação | Suíte verde. **Webhook PIX não tocado** — pendência no PR |
| N5 `amount` do PIX como string | Volta a número na chamada do provider | `public-booking.test.js` verde |
| N6 | Lista de "principal antigo" só no 1º migrate: documentado no PR. Os demais (getAvailableCategories, deadlock raro em `rooms`, DELETE de reserva-bloco pelo ADMIN) ficam como pendência registrada | — |

Portão final: suíte 25 arquivos, 401 passam, 1 skip, cobertura 80,07 / 72,82 / 88,28 / 83,37; `qa_checks.sh` 0 erros.
