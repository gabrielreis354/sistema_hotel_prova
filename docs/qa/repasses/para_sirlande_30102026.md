# Repasse para Sirlande — 30/10/2026
Origem: `docs/qa/redteam_tenant-fk-validation_24out2026.md` (branch `fix/tenant-fk-validation`, ponta 02ab6f4, trilha do Gabriel em área de quartos e categorias). O defeito já existia antes da branch, está fora do diff e não a reprova.

### 🟢 [Validação] `GET /rooms/:id` e `GET /room-categories/:id` com id não-UUID respondem 500
**Onde:** `services/core-service/app/Controllers/RoomApi/GetRoomController.js:8` · `services/core-service/app/Controllers/RoomCategoryApi/GetRoomCategoryController.js:7`
**Cenário (reproduzido em 02ab6f4, Postgres 17 isolado):** `GET /rooms/abc` → **500** `Erro interno do servidor`. O `abc` chega ao Postgres como cast inválido para uuid. O mesmo acontece em `GET /room-categories/abc`. O cliente espera 404 para recurso inexistente, como no resto do sistema (`ListReservationAccountsController.js:19`).
**Regra violada:** entrada inválida deve responder 4xx, nunca 500 (R-5 do repasse de 21/10).
**Correção sugerida:** buscar com `findInTenant(Model, id, tenantId)` (`app/utils/findInTenant.js`, criado nesta branch) ou fazer `if (!isUuid(id)) return 404` antes da busca. Aplicar junto com o 🟡-3 do relatório principal, que trata o mesmo problema no PUT e no DELETE desses recursos.
