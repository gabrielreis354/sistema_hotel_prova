# Repasses — DONO INDEFINIDO — 23/10/2026

## Origem: qa-redteam da T-05.2 (`feature/t052-reservas`) — `docs/qa/redteam_t052-reservas_21out2026.md`

### 🟡 [Contrato de API] `GET /reservations/:id` não devolve a categoria dos quartos que o Swagger promete
**Onde:** `services/core-service/app/Controllers/ReservationApi/GetReservationController.js:15,17` (`RoomModel` incluído sem `include` de `RoomCategoryModel`) · Swagger `components.schemas.Room.category` (via `ReservationDetail.room` e `ReservationDetail.rooms[]`)
**Cenário:** a tela de detalhe da reserva (`ReservationDetailPage.tsx:265,270`) lê `room.category.name` e `room.category.price_per_night` → sempre `undefined` → a lista de quartos sai sem categoria e sem tarifa por noite. O cliente tipado diz que o campo existe; em produção ele nunca chega.
**Regra violada:** Swagger como contrato do cliente tipado (CLAUDE.md §6 do checklist do qa-redteam; DIVISAO §4.2 princípio 5).
**Correção sugerida:** incluir `{ model: RoomCategoryModel, as: 'category', attributes: ['id', 'name', 'price_per_night'] }` em `room` e `rooms` (mesmo padrão de `ListAvailableRoomsController.js:21`), com teste de contrato; ou retirar `category` do schema desse endpoint.
