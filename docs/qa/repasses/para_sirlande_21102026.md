# Repasse para Sirlande — 21/10/2026
Origem: `docs/qa/redteam_t051-quartos-categorias_21out2026.md` (branch `feature/t051-quartos-categorias`, frontend, trilha do Gabriel). São defeitos pré-existentes do backend de quartos e categorias e não reprovam a branch.

Todos foram reproduzidos em backend próprio (Postgres 17 isolado, core-service em `develop@c6742b2`), com dois tenants e um usuário de cada papel.

### 🔴 R-1 [Multi-tenancy / dinheiro] `PUT /rooms/:id` aceita `category_id` de outro tenant
**Onde:** `services/core-service/app/Controllers/RoomApi/UpdateRoomController.js:21`
**Cenário (reproduzido):**
1. O ADMIN do hotel A faz `PUT /rooms/<quarto-de-A> {category_id: <categoria-do-hotel-B>}` e recebe **200**.
2. A partir daí, `GET /rooms` do hotel A devolve `{"name":"Luxo B secreta","price_per_night":"999.00"}`.
3. `GET /rooms/:id` devolve, além disso, o `tenant_id` do hotel B, porque o `include` não tem `attributes`.
4. Uma reserva de 2 noites criada no hotel A para esse quarto saiu com `total_amount = 2.00`, cobrada pela diária do hotel B (`calculateStayTotal` segue a FK).

Um `category_id` inexistente dá **500**, porque a FK estoura no banco.

O `CreateRoomController` valida a categoria com `tenant_id` (linha 16). O `Update` não valida.
**Regra violada:** CLAUDE.md, "Queries sem tenant_id — vazamento cross-tenant é crítico". Recurso aninhado sem validar o pai.
**Correção sugerida:** quando `category_id !== undefined`, fazer `RoomCategoryModel.findOne({ where: { id: category_id, tenant_id } })` e responder 404 se não existir, como no Create. Acrescentar ao `ListRoomController`/`GetRoomController` um teste de isolamento que tente misturar tenants.

### 🟡 R-2 [Integridade] Andar 0 (térreo) vira `null` no cadastro
**Onde:** `RoomApi/CreateRoomController.js:26` (`floor: floor || null`)
**Cenário (reproduzido):** `POST /rooms {floor: 0, ...}` responde 201 com `floor: null`. A edição preserva o 0 (`UpdateRoomController` usa `!== undefined`), então o mesmo quarto se comporta diferente conforme o caminho por onde foi gravado.
**Correção sugerida:** `floor: floor ?? null`.

### 🟡 R-3 [Máquina de estados] Status sem allowlist no cadastro e sem validação de transição na edição
**Onde:** `RoomApi/CreateRoomController.js:27` · `RoomApi/UpdateRoomController.js:12,24`
**Cenário (reproduzido):**
- `POST /rooms {status: "FOO"}` → 201, com `status = "FOO"` gravado.
- `POST /rooms {status: "OCCUPIED"}` → 201: quarto ocupado sem hóspede.
- `PUT /rooms/:id {status: "AVAILABLE"}` sobre um quarto `OCCUPIED` → 200: libera um quarto com hóspede dentro, e ele volta a aparecer em `/rooms/available`.

O PUT confere só se o valor está na lista, não se a transição é válida (blocklist de fato).
**Regra violada:** CLAUDE.md §7, "Blocklist de estados (fail-open) — use allowlist (fail-safe)", e a máquina de quartos do §3 (OCCUPIED e CLEANING só por check-in e check-out).
**Correção sugerida:**
- No Create, aceitar só `AVAILABLE | MAINTENANCE`, com padrão `AVAILABLE`.
- No Update, validar `ROOM_TRANSITIONS[atual].includes(novo)`, excluindo as transições que pertencem ao check-in e ao check-out. Com isso, `OCCUPIED`/`CLEANING` só mudam pelos endpoints dedicados.
- O frontend da T-05.1 já aplica essa regra na tela (`roomRules.ts:35`), mas reenvia o status velho (achado 🟡-1 do relatório). Só o backend fecha o caso.

### 🟡 R-4 [Integridade / dinheiro] Excluir categoria em uso: 204, quarto "sem categoria" e tarifa congelada e invisível
**Onde:** `RoomCategoryApi/DeleteRoomCategoryController.js:9`
**Cenário (reproduzido):**
1. Categoria "Usada" com diária de R$ 200,00 e o quarto 5 vinculado. `DELETE /room-categories/<id>` → **204**.
2. `GET /rooms/5` volta com `category_id` preenchido e `category: null`, e o quarto continua em `GET /rooms/available`.
3. Uma reserva nova para o quarto foi cobrada pela diária da categoria **excluída** (teste com R$ 300,00 → `total_amount = 300.00`), porque `calculateStayTotal.js:28` usa `paranoid: false`.

O administrador vê "Sem categoria" e não tem tela para corrigir uma tarifa que continua sendo cobrada.
**Correção sugerida:** responder 409 quando existir quarto vivo com aquela categoria (`RoomModel.count({ where: { category_id, tenant_id } })`). Hoje só a tela da T-05.1 bloqueia, e ela faz isso baixando todos os quartos.

### 🟡 R-5 [Validação / dinheiro] Categoria aceita diária negativa e capacidade negativa; texto e estouro viram 500
**Onde:** `RoomCategoryApi/CreateRoomCategoryController.js:11,17` · `RoomCategoryApi/UpdateRoomCategoryController.js:14-15`
**Cenário (reproduzido):**
- `POST {price_per_night: "-10.00"}` → 201.
- `PUT {price_per_night: "-50.00", capacity: -3}` → 200, gravado.
- Uma reserva no quarto com diária negativa → 422 ("não possui preço definido"): o quarto fica impossível de reservar, sem explicação na origem.
- `price_per_night: "abc"` → 500.
- `"100000000.00"` (acima de `DECIMAL(10,2)`) → 500.
- `capacity: 0` no Create vira 1 em silêncio (`capacity || 1`).

**Correção sugerida:** validar `price_per_night` como decimal positivo com até 2 casas e teto de `99999999.99`, e `capacity` como inteiro ≥ 1, respondendo 400. Aplicar o mesmo no Update.

### 🟡 R-6 [Integridade] `DELETE /rooms/:id` exclui quarto ocupado
**Onde:** `RoomApi/DeleteRoomController.js:9`
**Cenário (reproduzido):** quarto `OCCUPIED` → `DELETE` → **204**. A tela da T-05.1 bloqueia, mas qualquer chamada direta passa. Não conferi o caso de quarto com reserva futura `CONFIRMED`, que segue o mesmo caminho.
**Correção sugerida:** responder 409 para quarto `OCCUPIED` ou com reserva ativa ou futura (dá para reaproveitar `checkReservationConflict`).
