# Repasse — Gabriel — 15/11/2026

Origem: red team da branch `fix/reserva-id-invalido-404` (`docs/qa/redteam_reserva-id-invalido_15nov2026.md`).
Área: endpoint público do motor de reserva (T-06.5, trilha do Gabriel, DIVISAO §3.1).

## 🟡 [Robustez / endpoint público] `GET /public/:subdomain/bookings/:id/status` com `:id` não-UUID → 500
**Onde:** `services/core-service/routes/apis/publicBookingRouter.js:21` → `GetBookingStatusController`.
**Cenário (reproduzido):** `GET /public/probe/bookings/x/status`, sem token, responde `500 {"error":"Erro interno do servidor"}`. Qualquer pessoa na internet produz 500 à vontade nessa rota: os alertas de taxa de erro disparam e o log enche de stack com SQL. O corpo não expõe dado.
**Regra violada:** um recurso inexistente deve responder 404. Para rota pública, a regra pesa mais, porque não há autenticação filtrando quem chega.
**Correção sugerida:** `isUuid` no controller, ou `router.param(id, …)` no `publicBookingRouter`, devolvendo o mesmo 404 de reserva inexistente (sem diferenciar formato inválido de id ausente).
