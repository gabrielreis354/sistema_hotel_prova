# Repasse — DONO INDEFINIDO — 22/11/2026

Origem: red team da branch `fix/t0612-log-sem-dado-pessoal` (SPEC-06, T-06.12), em `docs/qa/redteam_t0612-log-sem-dado-pessoal_22nov2026.md`. O achado fica fora do escopo da branch e não entra no veredito dela.

## 🟡 [LGPD] Sem error handler no Express: JSON malformado imprime um trecho do corpo no log
**Onde:** `services/core-service/routes/router.js:41`. O `express.json` está montado, mas não existe middleware de erro `(err, req, res, next)` nem no router nem no `_web.js`. Quem trata o erro é o `finalhandler` padrão do Express, que faz `console.error(err.stack)` sempre que `env !== test`.
**Cenário:** o cliente manda `POST /guests` com o corpo `{"cpf":"52998224725","full_name": Maria Sigilo}`, um JSON inválido. A resposta é 400 e o stderr do container recebe `SyntaxError: Unexpected token M, ..."ll_name": Maria Sigi"... is not valid JSON`, com um trecho do dado pessoal. O caso foi reproduzido com o app em `env=production`. Vale também para `/public/:subdomain`, que é aberto à internet. O `logError` da T-06.12 não cobre esse caminho, porque ele não passa por nenhum controller.
**Regra violada:** LGPD art. 46 e art. 6º, III.
**Correção sugerida:** registrar um middleware de erro no fim do `router.js`. Para `err.type === entity.parse.failed`, responder 400 sem logar o corpo. Para o resto, chamar `logError(express, err)` e responder 500 genérico.
