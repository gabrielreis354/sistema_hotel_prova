# Repasses para Sirlande — 22/11/2026

Origem: `docs/qa/redteam_spec11-cpf-hospede_22nov2026.md`, o QA Red Team da branch `fix/spec11-cpf-hospede` (Gabriel, SPEC-11 T-11.1, base `develop@705717e`). O achado abaixo é da ficha do hóspede e já existia antes da branch. Por isso não conta no veredito dela.

### 🟡 [UI / dado] A tela de edição do hóspede não consegue apagar o CPF, o telefone nem o e-mail
**Onde:** `frontend/apps/pms/src/features/guests/GuestForm.tsx:17-24` (`toInput`: `cpf: values.cpf || undefined`, o mesmo vale para `phone` e `email`), usado pelo `GuestEditPage` em `GuestFormPages.tsx:75-80`
**Cenário:**
1. Abrir `/hospedes/:id/editar` de um hóspede com CPF.
2. Apagar o campo CPF e salvar.

`toInput` transforma `''` em `undefined`, e o `JSON.stringify` tira a chave do body. O `UpdateGuestController` trata `cpf === undefined` como "não mexer" e mantém o CPF antigo. A tela navega para a ficha como se tivesse salvo. Com a T-11.1 isso pesa mais: um hóspede antigo com CPF errado (`123`, ou o CPF de outra pessoa) só sai da ficha se a recepção souber o CPF correto. A API já aceita `cpf: ''` ou `null` para apagar, e há teste disso em `services/core-service/tests/guest-cpf.test.js`. A tela é que nunca manda.
**Regra violada:** uma ação do usuário que não tem efeito e não avisa nada. A edição precisa permitir apagar um campo opcional.
**Correção sugerida:** na edição, mandar `null` para o campo esvaziado (`cpf: values.cpf ? values.cpf : null`, e o mesmo para `phone` e `email`). O backend já trata `null` como vazio no POST e no PUT. Para o tipo `GuestInput`, aceitar `string | null`, que o swagger já declara como `nullable`. Vale um teste do `GuestForm` com o campo esvaziado que espere `cpf: null` no `onSubmit`.
**Confirmado por:** leitura de código. Não reproduzi no navegador.
