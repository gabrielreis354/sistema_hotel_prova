# Entrega para o Orquestrador (J1) — Fase 0 do Frontend

**De:** J3 (Frontend) · worktree `~/hotel-j3`
**Para:** J1 (integra em `develop`)
**Data:** 07/08/2026
**Branch:** `feature/frontend-fase0-fundacao` — empurrada para `origin`, rastreada
**Base:** `develop` @ `471cacb`
**Status:** 🟢 PRONTO PARA MERGE (J3 não mergeia — quem integra é você)

---

## 1. O que mergear

Branch `feature/frontend-fase0-fundacao`, **9 commits lógicos**:

```
41e9dd5 chore(frontend): scaffold do monorepo pnpm + turborepo e preset compartilhado
c181906 feat(domain): dinheiro em centavos, datas America/Sao_Paulo e maquinas de estado
f19b6af feat(ui): design system compartilhado (tokens de status, Button, StatusBadge)
f819528 feat(api-client): cliente tipado gerado do OpenAPI do backend
a8eb0b2 feat(pms): casca, login e roteamento por papel com proxy do Vite
3b14055 chore(frontend): estrutura reservada de booking e admin (pos-TCC)
cd7c9e1 fix(frontend): tratar ressalvas do qa-redteam na Fase 0
86ae8c5 docs(frontend): relatorio da Fase 0 e auditoria qa-redteam
15c77e2 docs(coord): Fase 0 do frontend pronta para merge (J3)
```

Todo o código novo vive em **`frontend/`** (diretório novo). A raiz do backend
**não foi tocada** — Dockerfile, CI, K8s e `package.json` da raiz intactos.

## 2. Risco de conflito: ~zero

- `frontend/` é diretório novo → não colide com o trabalho do J2 (`app/`, `routes/`, etc.).
- **Não** editei nenhum arquivo de registro de alto risco (`database/relations.js`,
  `routes/router.js`, `command.js`, `config/swagger.js`, `package.json` da raiz).
- Único ponto de contato com o backend é **leitura**: o `pnpm gen:api` importa
  `config/swagger.js` para gerar tipos — não modifica nada.

Merge sugerido: `git merge --no-ff feature/frontend-fase0-fundacao` a partir de `develop`.

## 3. Como verificar depois do merge

```bash
cd frontend
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24 && corepack enable pnpm
pnpm install
pnpm --filter @hotel/domain test    # 30 testes verdes
pnpm --filter app-pms build         # tsc + vite, build limpo
```

Estado dos portões na entrega: `qa:checks` 0 erros · domain 30/30 · typecheck limpo ·
build ok · **QA Red Team: APROVADO COM RESSALVAS (0 🔴)** — relatório em
`docs/qa/redteam_frontend_fase0_07ago2026.md`.

## 4. O que essa entrega destrava / não destrava

- ✅ **Fase 1 (recepção) destravada** — todos os endpoints já existem. É o meu próximo passo.
- ⛔ **Fase 2 (comanda) continua bloqueada pelo backend**: o `WAITER` precisa de acesso a
  `/products` e `/accounts` (hoje só foi restringido em `/rooms`, `/users`, `/analytics`).
  Depende das Fatias 1 / 2a / 3a do J2.

## 5. Duas pendências que dependem de você / do J2 (não bloqueiam a Fase 1)

1. **Swagger sem schema de resposta** na maioria dos endpoints (ex.: `/auth/login` 200 sem
   `content`). O cliente tipa path/params/body, mas o corpo da resposta fica sem tipo — por
   isso `login()` tipa o retorno localmente. Ao documentar `/accounts` (Fatia 5 do J2), peça
   o `content` das respostas 2xx: os tipos do frontend passam a vir de graça.
2. **Matriz de permissão do `WAITER`** ainda incompleta no backend (herdada da Fatia 0). O
   roteamento por papel do frontend já está pronto para ela; é definir no backend.

## 6. Ordem de integração recomendada

Fase 0 do frontend é **independente** da fila do J2 — pode mergear a qualquer momento, não
precisa esperar as fatias de consumo. Só não deixe a Fase 1 (que vou abrir stacked em cima
desta) chegar antes desta Fase 0 entrar em `develop`.

---

*Detalhe técnico completo em `docs/historico_sessao/gabriel/frontend_fase0_fundacao_07ago2026.md`.*
