# Fatia 0 — Pré-requisitos de Backend para o Frontend
**Agente:** J2 (Backend) · worktree `~/hotel-j2`
**Branch:** `fix/backend-prep-frontend` (base `develop` @ `169f99a`)
**Data:** 02/08/2026
**Status:** 🟢 PRONTO PARA MERGE (não mergeado — quem integra é J1)

---

## O que foi entregue

Caminho crítico da coordenação: enquanto esta fatia não entra em `develop`, o Agente Frontend (J3)
fica preso na Fase 0. Três gaps resolvidos:

| # | Entrega | Arquivos |
|---|---|---|
| 1 | **CORS** habilitado no router compartilhado, allowlist via `CORS_ORIGINS` (default `*` em dev/CI), preflight OPTIONS → 204 | `middlewares/cors.middleware.js` (novo), `routes/router.js`, `.env.example` |
| 2 | **`GET /reservations`** com `?from=&to=` (sobreposição de período) e paginação `?page=&limit=` (`{ data, total, page, limit }`); sem query, array puro preservado; validação de formato de data | `app/Controllers/ReservationApi/ListReservationController.js`, `config/swagger.js` |
| 3 | **Role `WAITER`**: `CHECK` em `schema.sql`, validação em Create/Update (via `app/utils/roles.js`), gates `requireRole('ADMIN','RECEPTIONIST')` em leituras de `/rooms` e todo `/analytics` | `db/schema.sql`, `app/Controllers/UserApi/{Create,Update}UserController.js`, `app/utils/roles.js` (novo), `routes/apis/{roomRouter,analyticsRouter}.js` |

Testes: `tests/backend-prep.test.js` (12 casos).

## Decisões de design

- **CORS hand-rolled** (ESM, sem dependência nova) em vez do pacote `cors` — evita churn no
  `package.json`/lockfile, que é arquivo de registro de alto risco de conflito entre agentes.
- **CORS no `routes/router.js`** (não em `_web.js`) — é a peça comum a `_web.js` e ao `createApp`
  dos testes, então fica testável via supertest.
- **`VALID_ROLES` em `app/utils/roles.js`** — fonte única espelhando o `CHECK` do banco (DRY).

## Portões de qualidade

| Portão | Resultado |
|---|---|
| `npm run qa:checks` (camada 1) | ✅ 0 erros — 2 avisos pré-existentes fora do diff |
| `npm test` (suíte completa) | ✅ 14 arquivos, **172 passando**, 1 skip |
| QA Red Team (camada 2) | **APROVADO COM RESSALVAS** — 0 🔴 · relatório em `docs/qa/redteam_fatia0_02ago2026.md` |

Ambiente de teste: container `postgres:17` (`hotel-test-pg`, `localhost:5432`) + `.env.test` (git-ignored).
O Postgres da unifaat (porta 6789) **não** foi usado.

## Correções aplicadas a partir do QA (ressalvas baratas)

- 🟡 Validação de role no `UpdateUserController` (antes: role inválido virava 500 pelo CHECK; agora 400).
- 🟢 Validação de formato de `?from=/?to=` (antes: `?from=abc` → 500; agora 400).

## Pendências (ressalvas não bloqueantes registradas para J1)

- 🟡 **CORS default aberto** (`CORS_ORIGINS=*`): mitigado (sem `Allow-Credentials`, auth por Bearer),
  mas em produção o default deveria ser fail-safe. Ação: definir `CORS_ORIGINS` explícito no deploy.
- 🟡 **Least-privilege do WAITER incompleto**: hoje o garçom ainda lê `/reservations`, `/guests` e
  cria/edita reserva. O escopo definitivo do WAITER depende das fatias de consumo (ele precisará de
  `/accounts` e `/products`). Definir a matriz de permissão do garçom junto da Fatia 2a/3a.
- 🟢 Lógica de sobreposição de datas inline em `ListReservationController` — candidata a util
  compartilhado se a regra reaparecer.

## Commits

```
b6961eb feat(cors): habilitar CORS no router compartilhado
892eb5c feat(reservations): filtro por periodo e paginacao em GET /reservations
1da44d4 feat(rbac): criar role WAITER e restringir gestao ao ADMIN/RECEPTIONIST
d1248a8 test(backend-prep): cobertura da Fatia 0
022a4ff fix(qa): tratar ressalvas baratas do redteam na Fatia 0
+ docs(coord): Fatia 0 pronta para merge (J2)
```

## Próxima fatia

**Fatia 1 — `feature/product-catalog`** (CRUD de `Product`, aditiva). Lembrar: `WAITER` deve **ler**
`/products` (precisa do cardápio) mas não escrever; `command.js` precisa importar o model novo.
