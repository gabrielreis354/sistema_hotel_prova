# ─── Stage 1: dependências de produção ───────────────────────────────────────
FROM node:24-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ─── Stage 2: imagem final ────────────────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app

# Copia somente o necessário
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Remove pastas que não pertencem ao runtime
RUN rm -rf docker/ docs/ db/ modelagem/ queries/ scripts/ seed/ .gitignore

# Segurança: não executar como root
USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "_web.js"]
