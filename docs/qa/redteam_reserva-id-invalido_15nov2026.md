# QA Red Team — reserva com id inválido responde 404
**Branch:** `fix/reserva-id-invalido-404` · **Dev:** Gabriel · **Base:** develop@c62cdba · **Data:** 15/11/2026
**Arquivos auditados:** 2 no diff (`routes/apis/reservationRouter.js`, `tests/reservation-invalid-id.test.js`), mais 9 lidos para contexto
**Achados no escopo:** 5 (🔴 0 · 🟡 1 · 🟢 4) · **Repassados:** 2

## Veredito
**APROVADO COM RESSALVAS**

Não há 🔴 no escopo. A correção faz o que diz: 11 rotas que davam 500 com `:id` inválido agora respondem 404 com o corpo `{ error: 'Reserva não encontrada' }`, igual ao que os controllers já devolviam. A ressalva é o 🟡-1: o comentário novo afirma que `:roomId` "segue validado no controller", e isso não é verdade. `DELETE /reservations/:id/rooms/:roomId` com `roomId` inválido continua respondendo 500.

Reprodução executada com uma sonda Vitest temporária, já apagada, contra o Postgres 17 efêmero do runner. O teste novo também rodou: 13/13 verdes.

---

## Achados no escopo

### 🟡-1 [Robustez / comentário falso] `:roomId` inválido em `DELETE /:id/rooms/:roomId` continua 500
**Onde:**
- `services/core-service/routes/apis/reservationRouter.js:31`. O comentário diz ":roomId e :consumptionId seguem validados nos controllers".
- `services/core-service/app/Controllers/ReservationApi/RemoveRoomFromReservationController.js:29`. O `roomId` vai cru para `ReservationRoomModel.findOne({ where: { reservation_id: id, room_id: roomId } })`, sem `isUuid`.

**Cenário (reproduzido):**
```
ADMIN DELETE /reservations/<uuid-real-do-tenant>/rooms/nao-e-uuid → 500 {"error":"Erro interno do servidor"}
```
O Postgres recusa o cast (22P02) dentro da transação, e o erro cai no catch do controller (`:78-80`).
Só `:consumptionId` é validado de fato (`DeleteConsumptionController.js:22`).

Para a defesa funcionar, o `:id` precisa ser de uma reserva que existe no tenant. Não há vazamento: o 500 não expõe dado e a transação volta inteira. Mas é o mesmo defeito que a branch se propôs a fechar, no mesmo router. O comentário ainda vai convencer o próximo leitor de que o caso está coberto.

**Regra violada:** o objetivo declarado da branch ("id que não existe é 404") e a precisão da documentação no código.

**Correção sugerida:** o menor ajuste é `router.param('roomId', …)` com 404 `{ error: 'Quarto não vinculado a esta reserva' }`, o mesmo corpo de `:30`. A alternativa é um `isUuid(roomId)` no controller. Em qualquer dos dois casos, corrigir o comentário de `:31` e acrescentar a rota ao `ROUTES` do teste.

### 🟢-1 [Autorização] Não-ADMIN recebe 404 em vez de 403 nas rotas ADMIN quando o id é inválido
**Onde:** `reservationRouter.js:32-35` em conjunto com `:41` e `:55`. No Express 4, o callback de `router.param` roda **antes** da pilha da rota, e portanto antes do `requireRole('ADMIN')`.

**Cenário (reproduzido, RECEPTIONIST):**
```
DELETE /reservations/nao-e-uuid                                   → 404 Reserva não encontrada
DELETE /reservations/<uuid-qualquer>                              → 403 Acesso não autorizado
DELETE /reservations/nao-e-uuid/consumptions/<uuid>               → 404 Reserva não encontrada
DELETE /reservations/<uuid>/consumptions/<uuid>                   → 403 Acesso não autorizado
```
**Classificação:** 🟢. Não há vazamento: o 404 só diz que o texto não tem formato de UUID, o que o cliente já sabe, e nada sobre a existência de um registro. Nenhuma ação passa: o 404 encerra a requisição, e com UUID válido o 403 continua valendo. O que fica é uma inconsistência de ordem, autorização depois de validação sintática.

O WAITER **não** é afetado. A allowlist de papel roda no `authMiddleware` (`middlewares/auth.middleware.js:29-32`), dentro do `router.use` da linha 26, antes de qualquer `param`.

**Correção sugerida:** aceitar e registrar a ordem num comentário, mais um caso no teste que fixe o comportamento escolhido. Se o time preferir 403 primeiro, mover o `requireRole('ADMIN')` dessas duas rotas para um `router.use` com caminho, antes dos handlers.

### 🟢-2 [Contrato] `DELETE /:id/consumptions/:consumptionId` mudou a mensagem do 404 para `reservationId` inválido
**Onde:** `reservationRouter.js:33` contra `DeleteConsumptionController.js:22-23`.
**Cenário:** antes, `DELETE /reservations/nao-e-uuid/consumptions/<uuid>` respondia `404 {"error":"Consumo não encontrado"}`. Agora responde `404 {"error":"Reserva não encontrada"}`. O status é o mesmo.

Nenhum teste nem o frontend dependem do texto antigo: `grep "Consumo não encontrado" frontend/apps` não acha nada, e o `serverMessage` (`reservationsApi.ts:53-61`) só repassa o texto. A mudança é inócua, mas não foi declarada no commit.

**Correção sugerida:** uma linha no relatório de sessão. Nada no código.

### 🟢-3 [DRY] Validações de `:id` que ficaram redundantes
**Onde:**
- `app/Controllers/ReservationApi/ListReservationAccountsController.js:18-19`, o `if (!isUuid(id)) …404`;
- `app/Controllers/ConsumptionApi/DeleteConsumptionController.js:22`, a metade `!isUuid(reservationId)`. A metade `consumptionId` **continua necessária**.

