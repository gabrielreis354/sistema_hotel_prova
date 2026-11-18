# Repasses do QA Red Team: DONO INDEFINIDO (16/11/2026)

`packages/ui` não tem dono (DIVISAO_TRABALHO_TIME_09set2026.md §7, mecanismos de curadoria).

## 🟢 [Acessibilidade] O erro do `Field` entra no nome acessível do campo
**Origem:** auditoria da T-10.1 (`docs/qa/redteam_t101-login_16112026.md`). O defeito já estava antes dessa branch.
**Onde:** `frontend/packages/ui/src/Field.tsx:14-22`
**Cenário:** o `<span role="alert">` com a mensagem de erro fica **dentro** do `<label htmlFor>`. Como o nome do
campo é calculado a partir de todo o conteúdo do label (accname 1.2, 2F), o campo com erro passa a se chamar, por exemplo,
"Senha Informe a senha". O leitor de tela repete o erro no nome a cada foco, e um
`getByRole('textbox', { name: 'Senha', exact: true })` deixa de achar o campo. Vale para todo formulário que usa `Field`.
**Status:** CONFIRMADO no código. O anúncio exato não foi verificado no navegador.
**Regra violada:** WCAG 2.5.3 (o nome tem que bater com o rótulo visível); o certo é o erro como descrição (`aria-describedby`), não como parte do nome.
**Correção sugerida:** renderizar `<div>` com `<label htmlFor>{label}</label>`, `{children}` e o erro como irmãos, com
`id` no erro, e o consumidor ligando `aria-describedby`. Ou o `Field` gera o id e o injeta. Mexe em todo consumidor: avaliar junto com a T-10.4.
