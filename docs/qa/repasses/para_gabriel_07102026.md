# Repasses — Gabriel — 07/10/2026

Origem: `docs/qa/redteam_paranoid-unique-merge_07out2026.md` (auditoria do PR #82)

### 🟢 [Swagger / T-06.2] Respostas de erro de `/products` sem `content` nem schema `Error`
**Onde:** `services/core-service/config/swagger.js:1188-1191` (POST) e `:1231` (PUT 409)
**Cenário:** o resto do arquivo, reescrito na T-06.2, declara
`content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }` em 400/404/409.
Em `/products` o 400 e o 409 têm só `description`. O cliente gerado tipa o corpo como `never`/ausente,
e o frontend perde o `error` da mensagem "Já existe um produto com esse nome".
**Regra violada:** SPEC-06 CA-06.2 (respostas com schema).
**Correção sugerida:** acrescentar `content` com `Error` (409) e `ValidationErrors`/`Error` (400),
como nos outros paths, e regenerar o cliente.
