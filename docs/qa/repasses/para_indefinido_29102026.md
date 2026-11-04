# Repasses — DONO INDEFINIDO — 29/10/2026

Origem: reauditoria delta do qa-redteam da `feature/analytics-service` (H.2), relatório
`docs/qa/redteam_analytics-service-h2_delta_24out2026.md`. Continuação de `para_indefinido_23102026.md`
(nome de hóspede em branco).

### 🟢 [validação] Nome de hóspede em branco ainda entra pela reserva pública e pela assinatura de contrato
**Onde:** `services/core-service/app/Controllers/PublicBookingApi/CreateBookingController.js:43`
(`if (!guest?.full_name)`) e `services/core-service/app/Controllers/ContractApi/SignContractController.js:19-28`
(`full_name: client.representante_nome` sem validação)
**Cenário:** `POST` da reserva pública com `guest.full_name: "   "`. A string não é vazia, então passa
pelo `!guest?.full_name`, e o `GuestModel` só tem `allowNull: false`. O hóspede é criado com nome em
branco e aparece assim na ficha, no rack e no evento `guest.created`. A branch H.2 fechou esse caminho
só em `GuestApi` (`isNonBlankString`). O consumidor do analytics agora aceita texto em branco, então não
há mais DLQ: o que sobra é dado ruim na operação.
**Regra violada:** Fail Fast / consistência da validação do mesmo campo (DRY, CLAUDE.md §7: "validação
do mesmo campo reescrita em vários controllers").
**Correção sugerida:** usar `isNonBlankString` (`app/utils/isNonBlankString.js`) nos dois pontos, ou
pôr `validate: { notEmpty: true }` com `trim` no `full_name` do `GuestModel`, que cobre todos os caminhos
de uma vez.
