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
# Repasse — DONO INDEFINIDO — 15/11/2026
Origem: qa-redteam da T-08.5 (`feature/t085-cabecalho-cartoes`). A área `GuestApi` não aparece no §7 de `docs/DIVISAO_TRABALHO_TIME_09set2026.md`.

### 🟡 [Integridade operacional] Excluir hóspede com estadia em andamento ou reserva futura
**Onde:** `services/core-service/app/Controllers/GuestApi/DeleteGuestController.js:7-9`
**Cenário:** um hóspede tem uma reserva CHECKED_IN, e um `DELETE /guests/:id` responde 204 (soft delete, `paranoid`). A partir daí, `GET /reservations` e `GET /reservations/:id` devolvem `guest: null`, porque o `include` não usa `paranoid: false` (`ListReservationController.js:35`, `GetReservationController.js:14`). A recepção passa a ver "Hóspede removido" numa estadia ativa, no check-out e no recibo.
**Regra violada:** nenhuma regra escrita. É um risco operacional: a estadia fica sem nome visível, e isso não pode ser desfeito pela UI.
**Correção sugerida:** escolher uma das duas opções (é decisão de produto):
- recusar com 409 quando houver reserva PENDING, CONFIRMED ou CHECKED_IN;
- ou incluir o hóspede com `paranoid: false` nas leituras de reserva, como já se faz com quarto e categoria em `calculateStayTotal.js:25`.
