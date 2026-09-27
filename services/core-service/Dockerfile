# ─── Stage 1: dependências de produção ───────────────────────────────────────
FROM node:24-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ─── Stage 2: imagem final ────────────────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app

# O contexto de build é services/core-service (o backend saiu da raiz em 15/09).
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Remove o que não pertence ao runtime. seed/ fica — é executado em produção/contingência
# via "node command.js seed" (seed_hotels.sql lido em runtime, não em build).
RUN rm -rf db/ tests/ vitest.config.js

# Segurança: não executar como root
USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "_web.js"]
