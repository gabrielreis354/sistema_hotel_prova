# Repasse do qa-redteam para o Gabriel, 22/11/2026

Origem: a auditoria da branch `fix/spec11-reserva-passado` (SPEC-11, T-11.2), registrada em `docs/qa/redteam_spec11-reserva-passado_22nov2026.md`. Este achado fica fora do escopo da branch e não entra no veredito dela.

## 🟡 A reserva-bloco B2B nasce com entrada no passado
**Onde:** `services/core-service/app/Controllers/ContractApi/SignContractController.js:99-104`. A data vem do `CreateContractController.js:13-17` e do `UpdateContractController.js:18-27`, e nenhum dos dois valida a data.
**Cenário:** criar um contrato com `check_in` de ontem e assiná-lo. A assinatura grava a reserva `CONFIRMED` com `check_in_date` no passado, sem passar pela régua do CA-11.f ("nenhuma reserva nasce no passado", SPEC-11 §2). A T-11.2 cobriu só o `POST` e o `PUT` de `/reservations`.
**Regra violada:** o objetivo da SPEC-11 §2. O CA-11.f, porém, cita só o `POST /reservations` e a troca de datas. Por isso o achado pode ser uma **decisão de produto**: formalizar por contrato um evento que já começou pode ser legítimo.
**Correção sugerida:** decidir primeiro. Se o caso não for legítimo, reaproveitar o `checkInInPast` de `app/utils/checkInDateGuard.js` na criação e na assinatura do contrato, com 422 `CHECK_IN_IN_PAST`. Se for, registrar a exceção na SPEC-11.

---

Origem: a auditoria da branch `fix/t0612-log-sem-dado-pessoal` (SPEC-06, T-06.12), registrada em `docs/qa/redteam_t0612-log-sem-dado-pessoal_22nov2026.md`. Este achado fica fora do escopo da branch e não entra no veredito dela.

## 🟡 `guest_id` que não é UUID vira 500, e o CPF chega ao log
**Onde:** `services/core-service/app/Controllers/ReservationApi/CreateReservationController.js:40`, `GuestModel.findOne({ where: { id: guest_id, tenant_id } })` sem `isUuid`.
**Cenário:** um cliente manda `POST /reservations` com `guest_id: "52998224725"`, ou seja, o CPF no campo do id. O Postgres devolve 22P02 e a resposta é **500**. O log grava `invalid input syntax for type uuid: "52998224725"`, porque o `safeError` preserva a `message`. O caso foi reproduzido contra o Postgres de teste.
**Regra violada:** Fail Fast. Entrada inválida tem de dar 4xx. Também LGPD art. 46, já que esse 500 é o caminho que leva o CPF ao stdout.
**Correção sugerida:** validar `guest_id` com `isUuid` e responder 404 `Hóspede não encontrado`, ou 422, antes da consulta. O `room_id` já passa pelo `findInTenant`, e o `CreateAccountController.js:47` mostra o padrão. Vale conferir os outros pontos que recebem um id no corpo da requisição.
