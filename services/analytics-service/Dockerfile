# ─── Stage 1: dependências de produção ───────────────────────────────────────
FROM node:24-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ─── Stage 2: imagem final ────────────────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app

# Contexto de build: services/analytics-service. Nenhum segredo entra na imagem — .dockerignore
# exclui .env* e keys/; a chave PÚBLICA do JWT e as senhas chegam só em runtime (volume/secret).
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN rm -rf tests/ vitest.config.js

# Segurança: não executar como root
USER node

EXPOSE 3001

# /health é READINESS, não liveness (docs/infra/KUBERNETES.md, seção do analytics-service): responde 503
# de propósito com o banco do analytics ou o broker fora, e o consumidor reconecta sozinho. No Compose isto
# só marca "unhealthy"; não use este caminho para reiniciar o contêiner (liveness do k8s, restart do Swarm).
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.NODE_WEB_PORT||3001)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "_web.js"]
