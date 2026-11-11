# Repasses — DONO INDEFINIDO — 11/11/2026

Origem: `docs/qa/redteam_asaas-ressalvas-2_11nov2026.md` (branch `fix/asaas-ressalvas-2`). Os dois achados estão fora do diff auditado e não reprovam a branch. O §3/§7 de `docs/DIVISAO_TRABALHO_TIME_09set2026.md` não define dono do backend de hóspedes (`GuestApi`) nem do find-or-create da reserva pública. Por isso o dono ficou indefinido, e cabe ao Gabriel atribuir.

---

### 🟡 [Dados / duplicidade] Find-or-create do hóspede na reserva pública compara CPF cru
**Onde:** `services/core-service/app/Controllers/PublicBookingApi/CreateBookingController.js:153-157` (busca `cpf: guest.cpf`) e `:171` (grava `cpf: guest.cpf ?? null`)
**Cenário:** um hóspede foi cadastrado na recepção com `cpf: '52998224725'`. Depois ele reserva pelo site com `cpf: '529.982.247-25'` e um e-mail novo. A busca por CPF compara strings e não acha o cadastro. A busca por e-mail também não acha. Resultado: cria um segundo hóspede com o mesmo CPF, só que formatado. O índice parcial `guests_cpf_tenant_unique` não barra, porque as strings diferem. A ficha e o histórico do hóspede ficam divididos em dois cadastros. Com a branch `fix/asaas-ressalvas-2`, o CPF formatado passa a ser validado como correto, mas continua sem ser normalizado.
**Regra violada:** o objetivo declarado no comentário do próprio controller (`:142-146`, "reaproveitar o cadastro"). O `ListGuestController.js:62-66` já reconhece que o CPF é guardado com e sem máscara.
**Correção sugerida:** normalizar com `onlyDigits(guest.cpf)` antes da busca e do `create`. Para casar com os cadastros antigos formatados, comparar por `regexp_replace(cpf, '\D', '', 'g')`, como o `ListGuestController` já faz. A solução definitiva é normalizar na gravação, em todos os pontos que gravam hóspede.

### 🟢 [Validação] CRUD de hóspede aceita CPF com dígito verificador inválido
**Onde:** `services/core-service/app/Controllers/GuestApi/CreateGuestController.js:12-20`, `services/core-service/app/Controllers/GuestApi/UpdateGuestController.js:20`
**Cenário:** a recepção grava `cpf: '12345678901'`, que tem verificador inválido, e o cadastro é aceito. Mais tarde esse hóspede reserva pelo site com Asaas e recebe 400 `guest.cpf inválido`, sem entender por quê. Pode ser intencional (passaporte ou digitação provisória no balcão). Então é decisão de produto, não defeito confirmado.
**Regra violada:** nenhuma regra escrita. Inconsistência entre o balcão e a reserva pública.
**Correção sugerida:** decidir se o balcão valida. Se validar, reusar `app/utils/isValidCpf.js` (criado nesta branch) e ajustar os testes do CRUD, que hoje usam CPFs inválidos (`12345678901`, `123.456.789-00`).
