# Frontend — PMS Hotel SaaS

Monorepo do frontend. Vive dentro do mesmo repositório do backend, isolado em `frontend/`.
A raiz do repositório **continua sendo o backend** (npm) e não deve virar workspace pnpm —
isso quebraria Dockerfile, CI e os manifests K8s. Dentro de `frontend/` usa-se **pnpm**.

Plano completo: `docs/frontend/PLANEJAMENTO_FRONTEND.md`.

## Estrutura

```
frontend/
├── apps/
│   ├── pms/       React + TS + Vite (SPA/PWA) — recepção, gerência, garçom  [foco do TCC]
│   ├── booking/   site público (Next.js) — estrutura criada, implementação pós-TCC
│   └── admin/     backoffice de tenants (SPA) — estrutura criada, pós-TCC
└── packages/
    ├── config/      preset de tsconfig / tailwind / eslint compartilhado
    ├── domain/      dinheiro (centavos), datas (America/Sao_Paulo), máquinas de estado
    ├── ui/          design system (tokens de status, densidade, alvo de toque)
    └── api-client/  cliente tipado gerado do OpenAPI (config/swagger.js do backend)
```

## Pré-requisitos do ambiente (WSL)

O PATH deste WSL resolve Node errado em shell não-interativo. Antes de qualquer comando:

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24
corepack enable pnpm
node --version   # v24.x
```

## Comandos

```bash
cd frontend
pnpm install            # instala todo o workspace
pnpm gen:api            # regenera os tipos a partir de config/swagger.js do backend
pnpm --filter @hotel/domain test
pnpm --filter app-pms dev    # sobe o Vite em :5173 com proxy /api -> :3000
pnpm build              # build de todos os pacotes/apps (turbo)
```

## Integração com o backend

O `app-pms` fala com o backend real via **proxy de dev do Vite** — o browser enxerga
mesma origem (`localhost:5173/api/...`), então não há CORS em desenvolvimento:

```ts
// apps/pms/vite.config.ts
server: { proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') } } }
```

Suba o backend (`node _web.js` na raiz, com Postgres no ar) para integrar de verdade.
