# Sistema de Gestão de Hotel — Backend API
## Demonstração Acadêmica de Arquitetura SaaS Multi-Tenant

![Status](https://img.shields.io/badge/status-parcialmente%20pronto-yellow)
![Node.js](https://img.shields.io/badge/node.js-20%2B-brightgreen)
![Database](https://img.shields.io/badge/database-postgresql%2017-blue)
![License](https://img.shields.io/badge/license-academic-lightgrey)

**Versão**: 1.0.0 (Demo) | **Data**: Junho 2026 | **Status**: Pronto para Demonstração Acadêmica ✅

---

## 📖 Índice

- [Visão Geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Tecnologias](#tecnologias)
- [Pré-requisitos](#pré-requisitos)
- [Instalação Rápida](#instalação-rápida)
- [Configuração](#configuração)
- [Execução](#execução)
- [Banco de Dados](#banco-de-dados)
- [API REST](#api-rest)
- [Autenticação](#autenticação)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Boas Práticas](#boas-práticas)
- [Troubleshooting](#troubleshooting)
- [Contribuindo](#contribuindo)
- [Roadmap](#roadmap)

---

## 🎯 Visão Geral

**Sistema de Gestão Hoteleira** é uma aplicação backend em produção (MVP) que demonstra:

### ✅ O Que Está Implementado

| Componente | Status | Detalhes |
|---|---|---|
| **Autenticação** | ✅ Completo | JWT 8h, bcryptjs 10 rounds |
| **Autorização** | ✅ Completo | Roles ADMIN/RECEPTIONIST |
| **Multi-Tenant** | ✅ Completo | Isolamento por hotel_id |
| **CRUD Completo** | ✅ Completo | Usuários, Quartos, Hóspedes, Reservas, Pagamentos |
| **Banco de Dados** | ✅ Completo | PostgreSQL 3NF normalizado |
| **Docker** | ✅ Completo | Docker Compose com 3 serviços |
| **Swagger** | ✅ Completo | Documentação OpenAPI 3.0 |
| **Relacionamentos N:N** | ✅ Completo | Reservas ↔ Múltiplos Quartos |
| **Constraints de Negócio** | ✅ Completo | EXCLUDE gist previne double-booking |

### ❌ O Que NÃO Está (mas é mensurável)

| Componente | Status | Prazo |
|---|---|---|
| **Frontend Web** | ❌ Falta | 4-8 semanas |
| **Testes Automatizados** | ❌ Falta | 2-3 semanas |
| **Módulo Financeiro Avançado** | ❌ Falta | Para TCC |
| **Relatórios** | ❌ Falta | Para TCC |
| **HTTPS/TLS** | ❌ Falta | 1 semana |
| **Logging Estruturado** | ❌ Falta | 3-5 dias |

---

## 🏗️ Arquitetura

### Visão Geral

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTE WEB                           │
│                    (Futuro: Next.js)                         │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS (será implementado)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      NGINX (Reverse Proxy)                   │
│                     Porta 80 → 3000                          │
└──────────────────────────┬────────────────────────────────────┘
                           │ (Rede interna Docker)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   NODE.JS + EXPRESS                          │
│              Controllers → Models → Database                 │
│         Autenticação JWT | Roles ADMIN/RECEPTIONIST          │
└──────────────────────────┬────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              POSTGRESQL 17 (Dados + Multi-Tenant)            │
│         8 tabelas | 3NF normalização | Constraints           │
└─────────────────────────────────────────────────────────────┘
```

### Padrão Arquitetônico: MVC

```
REQUEST → Router → Controller → Model (ORM) → PostgreSQL
         (Route)  (Business)  (Sequelize)

         ↑                                          ↓
         └──────── JSON Response ←────────────────┘
```

### Fluxo de Autenticação

```
1. POST /auth/register
   └─ Cria novo Tenant (Hotel) + Usuário ADMIN
   └─ Retorna: {tenant_id, user_id}

2. POST /auth/login
   └─ Verifica email + password (bcrypt)
   └─ Gera JWT com {userId, tenantId, role}
   └─ TTL: 8 horas

3. Requisições autenticadas
   └─ Header: Authorization: Bearer <JWT>
   └─ Middleware valida e injeta request.user
   └─ Dados filtrados por tenantId (isolamento)
```

### Fluxo de Reserva

```
1. Receptionist cria reserva
   POST /reservations {guest_id, room_id, check_in, check_out}
   └─ Sequelize valida EXCLUDE gist (previne double-booking)
   └─ Cria registro em "reservations"
   └─ Cria pivô em "reservation_rooms" (suporta múltiplos quartos)

2. Receptionist faz check-in
   PUT /reservations/{id}/check-in
   └─ Altera status para "CHECKED_IN"
   └─ Altera quarto status para "OCCUPIED"

3. Receptionist faz check-out
   PUT /reservations/{id}/check-out
   └─ Altera status para "CHECKED_OUT"
   └─ Altera quarto status para "AVAILABLE"
```

---

## 🛠️ Tecnologias

| Camada | Tecnologia | Versão | Finalidade |
|---|---|---|---|
| **Runtime** | Node.js | 20+ LTS | Engine JavaScript |
| **Linguagem** | JavaScript (ES Modules) | — | Sem TypeScript (mantém simples) |
| **Framework Web** | Express.js | 4.19.2 | Servidor HTTP RESTful |
| **ORM** | Sequelize | 6.37.3 | Mapeamento objeto-relacional |
| **Banco de Dados** | PostgreSQL | 17 | RDBMS relacional |
| **Autenticação** | JWT | 9.0.2 | Tokens stateless |
| **Criptografia** | bcryptjs | 2.4.3 | Hash de senhas (10 rounds) |
| **Variáveis** | dotenv | 16.4.5 | Configuração por ambiente |
| **Documentação** | Swagger/OpenAPI | 3.0 | Spec via swagger-jsdoc |
| **UI Swagger** | swagger-ui-express | 5.0.1 | Interface `/api-docs` |
| **Dev Server** | nodemon | 3.1.0 | Hot-reload em desenvolvimento |
| **Container** | Docker | 20.10+ | Isolamento de ambiente |
| **Orquestração** | Docker Compose | 2.10+ | 3 serviços sincronizados |

---

## ✅ Pré-Requisitos

Antes de começar, instale:

### Obrigatório

- **Node.js** 20.x LTS ou superior
  ```bash
  node --version  # deve retornar v20.x.x+
  ```
  - Download: https://nodejs.org/

- **npm** (vem com Node.js) versão 10.x+
  ```bash
  npm --version  # deve retornar 10.x.x+
  ```

- **Docker** 20.10+
  ```bash
  docker --version
  ```
  - Download: https://www.docker.com/

- **Docker Compose** 2.10+
  ```bash
  docker compose --version
  ```
  - (Vem com Docker Desktop no Windows/Mac)

- **Git**
  ```bash
  git --version
  ```
  - Download: https://git-scm.com/

### Recomendado

- **VSCode** com extensões:
  - REST Client (para testar API)
  - PostgreSQL (para gerenciar BD)
  - Prettier (formatação código)

---

## 🚀 Instalação Rápida

### Passo 1: Clonar Repositório

```bash
git clone https://github.com/seu-usuario/sistema_hotel_prova.git
cd sistema_hotel_prova
```

### Passo 2: Instalar Dependências

```bash
npm install
```

Saída esperada: `added 456 packages in 45s`

### Passo 3: Configurar Ambiente

```bash
cp .env.example .env
# Edite .env se necessário (valores padrão já funcionam para dev)
```

### Passo 4: Subir Containers

```bash
docker compose up --build
```

Saída esperada:
```
[+] Running 3/3
 ✓ postgres   3.2s
 ✓ node_web   2.1s
 ✓ nginx      1.5s
```

### Passo 5: Setup do Banco de Dados

**⚠️ IMPORTANTE**: A tabela atual referencia "hotels" no schema mas o modelo usa "tenants"  
**SOLUÇÃO TEMPORÁRIA**: Editar [app/Models/TenantModel.js](app/Models/TenantModel.js#L18) e trocar:
```javascript
tableName: 'tenants', // ← Mude para:
tableName: 'hotels',  // ← Para combinar com schema.sql
```

Depois, executar schema:
```bash
docker exec hotel_postgres psql -U hotel_user -d gestao_hotel < db/schema.sql
docker exec hotel_postgres psql -U hotel_user -d gestao_hotel < seed/seed_hotels.sql
```

### Passo 6: Teste de Saúde

```bash
curl http://localhost/health
```

Resposta esperada:
```json
{
  "status": "OK",
  "timestamp": "2026-06-03T10:00:00.000Z",
  "service": "Sistema de Gestão de Hotel Backend"
}
```

**✅ Pronto!** API está rodando em `http://localhost`

---

## ⚙️ Configuração

### Variáveis de Ambiente

Arquivo: `.env.example` → `.env`

```ini
# ── Servidor ─────────────────────────────────────────────────
NODE_ENV=development              # development ou production
NODE_WEB_PORT=3000                # Porta interna do Express

# ── PostgreSQL ───────────────────────────────────────────────
POSTGRES_HOST=postgres            # Container name (Docker)
POSTGRES_PORT=5432                # Porta padrão PostgreSQL
POSTGRES_DB=gestao_hotel          # Nome do banco
POSTGRES_USER=hotel_user          # Usuário BD
POSTGRES_PASSWORD=hotel_password  # Senha BD (MUDAR EM PRODUÇÃO!)

# ── Segurança ────────────────────────────────────────────────
JWT_SECRET=sua_chave_secreta_aqui # Chave para assinar JWT
                                    # ⚠️ NUNCA fazer commit dessa variável
                                    # ⚠️ Em produção: usar secret forte (32+ chars)
```

### Gerar JWT_SECRET Seguro

```bash
# Linux/Mac:
openssl rand -base64 32

# Windows (PowerShell):
[System.Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Max 256) }))
```

### Variáveis por Ambiente

#### Desenvolvimento (.env)
```ini
NODE_ENV=development
JWT_SECRET=dev_secret_123
POSTGRES_PASSWORD=hotel_password
```

#### Produção (configurar antes de deploy)
```ini
NODE_ENV=production
JWT_SECRET=USAR_OPENSSL_PARA_GERAR_ALGO_SEGURO
POSTGRES_PASSWORD=SENHA_SUPER_SEGURA_MIN_20_CHARS
POSTGRES_HOST=rds.aws.exemplo.com  # BD em cloud (ex: AWS RDS)
```

---

## 🏃 Execução

### Desenvolvimento (Com Hot-Reload)

```bash
npm run dev
```

O servidor reinicia automaticamente ao editar arquivos `.js`

Saída:
```
==================================================
🚀 Servidor Hotel PMS rodando com sucesso!
📡 URL Local: http://localhost:3000
💾 Banco de Dados PostgreSQL conectado via Sequelize
==================================================
```

### Produção

```bash
npm start
```

Sem hot-reload, apenas executa `node _web.js`

### Docker Compose

```bash
# Subir tudo (postgres + node + nginx)
docker compose up --build

# Subir em background
docker compose up -d --build

# Ver logs
docker compose logs -f node_web

# Parar
docker compose down

# Parar e remover volumes (cuidado!)
docker compose down -v
```

---

## 🗄️ Banco de Dados

### Schema

O banco tem **8 tabelas** relacionadas:

```
hotels (Tenant SaaS)
├── users (Email único por hotel)
├── room_categories
│   └── rooms (Status: AVAILABLE, OCCUPIED, MAINTENANCE, CLEANING)
├── guests (CPF único por hotel)
├── reservations
│   ├── payments (1:N)
│   └── reservation_rooms (N:N pivô com rooms)
```

### Criar Schema

```bash
# Já feito no passo 5 de instalação, mas se precisar novamente:
docker exec hotel_postgres psql -U hotel_user -d gestao_hotel < db/schema.sql
```

### Popular com Dados de Teste

```bash
docker exec hotel_postgres psql -U hotel_user -d gestao_hotel < seed/seed_hotels.sql
```

Insere:
- 2 hotéis de exemplo
- Quartos de exemplo
- Usuário admin de teste
- Hóspede de teste

### Acessar BD Diretamente

```bash
docker exec -it hotel_postgres psql -U hotel_user -d gestao_hotel
```

Comandos úteis:
```sql
\dt                    # listar tabelas
\d hotels              # descrever tabela
SELECT COUNT(*) FROM hotels;
SELECT * FROM users;
```

### Backup

```bash
# Dump de dados
docker exec hotel_postgres pg_dump -U hotel_user -d gestao_hotel > backup.sql

# Restaurar
docker exec -i hotel_postgres psql -U hotel_user -d gestao_hotel < backup.sql
```

---

## 📡 API REST

### Documentação Swagger

**URL**: http://localhost/api-docs

Documentação interativa de TODOS os endpoints com:
- Descrição do endpoint
- Parâmetros obrigatórios/opcionais
- Tipos de dados esperados
- Exemplos de resposta
- Status HTTP possíveis

### Base URL

```
http://localhost     (via Nginx)
http://localhost:3000  (direto no Express, apenas dev)
```

### Autenticação

Todos os endpoints (exceto `/auth/register` e `/auth/login`) requerem JWT:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
     http://localhost/api/users
```

### Endpoints Principais

#### 🔑 Autenticação

**POST /auth/register** — Criar novo tenant + usuário
```json
{
  "tenantName": "Hotel Paraíso",
  "name": "João Admin",
  "email": "admin@paraiso.hotel",
  "password": "SenhaSegura123!"
}
```

**POST /auth/login** — Fazer login
```json
{
  "email": "admin@paraiso.hotel",
  "password": "SenhaSegura123!"
}
```

Retorna:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid-aqui",
    "name": "João Admin",
    "email": "admin@paraiso.hotel",
    "role": "ADMIN"
  }
}
```

#### 👥 Usuários (CRUD)

- **GET /users** — Listar todos os usuários do tenant
- **POST /users** — Criar novo usuário
- **GET /users/:id** — Obter usuário por ID
- **PUT /users/:id** — Atualizar usuário
- **DELETE /users/:id** — Deletar usuário (ADMIN only)

#### 🏨 Categorias de Quarto (CRUD)

- **GET /room-categories** — Listar categorias
- **POST /room-categories** — Criar categoria
- **GET /room-categories/:id** — Obter categoria
- **PUT /room-categories/:id** — Atualizar categoria
- **DELETE /room-categories/:id** — Deletar categoria

#### 🛏️ Quartos (CRUD)

- **GET /rooms** — Listar quartos com filtro por status/disponibilidade
- **POST /rooms** — Criar quarto
- **GET /rooms/:id** — Obter quarto
- **PUT /rooms/:id** — Atualizar quarto (ex: status)
- **DELETE /rooms/:id** — Deletar quarto

#### 👤 Hóspedes (CRUD)

- **GET /guests** — Listar hóspedes
- **POST /guests** — Criar hóspede (CPF único)
- **GET /guests/:id** — Obter hóspede
- **PUT /guests/:id** — Atualizar hóspede
- **DELETE /guests/:id** — Deletar hóspede (soft delete)

#### 📋 Reservas (CRUD + Ações)

- **GET /reservations** — Listar reservas
- **POST /reservations** — Criar reserva (suporta múltiplos quartos via extra_room_ids)
- **GET /reservations/:id** — Obter reserva
- **PUT /reservations/:id** — Atualizar reserva
- **DELETE /reservations/:id** — Cancelar reserva

**Ações especiais**:
- **PUT /reservations/:id/check-in** — Hóspede entra (muda status)
- **PUT /reservations/:id/check-out** — Hóspede sai (libera quarto)
- **POST /reservations/:id/rooms** — Adicionar quarto extra
- **DELETE /reservations/:id/rooms/:roomId** — Remover quarto

#### 💳 Pagamentos (CRUD)

- **GET /payments** — Listar pagamentos
- **POST /payments** — Registrar pagamento
- **GET /payments/:id** — Obter pagamento
- **PUT /payments/:id** — Atualizar pagamento
- **DELETE /payments/:id** — Deletar pagamento

#### 🏥 Health Check

- **GET /health** — Status do servidor

---

## 🔐 Autenticação

### Fluxo JWT

```
1. Cliente faz login (POST /auth/login)
   ├─ Backend verifica credenciais (bcrypt)
   ├─ Gera JWT: sign({userId, tenantId, role}, JWT_SECRET, '8h')
   └─ Retorna token ao cliente

2. Cliente armazena token (localStorage/sessionStorage)

3. Cliente faz requisição autenticada
   ├─ Adiciona header: Authorization: Bearer <token>
   ├─ Backend middleware valida (authMiddleware)
   ├─ Se válido: injeta request.user = {userId, tenantId, role}
   ├─ Se inválido: retorna 401
   └─ Prossegue para controller se OK

4. Controller usa request.user.tenantId para filtrar dados
   └─ Garante isolamento: só vê dados do seu hotel
```

### TTL (Time To Live)

- **Tokens JWT expiram em 8 horas**
- Após expiração: cliente precisa fazer login novamente
- Sem refresh tokens (MVP simples)

### Roles

| Role | Permissões |
|---|---|
| **ADMIN** | CRUD completo + DELETE |
| **RECEPTIONIST** | CRUD (exceto DELETE) |

### Middleware de Autenticação

Automático em TODAS as rotas (exceto `/auth/*`):

```javascript
// Em router.js, aplica:
router.use(authMiddleware); // Valida token

// Em rotas DELETE, aplica:
router.delete('/users/:id', requireRole('ADMIN'), DeleteUserController);
```

---

## 📁 Estrutura do Projeto

```
sistema_hotel_prova/
├── _web.js                    # Arquivo principal (entry point)
├── package.json               # Dependências
├── .env.example               # Template variáveis de ambiente
├── docker-compose.yml         # Orquestração 3 serviços
├── Dockerfile                 # Imagem Node.js final
│
├── app/                       # Código da aplicação
│   ├── Controllers/           # Lógica de requisição
│   │   ├── AuthApi/
│   │   │   ├── LoginController.js
│   │   │   └── RegisterController.js
│   │   ├── UserApi/           # CRUD Usuários
│   │   ├── RoomApi/           # CRUD Quartos
│   │   ├── GuestApi/          # CRUD Hóspedes
│   │   ├── RoomCategoryApi/   # CRUD Categorias
│   │   ├── ReservationApi/    # CRUD Reservas + Check-in/out
│   │   └── PaymentApi/        # CRUD Pagamentos
│   │
│   └── Models/                # ORM Sequelize
│       ├── TenantModel.js     # Hotel (Tenant SaaS)
│       ├── UserModel.js       # Funcionários
│       ├── RoomModel.js       # Quartos físicos
│       ├── RoomCategoryModel.js
│       ├── GuestModel.js      # Hóspedes
│       ├── ReservationModel.js
│       ├── ReservationRoomModel.js  # Tabela pivô N:N
│       └── PaymentModel.js
│
├── bootstrap/                 # Inicialização
│   ├── app.js                 # Setup dotenv + relations
│   └── config.js              # Constantes
│
├── database/
│   ├── connections/
│   │   └── sequelize.js       # Conexão PostgreSQL
│   └── relations.js           # Definição de relacionamentos
│
├── routes/                    # Routers Express
│   ├── router.js              # Router principal
│   └── apis/                  # Routers por domínio
│       ├── authRouter.js
│       ├── userRouter.js
│       ├── roomRouter.js
│       ├── guestRouter.js
│       ├── roomCategoryRouter.js
│       ├── reservationRouter.js
│       └── paymentRouter.js
│
├── middlewares/               # Express Middlewares
│   ├── auth.middleware.js     # Valida JWT
│   ├── role.middleware.js     # Valida roles ADMIN/RECEPTIONIST
│   └── tenant.middleware.js   # Isolamento multi-tenant
│
├── config/
│   └── swagger.js             # Configuração OpenAPI 3.0
│
├── db/
│   └── schema.sql             # DDL (criar tabelas)
│
├── seed/
│   └── seed_hotels.sql        # DML (dados teste)
│
├── docker/
│   └── nginx/
│       ├── Dockerfile         # Build Nginx
│       └── default.conf       # Config Nginx (proxy reverso)
│
├── docs/                      # Documentação
│   ├── CODING_STANDARDS.md    # Padrões de código
│   ├── FEATURE_COVERAGE_ANALYSIS.md
│   ├── PRODUCT_ROADMAP.md
│   └── back/
│       └── MIDDLEWARES.md
│
├── README.md                  # Este arquivo (novo)
└── README_NOVO.md             # Documento anterior (manter por compatibilidade)
```

---

## 💡 Boas Práticas

### Controllers

✅ **DO:**
```javascript
// Extrair dados do request
const { email, password } = request.body;

// Validar entrada
if (!email || !password) {
  return response.status(400).json({ error: 'Campos obrigatórios' });
}

// Usar try-catch
try {
  const user = await UserModel.findOne({ where: { email } });
  // ...
} catch (error) {
  console.error(error);
  return response.status(500).json({ error: 'Erro interno' });
}
```

❌ **DON'T:**
```javascript
// Não validar
const { email, password } = request.body;
const user = await UserModel.findOne({ where: { email } }); // Pode falhar se email undefined

// Não usar try-catch
const user = await UserModel.findOne({ where: { email } }); // Unhandled promise rejection

// Não retornar early
if (!email) console.error('email falta');
// ... continua mesmo com erro
```

### Multi-Tenant

✅ **DO:**
```javascript
// Sempre filtrar por tenantId do JWT
const reservations = await ReservationModel.findAll({
  where: { tenant_id: request.user.tenantId }
});
```

❌ **DON'T:**
```javascript
// Buscar de todos os tenants
const reservations = await ReservationModel.findAll();
```

### Autenticação

✅ **DO:**
```javascript
// Proteger rotas com middleware
router.delete('/users/:id', authMiddleware, requireRole('ADMIN'), DeleteUserController);
```

❌ **DON'T:**
```javascript
// Sem middleware
router.delete('/users/:id', DeleteUserController);
```

### Senhas

✅ **DO:**
```javascript
// Hash com bcryptjs (10 rounds)
const hash = await bcrypt.hash(password, 10);
await UserModel.create({ password_hash: hash });
```

❌ **DON'T:**
```javascript
// Salvar senha em texto plano
await UserModel.create({ password_hash: password });
```

---

## 🔧 Troubleshooting

### Erro: "relation tenants does not exist"

**Causa**: Schema.sql define tabela "hotels" mas Model referencia "tenants"

**Solução**:
```bash
# Opção 1: Editar Model
# app/Models/TenantModel.js linha 18:
tableName: 'hotels',  # ao invés de 'tenants'

# Opção 2: Editar Schema
# db/schema.sql linha 7:
CREATE TABLE IF NOT EXISTS tenants (  # ao invés de 'hotels'

# Depois:
docker exec hotel_postgres psql -U hotel_user -d gestao_hotel < db/schema.sql
```

### Erro: "password authentication failed for user hotel_user"

**Causa**: Variável POSTGRES_PASSWORD no .env não combina com docker-compose

**Solução**:
```bash
# Verificar .env
grep POSTGRES_PASSWORD .env

# Verificar docker-compose.yml
grep POSTGRES_PASSWORD docker-compose.yml

# Garantir que combinam ou deixar defaults:
# .env: POSTGRES_PASSWORD=hotel_password
# docker-compose.yml: POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-hotel_password}
```

### Erro: "Port 80 is already in use"

**Causa**: Outro processo usando porta 80 (ex: IIS, Apache)

**Solução**:
```bash
# Linux/Mac: ver e matar processo
lsof -i :80
kill -9 <PID>

# Windows (PowerShell):
netstat -ano | findstr :80
taskkill /PID <PID> /F

# Ou mudar porta em docker-compose.yml:
ports:
  - "8080:80"  # mudar para 8080

# E acessar em http://localhost:8080
```

### Erro: "Cannot find module express"

**Causa**: Dependências não instaladas

**Solução**:
```bash
npm install
# Ou em produção:
npm ci --omit=dev
```

### Swagger não carrega

**Causa**: Config/swagger.js incompleta ou erro de sintaxe

**Solução**:
```bash
# Ver erro no console
docker compose logs node_web | grep swagger

# Revisar config/swagger.js por erros
```

---

## 🤝 Contribuindo

### Padrão de Código

Siga [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md)

### Criar Nova Feature

1. **Criar Controller** em app/Controllers/{DomainApi}/
2. **Criar Model** em app/Models/ (se necessário)
3. **Criar Router** em routes/apis/ ou adicionar rota existente
4. **Documentar** em config/swagger.js
5. **Testar** em http://localhost/api-docs

### Versionamento

- Versão semântica: MAJOR.MINOR.PATCH
- Atual: **1.0.0** (Demo)
- Próxima: **1.1.0** (Testes + Logging)
- Futura: **2.0.0** (Frontend + Módulos adicionais)

---

## 🗺️ Roadmap

### ✅ Fase 1: Demo (Atual)

- [x] Backend API funcional
- [x] Autenticação JWT
- [x] Multi-tenant isolado
- [x] CRUD completo (6 recursos)
- [x] Docker Compose
- [x] Swagger/OpenAPI

### 🟡 Fase 2: TCC (2-3 meses)

- [ ] Testes automatizados (Jest + Supertest)
- [ ] Logging estruturado (Winston)
- [ ] Módulo Financeiro avançado (consumos, bill)
- [ ] Módulo Relatórios (ocupação, receita)
- [ ] Módulo RatePlan (tarifas dinâmicas)
- [ ] Frontend mínimo (Next.js)
- [ ] CI/CD (GitHub Actions)

### 🔴 Fase 3: Produção (6-12 meses)

- [ ] HTTPS/TLS
- [ ] Rate limiting
- [ ] Audit trail
- [ ] Channel Manager (Booking/Airbnb)
- [ ] Billing SaaS (Stripe)
- [ ] Notificações (Email/WhatsApp)
- [ ] Observabilidade (Sentry, DataDog)
- [ ] Compliance (LGPD, NFS-e)
- [ ] Frontend completo
- [ ] Suporte 24/7

---

## 📄 Licença

Projeto acadêmico para fins educacionais.

---

## 👥 Autores

- **Equipe de Desenvolvimento**: Sistemas de Informação / Engenharia de Software
- **Instituição**: [Sua Universidade]
- **Orientador(a)**: [Nome]
- **Data**: Junho 2026

---

## 📞 Suporte

Para dúvidas ou problemas:

1. Verificar [Troubleshooting](#troubleshooting)
2. Ler documentação Swagger em `/api-docs`
3. Consultar [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md)
4. Abrir Issue no repositório

---

**Última atualização**: Junho 3, 2026  
**Status**: 🟡 Parcialmente Pronto para Demo Acadêmica

