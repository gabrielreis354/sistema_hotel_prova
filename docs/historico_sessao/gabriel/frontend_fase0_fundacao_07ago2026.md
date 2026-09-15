# Fase 0 — Fundação do Frontend (app-pms + design system)
**Agente:** J3 (Frontend) · worktree `~/hotel-j3`
**Branch:** `feature/frontend-fase0-fundacao` (base `develop` @ `471cacb`)
**Data:** 07/08/2026
**Status:** 🟢 PRONTO PARA MERGE (não mergeado — quem integra é J1)

---

## O que foi entregue

Monorepo de frontend em `frontend/` (isolado do backend, que segue na raiz em npm). A raiz
**não** virou workspace pnpm — Dockerfile, CI e K8s intocados. Ordem do plano §11 seguida:
domínio primeiro, depois UI, app e cliente de API.

| # | Entrega | Pacote/App |
|---|---|---|
| 1 | Scaffold pnpm + Turborepo, tsconfig base, preset do Tailwind com tokens (§10) | raiz `frontend/`, `@hotel/config` |
| 2 | Dinheiro em centavos (DECIMAL string → inteiro, sem `Number()`), datas fixas em `America/Sao_Paulo`, máquinas de estado (allowlist) | `@hotel/domain` — **30 testes** |
| 3 | Design system: `cn()`, `Button` (alvo 48px), `StatusBadge` (cor + rótulo sempre) | `@hotel/ui` |
| 4 | Cliente HTTP tipado gerado do OpenAPI (`config/swagger.js`), injeta JWT, derruba sessão em 401 | `@hotel/api-client` |
| 5 | Login (RHF+Zod) contra `POST /auth/login`, sessão persistida (Zustand), `ProtectedRoute` + `RequireRole`, `AppShell` com nav por papel, proxy Vite `/api → :3000` | `app-pms` |
| 6 | Estrutura reservada (pós-TCC) | `app-booking`, `app-admin` |

## Decisões de design

- **Just-in-Time packages**: os pacotes exportam `src/index.ts` direto; o Vite/Vitest
  transpila. Sem passo de build intermediário entre pacotes — menos atrito no monorepo.
- **Dinheiro nunca é float**: `decimalToCents` parseia a string do `pg` sem passar por
  `Number()` no valor; aritmética em inteiro; `formatBRL` só na borda de exibição.
- **Cliente de API tipado do Swagger**: `openapi.json` (37 paths) versionado + `schema.d.ts`
  gerado. Campo que muda no backend vira erro de compilação. Regerável com `pnpm gen:api`.
- **CORS não bloqueou nada**: proxy de dev do Vite = mesma origem. Integração real desde já.

## Portões de qualidade

| Portão | Resultado |
|---|---|
| `npm run qa:checks` (camada 1, raiz) | ✅ 0 erros — 2 avisos pré-existentes do backend, fora do meu diff |
| `@hotel/domain` (vitest) | ✅ 3 arquivos, **30 testes** |
| typecheck (domain, ui, api-client, pms) | ✅ tudo limpo |
| `pnpm --filter app-pms build` (tsc + vite) | ✅ 440 módulos, tokens de status presentes no CSS |
| Smoke do dev server | ✅ `GET /` → 200; proxy `/api/health` reescreve e encaminha para `:3000` |
| QA Red Team (camada 2) | **APROVADO COM RESSALVAS** — 0 🔴 · `docs/qa/redteam_frontend_fase0_07ago2026.md` |

## Correções aplicadas a partir do QA (ressalvas baratas)

- 🟡 Sessão não caía em 401 → adicionado `onUnauthorized` no cliente que chama `logout()`.
- 🟡 `baseUrl` de produção → `VITE_API_URL ?? '/api'` (+ `vite-env.d.ts`).
- 🟡 Cobertura de domínio → `multiplyCents(string)`, `centsToDecimalString` negativo, `formatDateTimeBR`.
- 🟡 Login sem `aria-invalid` → adicionado nos campos com erro.

## Pendências (registradas para J1 / próximas fases)

- 🟢 **`StatusBadge` só cobre status de quarto.** Reserva já tem labels no domínio
  (`RESERVATION_STATUS_LABEL`) — unificar num badge genérico na Fase 1 para não duplicar.
- 🟢 `formatBRL` usa `cents / 100` (float) — aceitável por estar isolado na exibição.
- ⚠️ **Backend bloqueia a Fase 2 (comanda), não a Fase 1.** Falta `WAITER` com acesso a
  `/products` e `/accounts` (hoje o WAITER só foi restringido em `/rooms`, `/users`,
  `/analytics`). Depende das Fatias 1/2a/3a do J2. Fase 1 (recepção) está destravada.
- ⚠️ **Swagger sem schema de resposta na maioria dos endpoints** (ex.: `/auth/login` 200 sem
  `content`). O cliente tipa path/params/body, mas o corpo da resposta fica sem tipo — por
  isso `login()` tipa o retorno localmente. Conforme o backend enriquecer o Swagger, os
  tipos de resposta passam a vir de graça. Vale pedir ao J2/J1 ao documentar `/accounts`.

## Como rodar

```bash
cd frontend
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24 && corepack enable pnpm
pnpm install
pnpm gen:api                       # regenera tipos do Swagger do backend
pnpm --filter @hotel/domain test   # 30 testes
pnpm --filter app-pms dev          # :5173, proxy /api -> :3000 (suba o backend p/ integrar)
```

## Commits

```
41e9dd5 chore(frontend): scaffold do monorepo pnpm + turborepo e preset compartilhado
c181906 feat(domain): dinheiro em centavos, datas America/Sao_Paulo e maquinas de estado
f19b6af feat(ui): design system compartilhado (tokens de status, Button, StatusBadge)
f819528 feat(api-client): cliente tipado gerado do OpenAPI do backend
a8eb0b2 feat(pms): casca, login e roteamento por papel com proxy do Vite
3b14055 chore(frontend): estrutura reservada de booking e admin (pos-TCC)
cd7c9e1 fix(frontend): tratar ressalvas do qa-redteam na Fase 0
```

## Próxima fase

**Fase 1 — Recepção** (§11): Hóspedes e Quartos primeiro (CRUD simples valida o design
system com risco baixo), depois Reservas, Check-in/out, Hoje e o Rack por último (filtrando
no cliente até o `?from=&to=` do backend chegar). Todos os endpoints já existem.
