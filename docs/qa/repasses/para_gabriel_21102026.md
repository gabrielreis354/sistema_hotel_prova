# Repasse para Gabriel — 21/10/2026
Origem: `docs/qa/redteam_t051-quartos-categorias_21out2026.md` (branch `feature/t051-quartos-categorias`). Pré-existente, não reprova a branch.

### 🟡 R-7 [Contrato de API] Três PUTs sem `requestBody` no Swagger forçam `as never` no frontend
**Onde:** `services/core-service/config/swagger.js`, nos blocos de `PUT /rooms/{id}`, `PUT /room-categories/{id}` e `PUT /guests/{id}`
**Cenário:** conferi no `openapi.json` regenerado (46 paths): os três PUTs não têm `requestBody`, e os POSTs correspondentes têm. O `openapi-fetch` tipa o corpo como `never`, e o frontend passou a escrever `body: input as never` em `roomsApi.ts:56`, `roomsApi.ts:91` e `guestsApi.ts:44`. É o mesmo efeito do `as unknown as` que o princípio 5 proíbe, e cada módulo novo vai copiar. Renomear um campo no backend não quebra a compilação de nenhum desses PUTs.
**Regra violada:** `DIVISAO_TRABALHO` §4.2, princípio 5, e §4.4 ("tipo que falta se conserta no Swagger"). O `swagger.js` é de "uma pessoa, uma vez" (§7, T-06.2).
**Correção sugerida:** declarar `requestBody` nos três PUTs (os mesmos campos do POST, todos opcionais, porque o update é parcial), rodar `pnpm gen:api` e remover os três `as never`.

### 🟢 R-8 [Portão de QA] Regra 7 do `qa_checks.sh` dá falso positivo para `roomCategoryRouter`
**Onde:** `scripts/qa_checks.sh:158-165`
**Cenário:** a regra converte `roomCategoryRouter` em `room-category` e procura essa string no `swagger.js`, mas o recurso está documentado como `/room-categories`. O aviso aparece em toda execução e ensina o time a ignorar a seção, que também acusa os casos reais (`corporate-client`, `event-quote`).
**Correção sugerida:** procurar também a forma plural (`room-categor`) ou comparar com os paths reais do spec gerado (`openapi.json`).
