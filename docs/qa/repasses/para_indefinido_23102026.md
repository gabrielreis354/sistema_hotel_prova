# Repasses — DONO INDEFINIDO — 23/10/2026

Dois repasses do mesmo dia, de auditorias diferentes.

## Origem: qa-redteam da T-05.2 (`feature/t052-reservas`) — `docs/qa/redteam_t052-reservas_21out2026.md`

### 🟡 [Contrato de API] `GET /reservations/:id` não devolve a categoria dos quartos que o Swagger promete
**Onde:** `services/core-service/app/Controllers/ReservationApi/GetReservationController.js:15,17` (`RoomModel` incluído sem `include` de `RoomCategoryModel`) · Swagger `components.schemas.Room.category` (via `ReservationDetail.room` e `ReservationDetail.rooms[]`)
**Cenário:** a tela de detalhe da reserva (`ReservationDetailPage.tsx:265,270`) lê `room.category.name` e `room.category.price_per_night` → sempre `undefined` → a lista de quartos sai sem categoria e sem tarifa por noite. O cliente tipado diz que o campo existe; em produção ele nunca chega.
**Regra violada:** Swagger como contrato do cliente tipado (CLAUDE.md §6 do checklist do qa-redteam; DIVISAO §4.2 princípio 5).
**Correção sugerida:** incluir `{ model: RoomCategoryModel, as: 'category', attributes: ['id', 'name', 'price_per_night'] }` em `room` e `rooms` (mesmo padrão de `ListAvailableRoomsController.js:21`), com teste de contrato; ou retirar `category` do schema desse endpoint.

## Origem: qa-redteam da H.2 (`feature/analytics-service`)

Origem: `docs/qa/redteam_analytics-service-h2_21out2026.md`, raiz do achado 🟡-4 (branch `feature/analytics-service`, H.2 da T-01.4). O §7 da `DIVISAO_TRABALHO_TIME_09set2026.md` não atribui os controllers `GuestApi/`; os Models são do Sirlande.

### 🟢 [validação] O core aceita `full_name` em branco no cadastro e na edição de hóspede
**Onde:** `services/core-service/app/Controllers/GuestApi/UpdateGuestController.js:13` (`if (full_name !== undefined) guest.full_name = full_name;`). `CreateGuestController.js:9` usa `!full_name`, que barra `""` mas aceita `"   "`. `app/Models/GuestModel.js:17-20` tem só `allowNull: false`, sem `notEmpty`.
**Cenário:** `PUT /guests/:id` com `{ "full_name": "" }` ou `{ "full_name": "   " }` responde 200 e grava um hóspede sem nome:
- a ficha, o rack e as listas mostram vazio;
- o trigger publica `guest.updated` com o nome em branco;
- o analytics recusa o evento como permanente e o manda para a DLQ, e a projeção mantém o nome anterior (ver 🟡-4 do relatório).
**Regra violada:** Fail Fast, validação de entrada (CLAUDE.md §8, passo 1 do controller padrão).
**Correção sugerida:** `if (full_name !== undefined && (typeof full_name !== 'string' || !full_name.trim())) return 400` no update, e o mesmo teste no create. Opcional: `validate: { notEmpty: true }` no model e `CHECK (btrim(full_name) <> '')` no banco.
