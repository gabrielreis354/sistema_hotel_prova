# Fase 1 (início) — Módulo de Hóspedes (app-pms)
**Agente:** J3 (Frontend) · worktree `~/hotel-j3`
**Branch:** `feature/frontend-fase1-hospedes` — **stacked sobre** `feature/frontend-fase0-fundacao`
**Data:** 07/08/2026
**Status:** 🟢 PRONTO PARA MERGE (não mergeado — J1 integra; **mergear a Fase 0 antes**)

---

## Por que stacked

A Fase 0 ainda não está em `develop`. A Fase 1 usa os pacotes `@hotel/{ui,domain,api-client}`,
então nasceu a partir da branch da Fase 0 (não de `develop`). **Ordem de merge obrigatória:**
Fase 0 → Fase 1. Se `develop` avançar, rebaseio.

## O que foi entregue

Primeiro slice da Fase 1 (§11): **Hóspedes** — CRUD simples que valida o design system e o
cliente de API com risco baixo, antes do rack.

| Tela / rota | Função |
|---|---|
| `/hospedes` | Lista com busca no cliente (nome/CPF/e-mail/telefone), estados de loading/erro/vazio |
| `/hospedes/novo` | Cadastro (RHF+Zod); 409 de CPF/e-mail duplicado tratado com mensagem clara |
| `/hospedes/:id` | Ficha: dados + **histórico de estadias** + excluir (confirmação em 2 passos) |
| `/hospedes/:id/editar` | Edição |

Tudo sob `RequireRole(ADMIN, RECEPTIONIST)` — WAITER é redirecionado. Consome o **cliente
tipado** (`@hotel/api-client`) e **TanStack Query** (cache + invalidação) contra o backend
real. Novos primitivos em `@hotel/ui`: `Input`, `Field`, `Card`, `Spinner`, `EmptyState`.

## Integração validada contra o backend REAL

Não é mock. Subi Postgres (docker, creds do `.env`) + `node command.js migrate` + `node _web.js`,
registrei um tenant/admin, criei um hóspede e conferi **pelo caminho do browser** (proxy do Vite):

| Chamada (via `:5173/api` → `:3000`) | Resultado |
|---|---|
| `POST /api/auth/login` | 200 + token |
| `POST /guests` (backend direto) | 201 |
| `GET /api/guests` (Bearer) | 200 — devolve o hóspede criado |
| `GET /api/reservations` (ficha) | 200 — `[]` |

Ambiente de smoke derrubado ao final (container removido, backend parado, porta 3000 livre).

## Portões de qualidade

| Portão | Resultado |
|---|---|
| `npm run qa:checks` (camada 1) | ✅ 0 erros — 2 avisos pré-existentes do backend |
| `app-pms` (vitest — novo harness) | ✅ **5 testes** (`guestFilter`) |
| `@hotel/domain` | ✅ 30 testes (inalterado) |
| typecheck (ui, pms) | ✅ limpo |
| `pnpm --filter app-pms build` | ✅ ok |
| QA Red Team | **APROVADO COM RESSALVAS** — 0 🔴 · `docs/qa/redteam_frontend_fase1_hospedes_07ago2026.md` |

## Correções aplicadas a partir do QA

- 🟡 **Sem testes no app** → adicionado harness vitest no `app-pms` + `guestMatches/filterGuests`
  puro e testado (5 casos). Base de teste para as próximas telas.
- 🟡 **Botões destrutivos < 48px** → voltaram ao tamanho `comfortable` (alvo de toque).
- 🟢 Busca com `aria-label`; erro de exclusão sugere causa provável (409 = reservas vinculadas).

## Pendências (registradas para J1 / backend)

- 🟡 **Histórico da ficha baixa todas as reservas do tenant e filtra no cliente**
  (`GuestDetailPage.tsx`). Aceitável nesta fase (o Swagger não expõe `?guest_id=`), mas não
  escala e traz reservas de terceiros ao browser. **Pedido ao backend:** filtro
  `GET /reservations?guest_id=` (ou incluir estadias em `GET /guests/:id`).
- 🟡 **Swagger sob-documentado** (herdada da Fase 0): `PUT /guests/{id}` sem `requestBody` no
  Swagger → `body as never` pontual e documentado; respostas 2xx sem `content` → `as unknown as`.
  Conforme o backend enriquecer o Swagger, os casts caem sozinhos.
- 🟢 Testes de componente (DOM) ainda não — o harness está em `environment: node`; entra jsdom
  quando houver o primeiro caso que justifique.

## Próximo slice da Fase 1

**Quartos e categorias** (`/config/quartos`, CRUD `/rooms` + `/room-categories`) — mesmo padrão
já validado aqui. Depois Reservas, Check-in/out, Hoje e o **Rack** por último.

## Commits (desta fase, sobre a Fase 0)

```
05b22aa feat(ui): primitivos de formulario e feedback (Input, Field, Card, Spinner, EmptyState)
f75be3b feat(pms): CRUD de hospedes com busca e ficha de historico
fcbeca2 fix(pms): tratar ressalvas do qa-redteam na Fase 1 (hospedes)
```
