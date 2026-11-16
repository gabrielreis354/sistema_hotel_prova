# Repasse — DONO INDEFINIDO — 15/11/2026

Origem: red team da branch `fix/t092-cpf-formatado` (`docs/qa/redteam_t092-cpf-formatado_15nov2026.md`).

## 🟡 [Dados] O mesmo CPF gravado em formatos diferentes passa pela checagem de duplicidade
**Onde:**
- `services/core-service/app/Controllers/GuestApi/CreateGuestController.js:13`, com `findOne({ where: { cpf, tenant_id } })` comparando o texto exato;
- o índice único `guests_cpf_tenant_unique` em `services/core-service/app/Models/GuestModel.js:50-53`, também sobre o texto.

**Cenário:**
1. `POST /guests` com `{ full_name: 'Ana', cpf: '30000000014' }` responde 201.
2. `POST /guests` com `{ full_name: 'Ana Souza', cpf: '300.000.000-14' }` também responde 201, sem o 409 esperado.

Depois da T-09.2, a lista mostra os dois como `300.000.000-14`: a mesma pessoa duplicada no mesmo tenant, e a conta e as reservas ficam divididas entre os dois cadastros. O `UpdateGuestController.js:20` tem o mesmo problema.

**Regra violada:** integridade do cadastro, porque o unique por tenant fica ineficaz. LGPD art. 6º, V (qualidade dos dados).

**Correção sugerida:** normalizar o CPF para só dígitos ao gravar (criar e atualizar) e migrar os registros existentes. Ou, no mínimo, comparar `regexp_replace(cpf, '\D', '', 'g')` na checagem de duplicidade. A SPEC-09 §5 registra esse trabalho como "sem dono": falta atribuir.

---

Origem: red team da branch `fix/reserva-id-invalido-404` (`docs/qa/redteam_reserva-id-invalido_15nov2026.md`).

## 🟡 [Robustez] `:id` não-UUID vira 500 em 9 routers autenticados
**Onde** (rota no router; o controller passa o texto cru para o `WHERE`):
- `routes/apis/contractRouter.js:18,19,21,25,26,27,28`. Em `:27`, também o `:installmentId` (`PUT /contracts/<uuid>/installments/x/pay` dá 404 só porque o contrato não existe; com contrato real, não verificado).
- `routes/apis/corporateClientRouter.js:14,16,17`
- `routes/apis/eventQuoteRouter.js:17,18,20,21,22,23`
- `routes/apis/guestRouter.js:17,19,20`
- `routes/apis/paymentRouter.js:28` (só o GET; `void` e `PUT` já validam)
- `routes/apis/roomCategoryRouter.js:18` (só o GET; `PUT` e `DELETE` já dão 404)
- `routes/apis/roomRouter.js:24` (só o GET; `PUT`, `release` e `DELETE` já dão 404)
- `routes/apis/userRouter.js:18,20,21`

**Cenário (reproduzido como ADMIN, Postgres 17):** `GET /guests/x`, `GET /contracts/x`, `GET /users/x`, `DELETE /guests/x` e as demais rotas listadas respondem `500 {"error":"Erro interno do servidor"}`. `GET /payments/x` responde `500 {"error":"Erro ao buscar pagamento."}`. O esperado é 404. O log registra o erro 22P02 com o SQL completo, que inclui o `tenant_id`.

**Regra violada:** um recurso inexistente deve responder 404, mesmo critério da correção de `/reservations`. O 500 também infla a métrica de erro do Prometheus.

**Correção sugerida:** o mesmo `router.param(id, …)` de `reservationRouter.js:32-35` em cada router, com a mensagem de 404 do controller correspondente. Para controllers que usam `findInTenant` (`app/utils/findInTenant.js:31`), o caminho já existe.

---

Origem: qa-redteam da T-08.5 (`feature/t085-cabecalho-cartoes`). A área `GuestApi` não aparece no §7 de `docs/DIVISAO_TRABALHO_TIME_09set2026.md`.

### 🟡 [Integridade operacional] Excluir hóspede com estadia em andamento ou reserva futura
**Onde:** `services/core-service/app/Controllers/GuestApi/DeleteGuestController.js:7-9`
**Cenário:** um hóspede tem uma reserva CHECKED_IN, e um `DELETE /guests/:id` responde 204 (soft delete, `paranoid`). A partir daí, `GET /reservations` e `GET /reservations/:id` devolvem `guest: null`, porque o `include` não usa `paranoid: false` (`ListReservationController.js:35`, `GetReservationController.js:14`). A recepção passa a ver "Hóspede removido" numa estadia ativa, no check-out e no recibo.
**Regra violada:** nenhuma regra escrita. É um risco operacional: a estadia fica sem nome visível, e isso não pode ser desfeito pela UI.
**Correção sugerida:** escolher uma das duas opções (é decisão de produto):
- recusar com 409 quando houver reserva PENDING, CONFIRMED ou CHECKED_IN;
- ou incluir o hóspede com `paranoid: false` nas leituras de reserva, como já se faz com quarto e categoria em `calculateStayTotal.js:25`.
