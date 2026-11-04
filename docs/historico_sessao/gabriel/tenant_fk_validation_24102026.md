### 2026-10-24 — Gabriel (agente executor orquestrado)

- **Branch:** `fix/tenant-fk-validation` (de `origin/develop@c6742b2`) — **sem PR e sem merge**
- **Worktree / banco:** `/home/gabri/wt-fk-tenant` · PostgreSQL 17 próprio na porta 5451 (container `pg-fk`, removido no fim)
- **Objetivo da sessão:** fechar o vazamento entre hotéis por chave estrangeira vinda do corpo
  (R-1 do qa-redteam de 21/10), varrer a mesma classe de falha em todos os controllers e tratar
  R-2 a R-6 de quartos e categorias.

> **A área de quartos e categorias é da Sirlande.** Ela precisa saber destas mudanças antes do
> merge — o repasse `docs/qa/repasses/para_sirlande_21102026.md` ganhou a seção "Tratamento".

#### Vazamento em leitura?

Não foi encontrado nenhum outro caminho de leitura (GET) devolvendo dado de outro hotel. O
vazamento em leitura do R-1 (`GET /rooms` e `GET /rooms/:id` com nome, diária e `tenant_id` do
hotel B) só existia como consequência da escrita aceita pelo `PUT /rooms/:id`; fechada a escrita,
o caminho fecha. **Dado já gravado antes da correção não é reparado por ela** — ver pendência 1.

#### Varredura — id de outra entidade vindo do corpo

Feita com `git grep -n "request.body" services/core-service/app/Controllers` e leitura de cada
controller que recebe `*_id`/`*_ids`. "Teste" indica onde a regra está travada.

| Endpoint | Campo(s) do corpo | Resultado | Teste |
|---|---|---|---|
| `PUT /rooms/:id` | `category_id` | **corrigido** (aceitava categoria de outro hotel, inexistente → 500) | `tenant-fk-isolation` (R-1) |
| `POST /rooms` | `category_id` | ok (filtrava tenant); não-UUID dava 500 → **corrigido** para 404 | `tenant-fk-isolation` (R-1) |
| `POST /reservations` | `guest_id`, `room_id`, `extra_room_ids` | ok | `tenant-fk-isolation` (novo) |
| `PUT /reservations/:id` | `guest_id`, `room_id` | ok | `reservation-multiroom` (guest) + `tenant-fk-isolation` (room, novo) |
| `POST /reservations/:id/rooms` | `room_id` | ok | `tenant-fk-isolation` (novo) |
| `POST /payments` | `reservation_id`, `account_id` | ok | `account-payments` (conta) + `tenant-fk-isolation` (reserva, novo) |
| `POST /accounts` | `reservation_id`, `room_id`, `guest_id` | ok | `accounts` |
| `POST /accounts/:id/items` | `product_id`, `client_item_id` | ok | `account-items` |
| `POST /contracts` | `corporate_client_id`, `quote_id` | ok | `tenant-fk-isolation` (novo) |
| `PUT /contracts/:id/sign` | `room_ids` | ok | `tenant-fk-isolation` (novo) |
| `PUT /contracts/:id` | `installments[].id` | ok — só casa com parcelas do próprio contrato (já filtrado por tenant) | — |
| `POST /event-quotes` | `corporate_client_id` | ok | `quote-pdf` |
| `PUT /event-quotes/:id` | — (sem FK no corpo) | ok | — |
| `POST /public/:subdomain/bookings` | `category_id` | ok — filtra pelo tenant do subdomínio | — (só leitura de código) |
| `POST /reservations/:id/consumptions` | — (reserva vem da URL, filtrada por tenant) | ok | `bill-consumptions` |
| `PUT /tenants/me`, `POST/PUT /users`, `/guests`, `/products`, `/corporate-clients`, `/payments/:id` | sem FK de outra entidade no corpo | n/a | — |

Utilitário DRY: `app/utils/findInTenant.js` — `findInTenant(Model, id, tenantId, { transaction })`
devolve `null` para id não-UUID, inexistente, de outro tenant ou excluído (paranoid). Usado onde
foi corrigido (quartos); os controllers que já estavam certos não foram refatorados.

#### R-2 a R-6 — regra fixada e justificativa

- **R-3 (status):** a máquina do CLAUDE.md §3 diz que OCCUPIED nasce do check-in, CLEANING do
  check-out e CLEANING → AVAILABLE é manual (limpeza concluída); MAINTENANCE é manual. O código
  confirma: só o `CheckInController` grava OCCUPIED e só o `CheckOutController` grava CLEANING.
  Logo, pela edição: AVAILABLE ↔ MAINTENANCE e CLEANING → AVAILABLE. Reenviar o status atual não
  é transição (o formulário da T-05.1 manda o quarto inteiro de volta — achado 🟡-1 do redteam).
  Transição proibida → 409. Status legado fora da lista só sai para AVAILABLE/MAINTENANCE.
  A edição lê o quarto com `FOR UPDATE` para não sobrescrever um check-in simultâneo.
- **R-4:** 409 só para quarto **vivo** da categoria; quarto excluído não conta.
- **R-5:** reaproveita `parsePrice`/`MAX_PRICE` do produto. Diária > 0 (zero também deixava o
  quarto impossível de reservar), até 2 casas; capacidade inteira ≥ 1 (ausente no cadastro
  continua 1; 0 agora é 400 em vez de virar 1 em silêncio).
- **R-6:** 409 para OCCUPIED ou para quarto em `reservation_rooms` de reserva PENDING, CONFIRMED
  ou CHECKED_IN (principal e extra). Quarto lido com `FOR UPDATE`.
