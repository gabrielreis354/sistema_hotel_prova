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
