# Repasse — DONO INDEFINIDO — 23/10/2026
Origem: `docs/qa/redteam_analytics-service-h2_21out2026.md`, raiz do achado 🟡-4 (branch `feature/analytics-service`, H.2 da T-01.4). O §7 da `DIVISAO_TRABALHO_TIME_09set2026.md` não atribui os controllers `GuestApi/`; os Models são do Sirlande.

### 🟢 [validação] O core aceita `full_name` em branco no cadastro e na edição de hóspede
**Onde:** `services/core-service/app/Controllers/GuestApi/UpdateGuestController.js:13` (`if (full_name !== undefined) guest.full_name = full_name;`). `CreateGuestController.js:9` usa `!full_name`, que barra `""` mas aceita `"   "`. `app/Models/GuestModel.js:17-20` tem só `allowNull: false`, sem `notEmpty`.
**Cenário:** `PUT /guests/:id` com `{ "full_name": "" }` ou `{ "full_name": "   " }` responde 200 e grava um hóspede sem nome:
- a ficha, o rack e as listas mostram vazio;
- o trigger publica `guest.updated` com o nome em branco;
- o analytics recusa o evento como permanente e o manda para a DLQ, e a projeção mantém o nome anterior (ver 🟡-4 do relatório).
**Regra violada:** Fail Fast, validação de entrada (CLAUDE.md §8, passo 1 do controller padrão).
**Correção sugerida:** `if (full_name !== undefined && (typeof full_name !== 'string' || !full_name.trim())) return 400` no update, e o mesmo teste no create. Opcional: `validate: { notEmpty: true }` no model e `CHECK (btrim(full_name) <> '')` no banco.