- **Contrato de erro (pedido do coordenador para a T-05.1):** `code` estável em todo
  400/404/409 novo ou alterado — `INVALID_INPUT` (+ `field` e a lista `errors` de sempre),
  `CATEGORY_NOT_FOUND`, `ROOM_STATUS_TRANSITION_NOT_ALLOWED`, `ROOM_IN_USE`, `CATEGORY_IN_USE`,
  `ROOM_NUMBER_TAKEN`, `CATEGORY_NAME_TAKEN` (`app/utils/roomErrors.js`, schema `RoomError`).

O que **não** mudou: rotas, papéis e respostas de sucesso. Os corpos de erro só ganharam campos.
Nenhum endpoint passou a aceitar o que antes recusava; vários deixaram de aceitar entrada inválida
ou deixaram de responder 500.

#### Evidência — saída real

Baseline (`develop@c6742b2`, antes de qualquer mudança):
```
 Test Files  39 passed (39)
      Tests  836 passed | 1 skipped (837)
Statements   : 83.4% ( 2719/3260 )
```

RED do R-1 (antes da correção):
```
 × PUT /rooms/:id com category_id do hotel B → 404 ...   → expected 200 to be 404
 × GET /rooms do hotel A nunca devolve nome nem diária ... → expected '[{"id":...' not to contain 'Luxo B secreta'
 × a reserva do hotel A é cobrada pela diária de A ...   → expected '1998.00' to be '300.00'
 × PUT /rooms/:id com category_id inexistente → 404      → expected 500 to be 404
      Tests  7 failed | 2 passed (9)
```

RED de R-2 a R-6: `Tests  31 failed | 13 passed (44)`. RED do `code`: `Tests  39 failed | 26 passed (65)`.

Suíte completa final (commit `1613915`):
```
 Test Files  41 passed (41)
      Tests  901 passed | 1 skipped (902)
Statements   : 84.32% ( 2829/3355 )
Branches     : 81.02% ( 1516/1871 )
Functions    : 88.4% ( 328/371 )
Lines        : 86.31% ( 2541/2944 )
```

`bash scripts/qa_checks.sh`: `⚠ 3 aviso(s). Nenhum erro bloqueante.` — os mesmos 3 avisos da
`develop@c6742b2` (heurística de nome de recurso no Swagger e dois do frontend), sem regressão.

#### Commits gerados

| Hash | Mensagem |
|------|----------|
| `5c7692c` | `test(rooms): RED do R-1 - category_id de outro hotel no quarto` |
| `02c4473` | `fix(rooms): quarto so aceita categoria do proprio hotel (R-1)` |
| `23d9a77` | `docs(retomada): arquivo de retomada da frente fix/tenant-fk-validation` |
| `42fc9c9` | `test(tenant): regressao das FKs do corpo validadas sem teste` |
| `6f02ee4` | `test(rooms): RED de R-2 a R-6 do repasse de quartos e categorias` |
| `4e690f2` | `fix(rooms): andar 0 preservado e status do quarto em maquina de estados (R-2, R-3)` |
| `671ca39` | `fix(room-categories): diaria e capacidade validadas, categoria em uso nao exclui (R-4, R-5)` |
| `24fa27f` | `fix(rooms): quarto ocupado ou com reserva ativa nao e excluido (R-6)` |
| `107e812` | `docs(swagger): novos 400/404/409 de quartos e categorias` |
| `6c791ee` | `test(rooms): RED do campo code estavel nos erros de quartos e categorias` |
| `1613915` | `fix(rooms): code estavel nos erros de quartos e categorias` |

O R-1 (`5c7692c` + `02c4473`) é independente do resto e pode ir à `develop` sozinho.

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Conferir se algum quarto já aponta para categoria de outro hotel (gravado antes do fix) | 🔴 Alta | `SELECT r.id, r.tenant_id, c.tenant_id FROM rooms r JOIN room_categories c ON c.id = r.category_id WHERE r.tenant_id <> c.tenant_id;` em cada ambiente com dado real. Se vier linha, corrigir à mão e avaliar reservas cobradas |
| 2 | Sirlande revisar RoomApi/RoomCategoryApi antes do merge | 🟡 Média | Área dela; repasse com a seção "Tratamento" |
| 3 | T-05.1 rodar `pnpm gen:api` após o rebase | 🟡 Média | Enum de status do POST /rooms reduzido e schema `RoomError` novo |
| 4 | Rodar o qa-redteam nesta branch antes do merge | 🟡 Média | Fluxo do projeto (`docs/COORDENACAO_AGENTES.md` §5) |
| 5 | CLEANING → MAINTENANCE ficou proibido | 🟢 Baixa | Seguiu a regra da delegação; confirmar com o Gabriel se a governança precisa (quarto com defeito achado na limpeza) |
| 6 | Defesa em profundidade: FK composta `(category_id, tenant_id)` no banco | 🟢 Baixa | Hoje a garantia é só da aplicação; mudança de schema é da Sirlande |
| 7 | `GetRoomController` devolve a categoria inteira (com `tenant_id`) | 🟢 Baixa | Após o R-1 é sempre o próprio tenant; restringir `attributes` mudaria o contrato (a tela pode usar `capacity`) |
| 8 | `PUT /contracts/:id` relê o cliente corporativo sem `tenant_id` (`regenerate_pdf`) | 🟢 Baixa | O id vem do próprio contrato, já filtrado — não explorável; padronizar quando mexer no módulo B2B |
