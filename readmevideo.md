# README — Opção A: Docker / Orquestração Local

> **Este arquivo é um rascunho para revisão antes de ser integrado ao README.md principal.**
> Deve passar por PR revisado na branch develop antes de ser mesclado.
> Autora: Sirlande — 24/06/2026

---

## 1. Identificação do Projeto

**Título:** Sistema de Gestão de Hotel — Backend API REST SaaS Multi-Tenant

**Descrição:** API REST para gerenciamento hoteleiro completo: cadastro de hotéis (multi-tenant), quartos por categoria, hóspedes, reservas com máquina de estados protegida (PENDING → CONFIRMED → CHECKED_IN → CHECKED_OUT / CANCELLED), check-in/out automático e pagamentos. Cada hotel opera em isolamento total no mesmo banco de dados.

**Caminho Escolhido:** Opção A — Docker / Orquestração Local (Docker Compose)

---

## 2. Pré-requisitos

| Ferramenta | Versão mínima | Como verificar |
|---|---|---|
| Docker Desktop | 24+ | `docker --version` |
| Docker Compose plugin | v2+ | `docker compose version` |
| Git | qualquer | `git --version` |
| bash | qualquer | disponível no WSL2 por padrão |

> Node.js **não precisa** estar instalado na máquina — a aplicação roda inteiramente nos contêineres.

---

## 3. Gestão de Segredos e Configurações

Credenciais ficam no arquivo `.env` da raiz (nunca commitado — listado no `.gitignore`).

```bash
# Copiar o template
cp .env.example .env
```

Edite `.env` e defina ao menos:

```env
POSTGRES_PASSWORD=senha_forte_aqui
JWT_SECRET=chave_jwt_longa_e_aleatoria
```

> **Aviso:** Nunca commite o `.env` com senhas reais. O arquivo `.env.example` existe para documentar as variáveis sem expor valores sensíveis.

As outras variáveis já têm padrões seguros no `.env.example`:

| Variável | Padrão | Obrigatório no .env? |
|---|---|---|
| `POSTGRES_DB` | `gestao_hotel` | Não |
| `POSTGRES_USER` | `hotel_user` | Não |
| `POSTGRES_PASSWORD` | — | **Sim** |
| `JWT_SECRET` | — | **Sim** |
| `REDIS_URL` | `redis://redis:6379` | Não |

---

## 4. Guia de Instalação e Execução (How to Up)

### Opção Rápida — Script automatizado (CI/CD local)

```bash
# 1. Clone o repositório
git clone https://github.com/gabrielreis354/sistema_hotel_prova.git
cd sistema_hotel_prova

# 2. Configure as credenciais
cp .env.example .env
# Edite .env: defina POSTGRES_PASSWORD e JWT_SECRET

# 3. Execute o pipeline completo (build → deploy → migrate)
bash scripts/infra_up.sh
```

O script `infra_up.sh` executa em sequência:
1. **Build** — constrói a imagem com tag versionada (git describe)
2. **Image Generation** — aplica as tags `:<versão>` e `:latest`
3. **Deploy** — sobe todos os serviços via docker compose
4. **Migrations** — cria/atualiza tabelas no banco de dados
5. **Status** — exibe serviços rodando, rede e volumes

### Opção Manual — passo a passo

```bash
# Passo 1 — Clone
git clone https://github.com/gabrielreis354/sistema_hotel_prova.git
cd sistema_hotel_prova

# Passo 2 — Credenciais
cp .env.example .env   # edite POSTGRES_PASSWORD e JWT_SECRET

# Passo 3 — Build da imagem (multi-stage)
docker build -t sistema-gestao-hotel-backend:latest .

# Passo 4 — Subir todos os serviços
docker compose up -d

# Passo 5 — Verificar se estão saudáveis
docker compose ps

# Passo 6 — Executar as migrations
docker compose exec node_web node command.js migrate

# Passo 7 — (Opcional) Popular com dados de exemplo
docker compose exec postgres psql -U hotel_user -d gestao_hotel \
  -f /dev/stdin < seed/seed_hotels.sql

# Passo 8 — Verificar o sistema
curl http://localhost/health
```

---

## 5. Detalhamento Técnico da Infraestrutura

### Otimização de Imagens — Multi-stage Build

O `Dockerfile` usa dois estágios para garantir imagem enxuta e segura:

```
Stage 1 — deps (node:24-alpine)
  COPY package*.json ./
  RUN npm ci --omit=dev          ← só dependências de produção

Stage 2 — runner (node:24-alpine)
  COPY --from=deps /app/node_modules   ← copia artefato pronto
  COPY . .                              ← código-fonte
  USER node                             ← não executa como root
  EXPOSE 3000
  HEALTHCHECK ...
```