Os dois controllers só são montados em `reservationRouter.js` (`:52` e `:55`, confirmado por grep em `routes/`), então o `router.param` sempre roda antes deles. Os ramos agora são código morto.

**Correção sugerida:** remover os dois trechos, ou mantê-los como defesa em profundidade com comentário dizendo isso. Hoje o comentário de `ListReservationAccountsController.js:18` sugere que o controller é a única barreira.

### 🟢-4 [Swagger] `DELETE /reservations/{id}` documenta só o 204
**Onde:** `services/core-service/config/swagger.js:1039`, que também aparece em `frontend/packages/api-client/openapi.json`.
**Cenário:** as outras 12 operações de `/reservations/{id}…` já declaram 404, conferido no `openapi.json`. O DELETE declara só 204. Faltam o 404, que o controller já devolvia (`DeleteReservationController.js:18`) e que esta branch agora também emite, e o 403 do `requireRole('ADMIN')`. Com isso, o cliente tipado vê o `error` dessa operação sem tipo.
**Regra violada:** CLAUDE.md §6, contrato Swagger. A lacuna é anterior à branch, mas a rota é uma das que ela altera.
**Correção sugerida:** acrescentar `403` e `404` (schema `Error`) e regenerar o `openapi.json`.

### Teste que prova menos do que diz (incluído nos achados acima, detalhado aqui)
`tests/reservation-invalid-id.test.js`:
- `ROUTES` (`:16-28`) cobre 11 das 13 rotas com `:id`. Ficaram de fora `DELETE /:id/rooms/:roomId` e `DELETE /:id/consumptions/:consumptionId`. É justamente por essa lacuna que o 🟡-1 passou.
- Nenhum caso fixa a ordem papel × id (🟢-1). Se alguém trocar a ordem, nenhum teste fica vermelho.
- `:43-47` ("UUID válido que não existe continua 404") não confere o corpo. Um 404 genérico do Express (`{}`) também passaria.
- O teste "sem token continua 401" (`:38-41`) é útil. Ele falharia se o `authMiddleware` saísse do `router.use` para uma lista por rota, porque nesse caso o `param` rodaria antes.

---

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | `:id` não-UUID vira 500 em 9 routers autenticados (contracts, corporate-clients, event-quotes, guests, payments GET, room-categories GET, rooms GET, users e o `installmentId` de contracts) | ver repasse | DONO INDEFINIDO | `docs/qa/repasses/para_dono-indefinido_15112026.md` |
| 🟡 | `GET /public/:subdomain/bookings/:id/status` (sem auth) com `:id` não-UUID → 500 | `routes/apis/publicBookingRouter.js:21` | Gabriel (T-06.5, endpoint público) | `docs/qa/repasses/para_gabriel_15112026.md` |

Nenhum dos dois é 🔴: o 500 não expõe dado no corpo e não há efeito financeiro.

---

## O que foi verificado e está correto
- **Toda rota com `:id` deste router usa o id da reserva.** As 13 rotas foram conferidas, e `:roomId`/`:consumptionId` são parâmetros separados. Não há rota literal capturada por `/:id`. Um caminho sem rota (`GET /reservations/nao-e-uuid/inexistente`) dá o 404 padrão do Express (`{}`), sem passar pelo `param`.
- **Ordem com auth, tenant e allowlist de papel:** `router.use(authMiddleware, tenantMiddleware)` (`:26`) roda antes do `param`. A allowlist do WAITER está no `authMiddleware`. Sem token, a resposta continua 401.
- **Corpo do 404 compatível com o frontend:** `reservationsApi.ts` lê `{ error }` via `serverMessage` (`:53-61`) e trata o 404 pelo status (`getReservation :99-105`, transições, pagamento).
- **Swagger:** 12 das 13 operações já documentam 404 (exceção no 🟢-4).
- **UUID em maiúsculas** continua 200, porque o regex usa `/i`. UUID sem hífens ou entre chaves, que o Postgres aceitava, agora dá 404. É uma mudança de comportamento, mas nenhum cliente do sistema emite esses formatos (os ids vêm do próprio servidor). Ela também elimina a classe de bypass por formato alternativo citada em `RemoveRoomFromReservationController.js:32-35`.
- **Tenant isolation:** o `param` não consulta o banco. Toda a busca continua nos controllers, com `tenant_id`.
- ESM, sem `require()`, e sem dependência nova. `isUuid` foi reutilizado de `app/utils/`.
- O teste novo rodou: 13/13 verdes.

## Não foi possível verificar
- A suíte completa do core (1.228 testes, segundo o dev) não foi rodada, por instrução recebida. Rodaram só o teste novo e a sonda.
- A cobertura do CI não foi medida.
- Artefato do runner: `services/core-service/.env.test` foi (re)gerado pelo script, mas está no `.gitignore` (`.gitignore:10`). A sonda e o symlink de `node_modules` foram removidos, e o `git status` do worktree ficou limpo.

## Desfecho (Gabriel + IA, 15/11)
- 🟡-1 corrigido: `router.param('roomId')` responde 404 `{ error: 'Quarto não vinculado a esta reserva' }` e o comentário do router foi ajustado.
- Testes: o `ROUTES` passou a cobrir as 13 rotas (as duas com segundo parâmetro entraram); novos casos para `:roomId` e `:consumptionId` inválidos; o caso do UUID inexistente confere o corpo. Arquivo: 17/17. Suíte do core: 61 arquivos, 1232 testes (21 pulados, pipeline sem broker).
- 🟢-1 a 🟢-4 ficam registrados, sem correção nesta branch (sem efeito na demonstração).
