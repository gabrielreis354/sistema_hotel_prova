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

CMD ["node", "_web.js"]