O `.dockerignore` impede que `node_modules/`, `.env`, `tests/`, `docs/`, `.git/` e `k8s/` sejam enviados ao daemon, reduzindo o contexto de build.

**Resultado:** imagem ~120 MB (vs ~800 MB sem multi-stage), sem ferramentas de compilação, sem usuário root.

### Arquitetura de Rede — Custom Bridge com DNS Interno

Quatro serviços em uma rede bridge customizada `hotel_network`:

```
Internet
    │
  :80
    │
 [ nginx ] ──────────────────────── hotel_network (bridge)
    │                                      │
    │  http://node_web:3000                │
    ▼                                      │
 [ node_web ]──── redis://redis:6379 ──► [ redis ]
    │
    │  postgres://postgres:5432
    ▼
 [ postgres ]
```

- **Nginx** é o único serviço com porta mapeada no host (`80:80`)
- **node_web, postgres e redis** são inacessíveis diretamente do host
- A resolução entre serviços usa o nome do serviço (DNS interno do Docker), nunca IPs fixos

### Persistência de Dados — Named Volumes

```yaml
volumes:
  postgres_data:   # dados do PostgreSQL — sobrevive a restart e remoção do container
  redis_data:      # dados persistidos do Redis (appendonly yes)
```

Bind mounts não são usados para dados persistentes — apenas Named Volumes gerenciados pelo Docker. Os dados sobrevivem à recriação dos contêineres e só são apagados com `docker compose down -v`.

### Segurança

| Medida | Implementação |
|---|---|
| Banco inacessível externamente | `postgres` sem `ports:` — sem mapeamento no host |
| Cache inacessível externamente | `redis` sem `ports:` |
| API inacessível diretamente | `node_web` sem `ports:` — só via nginx |
| Credenciais no `.env` | Nunca hardcoded no compose ou Dockerfile |
| Compose falha sem senha | `POSTGRES_PASSWORD:?` — variável obrigatória |
| Imagem não-root | `USER node` no Dockerfile |
| Variáveis de ambiente isoladas | `.env` no `.gitignore`, `.env.example` documenta sem expor valores |

---

## 6. Evidências de Funcionamento e Verificação

```bash
# Listar todos os serviços e status
docker compose ps

# Ver os logs de todos os serviços
docker compose logs --tail=30

# Inspecionar a rede bridge — confirmar DNS interno e containers conectados
docker network inspect sistema_hotel_prova_hotel_network

# Verificar os volumes nomeados
docker volume ls | grep -E "postgres_data|redis_data"

# Testar o health check da API (via nginx na porta 80)
curl http://localhost/health

# Confirmar que o banco É INACESSÍVEL diretamente pelo host
# (deve recusar conexão — nenhuma porta exposta)
psql -h localhost -p 5432 -U hotel_user -d gestao_hotel
# Resultado esperado: "connection refused" — comportamento correto

# Teste de persistência — reinicia o postgres e prova que os dados sobrevivem
docker compose exec postgres psql -U hotel_user -d gestao_hotel \
  -c "SELECT COUNT(*) as total_tenants FROM tenants;"
docker compose restart postgres
sleep 5
docker compose exec postgres psql -U hotel_user -d gestao_hotel \
  -c "SELECT COUNT(*) as total_tenants FROM tenants;"
# Resultado: mesmo número — dados persistiram no Named Volume

# Verificar imagem construída (tamanho — benefício do multi-stage)
docker images sistema-gestao-hotel-backend
```

**URLs de acesso:**
- Sistema: `http://localhost`
- Health check: `http://localhost/health`
- Swagger (documentação interativa): `http://localhost/api-docs`

---

## 7. Troubleshooting e Limpeza

### Problemas comuns

**Erro: `POSTGRES_PASSWORD obrigatório`**
```bash
# Crie/edite o .env com a variável definida
echo "POSTGRES_PASSWORD=senha_aqui" >> .env
echo "JWT_SECRET=chave_aqui" >> .env
```

**Serviço não sobe (CrashLoop)**
```bash
docker compose logs <nome-do-servico>
```

**Migrations não executadas**
```bash
docker compose exec node_web node command.js migrate
```

### Limpeza após avaliação

```bash
# Para os serviços (mantém volumes — dados do banco preservados)
docker compose down

# Para os serviços E apaga os dados do banco permanentemente
docker compose down -v

# Remove a imagem construída
docker rmi sistema-gestao-hotel-backend:latest
```

> **Atenção:** `docker compose down -v` apaga permanentemente os Named Volumes e todos os dados do banco. Esta operação é irreversível.

---

*Rascunho — Sirlande — 24/06/2026*
*Aguarda revisão e integração ao README.md via PR no develop*
