# 🏨 Sistema de Gestão de Hotel — Backend API

> Sistema acadêmico de gestão hoteleira com foco em arquitetura backend, banco de dados relacional e infraestrutura moderna.

**Versão**: 0.1.0 (Demo/Scaffold)  
**Status**: 🟡 Parcialmente pronto — Banco + Infraestrutura OK, Endpoints em desenvolvimento  
**Data**: Junho 2026

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Stack Tecnológica](#stack-tecnológica)
3. [Pré-requisitos](#pré-requisitos)
4. [Instalação](#instalação)
5. [Configuração do Ambiente](#configuração-do-ambiente)
6. [Execução Local](#execução-local)
7. [Banco de Dados](#banco-de-dados)
8. [Docker](#docker)
9. [API & Endpoints](#api--endpoints)
10. [Arquitetura](#arquitetura)
11. [Fluxo de Autenticação](#fluxo-de-autenticação)
12. [Roadmap](#roadmap)
13. [Contribuição](#contribuição)
14. [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

Sistema backend de gestão hoteleira desenvolvido como projeto acadêmico (TCC) para demonstrar:

- ✅ APIs REST em Node.js + Express + TypeScript
- ✅ Modelagem relacional com PostgreSQL
- ✅ ORM Sequelize com migrations versionadas
- ✅ Autenticação JWT + bcrypt
- ✅ Docker Compose para desenvolvimento
- ✅ Escalabilidade com Docker Swarm (futuro)
- ✅ Padrões SOLID, DRY, KISS

### Público-Alvo

- Hotéis e pousadas pequenas/médias (5-80 quartos)
- Estudantes de Sistemas de Informação, Engenharia de Software e Desenvolvimento Web
- Demonstração para avaliação acadêmica

### Fluxo Principal

```
Hóspede chega
    ↓
Receptionist cria/busca reserva (GET /reservations)
    ↓
Valida disponibilidade de quarto
    ↓
Realiza check-in (PATCH /reservations/:id/check-in)
    ↓
Altera status do quarto para OCCUPIED
    ↓
Hóspede sai
    ↓
Realiza check-out (PATCH /reservations/:id/check-out)
    ↓
Altera status do quarto para AVAILABLE
```

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| **Runtime** | Node.js | 20.x LTS+ |
| **Linguagem** | TypeScript | 5.8.3 |
| **Framework Web** | Express | 5.2.1 |
| **ORM** | Sequelize | 6.37.8 |
| **Banco de Dados** | PostgreSQL | 17 |
| **Autenticação** | JWT | jsonwebtoken 9.0.3 |
| **Hashing** | bcrypt | 6.0.0 |
| **CORS** | cors | 2.8.6 |
| **Variáveis de Ambiente** | dotenv | 17.4.2 |
| **CLI Migrations** | sequelize-cli | 6.6.5 |
| **Dev Server** | ts-node-dev | 2.0.0 |
| **Build** | TypeScript Compiler (tsc) | 5.8.3 |

---

## ✅ Pré-requisitos

Instale antes de começar:

- **Node.js** (20.x LTS ou superior)
  - Verificar: `node --version`
  - Download: https://nodejs.org/

- **npm** (vem com Node.js)
  - Verificar: `npm --version`
  - Versão mínima: 10.x

- **PostgreSQL** (17 ou superior) — Opção A (local)
  - Download: https://www.postgresql.org/download/
  - Ou use **Docker** (Opção B - recomendado)

- **Git** (para clonar o repositório)
  - Download: https://git-scm.com/

---

## 📥 Instalação

### Passo 1: Clonar o Repositório

```bash
git clone https://github.com/sirlande/sistema_hotel_prova.git
cd sistema_hotel_prova
```

### Passo 2: Instalar Dependências

```bash
cd backend
npm install
```

Saída esperada:
```
added 456 packages, and audited 457 packages in 45s
```

### Passo 3: Verificar Instalação

```bash
npm --version
node --version
```

---

## ⚙️ Configuração do Ambiente

### Passo 1: Copiar Arquivo de Exemplo

```bash
# Na pasta backend/
cp .env.example .env
```

### Passo 2: Editar `.env`

Abra `backend/.env` e configure:

```env
# ========== DATABASE ==========
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=hotel_db
DB_USER=hotel_user
DB_PASSWORD=hotel_pass

# ========== SERVER ==========
PORT=3000
NODE_ENV=development

# ========== JWT ==========
JWT_SECRET=seu-secret-super-seguro-aqui-min-32-caracteres
JWT_EXPIRY=24h

# ========== LOGGING ==========
LOG_LEVEL=debug
```

**⚠️ IMPORTANTE — Segurança:**
- Altere `JWT_SECRET` para uma string forte (mínimo 32 caracteres)
- Nunca commite `.env` no Git (já está em `.gitignore`)
- Use valores diferentes entre dev/staging/produção

### Variáveis de Ambiente Explicadas

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `DB_HOST` | Host do PostgreSQL | `127.0.0.1` |
| `DB_PORT` | Porta do PostgreSQL | `5432` |
| `DB_NAME` | Nome do banco de dados | `hotel_db` |
| `DB_USER` | Usuário do PostgreSQL | `hotel_user` |
| `DB_PASSWORD` | Senha do PostgreSQL | `hotel_pass` |
| `PORT` | Porta do servidor backend | `3000` |
| `NODE_ENV` | Ambiente (dev/staging/prod) | `development` |
| `JWT_SECRET` | Chave secreta para assinar JWTs | (obrigatório) |
| `JWT_EXPIRY` | Tempo de expiração do JWT | `24h` |
| `LOG_LEVEL` | Nível de logs (debug/info/warn/error) | `debug` |

---

## 🚀 Execução Local

### Opção A: Com Docker Compose (Recomendado)

Ideal para desenvolvimento local sem instalar PostgreSQL.

#### 1. Inicie o PostgreSQL

```bash
# Na pasta raiz do projeto
docker-compose up -d
```

Saída esperada:
```
[+] Running 2/2
 ✔ Network sistema_hotel_prova_default  Created
 ✔ Container hotel_postgres             Started
```

#### 2. Verifique a Conexão

```bash
# Espere 5 segundos para o PostgreSQL estar pronto
sleep 5

# Teste a conexão (opcional)
docker exec -it hotel_postgres psql -U hotel_user -d hotel_db -c "SELECT NOW();"
```

#### 3. Execute as Migrations

```bash
cd backend
npm run migrate
```

Saída esperada:
```
== 20260521-create-schema: migrating...
== 20260521-create-schema: migrated in 2.345s
== 20260522-add-unique-constraint-hotels-name: migrating...
== 20260522-add-unique-constraint-hotels-name: migrated in 0.234s
```

#### 4. Execute os Seeders (dados de demo)

```bash
npm run seed
```

Saída esperada:
```
== 20260521-seed-hotels: seeding...
== 20260521-seed-hotels: seeded in 0.567s
```

#### 5. Inicie o Servidor em Modo Desenvolvimento

```bash
npm run dev
```

Saída esperada:
```
✅ PostgreSQL conectado
🚀 Servidor rodando na porta 3000
```

#### 6. Teste o Servidor

Em outro terminal:
```bash
curl http://localhost:3000

# Resposta esperada:
# {"status":"online","project":"Sistema Hotel API"}
```

✅ **Sucesso!** O backend está rodando.

---

### Opção B: Com PostgreSQL Local

Se preferir instalar PostgreSQL localmente em vez de Docker.

#### 1. Inicie o PostgreSQL

```bash
# macOS (com Homebrew)
brew services start postgresql@15

# Linux (Debian/Ubuntu)
sudo systemctl start postgresql

# Windows
# Use PostgreSQL Application (já vem com PgAdmin) ou cmd:
pg_ctl -D "C:\Program Files\PostgreSQL\15\data" start
```

#### 2. Crie o Banco e o Usuário

```bash
# Conecte ao PostgreSQL
psql -U postgres

# Dentro do psql:
CREATE USER hotel_user WITH PASSWORD 'hotel_pass';
CREATE DATABASE hotel_db OWNER hotel_user;
ALTER USER hotel_user CREATEDB;
\q
```

#### 3. Execute as Migrations

```bash
cd backend
npm run migrate
```

#### 4. Execute os Seeders

```bash
npm run seed
```

#### 5. Inicie o Servidor

```bash
npm run dev
```

---

### Verificação Rápida

```bash
# Terminal 1: Inicie o servidor
cd backend
npm run dev

# Terminal 2: Teste os endpoints
curl -X GET http://localhost:3000
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aurora.example","password":"password"}'
```

---

## 💾 Banco de Dados

### Arquitetura

O banco PostgreSQL contém **7 tabelas** relacionadas:

```
┌──────────────┐
│   hotels     │ ◄── Multi-hotel (escalabilidade)
├──────────────┤
│ id (UUID) PK │
│ name UNIQUE  │
│ legal_id     │
│ created_at   │
│ updated_at   │
└──────┬───────┘
       │ 1:N
       ├──────────────────────┬──────────────────────┬─────────────────┐
       ▼                      ▼                      ▼                 ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│    users     │    │room_categories│   │    rooms     │    │    guests    │
├──────────────┤    ├──────────────┤    ├──────────────┤    ├──────────────┤
│ id (UUID)    │    │ id (UUID)    │    │ id (UUID)    │    │ id (UUID)    │
│ hotel_id FK  │    │ hotel_id FK  │    │ hotel_id FK  │    │ hotel_id FK  │
│ name         │    │ name UNIQUE  │    │ category_id  │    │ full_name    │
│ email UNIQUE │    │ capacity > 0 │    │ number UNIQUE│    │ cpf UNIQUE   │
│ password_hash│    │ price > 0    │    │ floor        │    │ phone        │
│ role (enum) │    │ created_at   │    │ status (enum)│    │ email UNIQUE │
│ created_at   │    │ updated_at   │    │ created_at   │    │ created_at   │
│ updated_at   │    │              │    │ updated_at   │    │ updated_at   │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                    │                    │                    │
       │ 1:N                │ 1:N                └─────┐             │ 1:N
       │                    └────────────────────┐    │              │
       └────────────────────┐                    │    │              │
                            │                    ▼    ▼              │
                            │              ┌──────────────┐         │
                            │              │reservations  │◄────────┘
                            │              ├──────────────┤
                            │              │ id (UUID)    │
                            │              │ hotel_id FK  │
                            │              │ guest_id FK  │
                            │              │ room_id FK   │
                            └─────────────→│ user_id FK   │
                                           │ check_in_date│
                                           │check_out_date│
                                           │ status (enum)│
                                           │ total_amount │
                                           │ created_at   │
                                           │ updated_at   │
                                           └──────┬───────┘
                                                  │ 1:N
                                                  ▼
                                           ┌──────────────┐
                                           │  payments    │
                                           ├──────────────┤
                                           │ id (UUID)    │
                                           │ reservation_id│
                                           │ amount > 0   │
                                           │ method (enum)│
                                           │ paid_at      │
                                           │ created_at   │
                                           │ updated_at   │
                                           └──────────────┘
```

### Tabelas

#### 1. `hotels`
Representa unidades de hotel (suporte a multi-hotel).
- `id`: UUID (PK)
- `name`: TEXT UNIQUE
- `legal_id`: TEXT (CNPJ)
- `created_at`, `updated_at`: TIMESTAMP

#### 2. `users`
Representa funcionários do hotel.
- `id`: UUID (PK)
- `hotel_id`: UUID (FK → hotels)
- `name`: TEXT
- `email`: TEXT UNIQUE (por hotel)
- `password_hash`: TEXT (bcrypt)
- `role`: TEXT CHECK (ADMIN, RECEPTIONIST)
- `created_at`, `updated_at`: TIMESTAMP

#### 3. `room_categories`
Tipos de quartos (Standard, Suite, Deluxe, etc).
- `id`: UUID (PK)
- `hotel_id`: UUID (FK → hotels)
- `name`: TEXT UNIQUE (por hotel)
- `capacity`: INTEGER > 0
- `price_per_night`: DECIMAL(10,2) >= 0
- `created_at`, `updated_at`: TIMESTAMP

#### 4. `rooms`
Quartos físicos do hotel.
- `id`: UUID (PK)
- `hotel_id`: UUID (FK → hotels)
- `category_id`: UUID (FK → room_categories)
- `number`: TEXT UNIQUE (por hotel, ex: "101", "2B")
- `floor`: INTEGER
- `status`: TEXT CHECK (AVAILABLE, OCCUPIED, MAINTENANCE, CLEANING)
- `created_at`, `updated_at`: TIMESTAMP

#### 5. `guests`
Hóspedes.
- `id`: UUID (PK)
- `hotel_id`: UUID (FK → hotels)
- `full_name`: TEXT
- `cpf`: TEXT UNIQUE (por hotel, CPF brasileiro)
- `phone`: TEXT
- `email`: TEXT UNIQUE (por hotel)
- `created_at`, `updated_at`: TIMESTAMP

#### 6. `reservations`
Reservas de quartos.
- `id`: UUID (PK)
- `hotel_id`: UUID (FK → hotels)
- `guest_id`: UUID (FK → guests, RESTRICT on delete)
- `room_id`: UUID (FK → rooms, RESTRICT on delete)
- `user_id`: UUID (FK → users, RESTRICT on delete)
- `check_in_date`: DATEONLY
- `check_out_date`: DATEONLY (> check_in)
- `status`: TEXT CHECK (PENDING, CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED)
- `total_amount`: DECIMAL(12,2) >= 0
- `created_at`, `updated_at`: TIMESTAMP

**Constraints especiais:**
- EXCLUDE USING GIST: Impede reservas sobrepostas no mesmo quarto
- Índices em (hotel_id, check_in_date) e (hotel_id, check_out_date)

#### 7. `payments`
Registros de pagamento.
- `id`: UUID (PK)
- `reservation_id`: UUID (FK → reservations, CASCADE)
- `amount`: DECIMAL(12,2) >= 0
- `method`: TEXT CHECK (CARD, CASH, TRANSFER)
- `paid_at`: TIMESTAMP
- `created_at`, `updated_at`: TIMESTAMP

### Migrations

Migrations versionadas garantem versionamento do schema:

```bash
# Listar migrations
ls -la backend/src/database/migrations/

# 20260521-create-schema.js          ← Schema principal (7 tabelas)
# 20260522-add-unique-constraint... ← Ajustes incrementais
```

### Seeders

Dados iniciais para desenvolvimento:

```bash
npm run seed
```

Cria:
- 1 hotel: "Hotel Aurora"
- 2 categorias: "Standard" (R$120/noite), "Suite" (R$320/noite)
- 1 quarto: #101 (Standard, piso 1)
- 1 usuário admin: admin@aurora.example
- 1 hóspede demo: João Silva (CPF 11122233344)

### Desfazer Tudo

```bash
# Remove todas as migrations
npm run migrate:undo

# Recria do zero
npm run migrate
npm run seed
```

---

## 🐳 Docker

### Docker Compose (Desenvolvimento)

#### Iniciar

```bash
docker-compose up -d
```

Inicia:
- PostgreSQL 17 em `localhost:5432`
- Volume persistente: `postgres_data`

#### Parar

```bash
docker-compose down
```

#### Ver Logs

```bash
docker-compose logs postgres -f
```

#### Acessar o PostgreSQL via Docker

```bash
docker exec -it hotel_postgres psql -U hotel_user -d hotel_db
```

Dentro do psql:
```sql
\dt                          -- Listar tabelas
SELECT COUNT(*) FROM users;  -- Contar usuários
\q                           -- Sair
```

### Docker Compose com Backend (Futuro)

Quando os endpoints estiverem prontos, o arquivo será expandido para incluir o backend:

```yaml
services:
  postgres:
    # ... (conforme atual)

  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      DB_HOST: postgres
      DB_USER: hotel_user
      DB_PASSWORD: hotel_pass
      DB_NAME: hotel_db
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      - postgres
```

---

## 📡 API & Endpoints

⚠️ **Status**: Os endpoints documentados abaixo ainda **não estão implementados**. Esta seção define o contrato esperado.

### Base URL

```
http://localhost:3000
```

### Autenticação

Endpoints protegidos requerem header:
```
Authorization: Bearer <jwt_token>
```

### Padrão de Resposta de Erro

```json
{
  "error": "Descrição do erro",
  "statusCode": 400,
  "timestamp": "2026-06-01T10:30:00Z"
}
```

### Endpoints Planejados

#### 1. Auth

```http
POST /auth/register
Content-Type: application/json

{
  "name": "João da Silva",
  "email": "joao@hotel.com",
  "password": "senha_forte_123"
}

Response 201:
{
  "id": "uuid",
  "name": "João da Silva",
  "email": "joao@hotel.com",
  "token": "eyJhbGc..."
}
```

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@aurora.example",
  "password": "password"
}

Response 200:
{
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "name": "Admin Local",
    "email": "admin@aurora.example",
    "role": "ADMIN"
  }
}
```

#### 2. Room Categories

```http
GET /room-categories
Authorization: Bearer <token>

Response 200:
[
  {
    "id": "uuid",
    "name": "Standard",
    "capacity": 2,
    "pricePerNight": 120.00
  }
]
```

```http
POST /room-categories
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Suite Premium",
  "capacity": 4,
  "pricePerNight": 450.00
}

Response 201:
{
  "id": "uuid",
  "name": "Suite Premium",
  "capacity": 4,
  "pricePerNight": 450.00
}
```

#### 3. Rooms

```http
GET /rooms
Authorization: Bearer <token>

Response 200:
[
  {
    "id": "uuid",
    "number": "101",
    "floor": 1,
    "status": "AVAILABLE",
    "category": {
      "id": "uuid",
      "name": "Standard"
    }
  }
]
```

```http
GET /rooms/available?checkIn=2026-06-15&checkOut=2026-06-20
Authorization: Bearer <token>

Response 200:
[
  {
    "id": "uuid",
    "number": "101",
    "category": "Standard",
    "pricePerNight": 120.00
  }
]
```

#### 4. Guests

```http
POST /guests
Authorization: Bearer <token>
Content-Type: application/json

{
  "fullName": "Maria Silva",
  "cpf": "12345678901",
  "phone": "+55-11-99999-9999",
  "email": "maria@example.com"
}

Response 201:
{
  "id": "uuid",
  "fullName": "Maria Silva",
  "cpf": "12345678901"
}
```

#### 5. Reservations

```http
POST /reservations
Authorization: Bearer <token>
Content-Type: application/json

{
  "guestId": "uuid",
  "roomId": "uuid",
  "checkInDate": "2026-06-15",
  "checkOutDate": "2026-06-20"
}

Response 201:
{
  "id": "uuid",
  "guestId": "uuid",
  "roomId": "uuid",
  "status": "PENDING",
  "totalAmount": 600.00
}
```

```http
PATCH /reservations/:id/check-in
Authorization: Bearer <token>

Response 200:
{
  "id": "uuid",
  "status": "CHECKED_IN",
  "room": {
    "status": "OCCUPIED"
  }
}
```

---

## 🏗️ Arquitetura

### Estrutura de Pastas (Planejada)

```
backend/
├── src/
│   ├── app.ts                    ← Configuração Express
│   ├── server.ts                 ← Inicialização
│   ├── config/
│   │   └── database.ts           ← Conexão Sequelize
│   ├── models/                   ← ORM Models
│   │   ├── User.ts
│   │   ├── Room.ts
│   │   ├── Reservation.ts
│   │   └── ...
│   ├── controllers/              ← Lógica de requisições (❌ TODO)
│   │   ├── AuthController.ts
│   │   ├── RoomController.ts
│   │   └── ...
│   ├── services/                 ← Lógica de negócio (❌ TODO)
│   │   ├── AuthService.ts
│   │   ├── ReservationService.ts
│   │   └── ...
│   ├── middlewares/              ← Middlewares Express (❌ TODO)
│   │   ├── authMiddleware.ts
│   │   └── errorHandler.ts
│   ├── routes/                   ← Definição de rotas (❌ TODO)
│   │   ├── auth.routes.ts
│   │   ├── rooms.routes.ts
│   │   └── ...
│   ├── database/
│   │   ├── migrations/           ← Versionamento de schema
│   │   ├── seeders/              ← Dados iniciais
│   │   └── config.js             ← Config Sequelize CLI
│   └── utils/                    ← Utilitários (❌ TODO)
│       ├── validators.ts
│       └── errorHandler.ts
├── dist/                         ← Build compilado (npm run build)
├── .env.example                  ← Template de variáveis
├── .sequelizerc                  ← Config CLI
├── package.json
├── tsconfig.json
└── README.md
```

### Padrões Arquiteturais

O projeto segue:
- **MVC Simplificado**: Models (ORM) → Controllers (requisições) → Views (JSON)
- **Service Layer**: Lógica de negócio centralizada
- **Middlewares**: Autenticação, validação, tratamento de erros
- **Separação de Responsabilidades**: SOLID principles

### Fluxo de uma Requisição

```
HTTP Request
    ↓
Routes (validação de URL)
    ↓
Middlewares (autenticação, validação)
    ↓
Controllers (recebe dados, delega negócio)
    ↓
Services (executa regras de negócio, consulta BD)
    ↓
Models/ORM (Sequelize interage com PostgreSQL)
    ↓
Response (JSON com resultado ou erro)
```

---

## 🔐 Fluxo de Autenticação

⚠️ **Status**: Ainda não implementado. Este é o fluxo esperado.

### Login com JWT

```
1. Cliente POST /auth/login com email + senha
2. Backend busca user no PostgreSQL
3. Compara senha com bcrypt (hash armazenado)
4. Se OK, gera JWT assinado com JWT_SECRET
5. Retorna token ao cliente
6. Cliente armazena token (localStorage/sessionStorage)
```

### Uso do Token

```
1. Cliente envia requisição com:
   Authorization: Bearer <token>

2. Middleware de auth:
   - Extrai token do header
   - Valida assinatura com JWT_SECRET
   - Verifica expiração
   - Se OK, adiciona user ao req.user

3. Controller acessa req.user
```

### Proteção de Rotas

```typescript
// Exemplo de rota protegida:
app.get('/rooms', 
  authMiddleware,  // ← Valida JWT
  roomController.listRooms  // ← Executa lógica
);
```

---

## 📋 Roadmap

### ✅ Concluído (Fase 1)

- [x] Setup Express + TypeScript
- [x] Configuração Sequelize + PostgreSQL
- [x] Migrations (schema + dados)
- [x] Seeders (dados de demo)
- [x] Docker Compose com PostgreSQL

### 🟡 Em Progresso (Fase 2)

- [ ] Implementar controllers
- [ ] Implementar services
- [ ] Implementar rotas
- [ ] Implementar middlewares de auth
- [ ] Validações de entrada (schemas)
- [ ] Testes unitários

### 🔴 Planejado (Fase 3)

- [ ] Swagger/OpenAPI
- [ ] Docker Compose com backend
- [ ] Docker Swarm (demo)
- [ ] Kubernetes (demo)
- [ ] Frontend (React/Next.js)
- [ ] CI/CD (GitHub Actions)
- [ ] Testes e2e

### 📊 Checklist por Módulo

#### Auth
- [ ] POST /auth/register
- [ ] POST /auth/login
- [ ] JWT middleware
- [ ] Validação de senha
- [ ] Refresh token

#### Rooms
- [ ] GET /rooms
- [ ] GET /rooms/available
- [ ] POST /rooms
- [ ] PATCH /rooms/:id
- [ ] DELETE /rooms/:id

#### Guests
- [ ] GET /guests
- [ ] POST /guests
- [ ] PUT /guests/:id
- [ ] DELETE /guests/:id

#### Reservations
- [ ] POST /reservations (com validação de conflito)
- [ ] GET /reservations
- [ ] PATCH /reservations/:id/check-in
- [ ] PATCH /reservations/:id/check-out
- [ ] PATCH /reservations/:id/cancel

---

## 🤝 Contribuição

### Setup para Contribuidores

```bash
# 1. Fork e clone
git clone https://github.com/SEU_USUARIO/sistema_hotel_prova.git
cd sistema_hotel_prova/backend

# 2. Crie uma branch
git checkout -b feat/novo-endpoint

# 3. Instale deps
npm install

# 4. Desenvolvimento
npm run dev

# 5. Faça commit seguindo convenção
git commit -m "feat: adiciona endpoint GET /rooms"

# 6. Push
git push origin feat/novo-endpoint

# 7. Crie Pull Request
```

### Convenções de Código

Consulte [CODING_STANDARDS.md](../docs/CODING_STANDARDS.md) para:
- Princípios SOLID
- Padrão DRY
- KISS
- Commits semânticos

### Testes

```bash
# Executar testes (quando implementados)
npm run test

# Com coverage
npm run test:coverage
```

---

## 🆘 Troubleshooting

### Problema: "ECONNREFUSED 127.0.0.1:5432"

**Causa**: PostgreSQL não está rodando.

**Solução**:
```bash
# Com Docker Compose:
docker-compose up -d

# Com PostgreSQL local:
pg_ctl -D /usr/local/var/postgres start
```

### Problema: "password authentication failed"

**Causa**: Credenciais incorretas no `.env`.

**Solução**:
```bash
# Verifique .env:
cat .env | grep DB_

# Se usando Docker:
docker-compose down
docker volume rm sistema_hotel_prova_postgres_data
docker-compose up -d
npm run migrate
npm run seed
```

### Problema: "relation 'hotels' does not exist"

**Causa**: Migrations não foram executadas.

**Solução**:
```bash
cd backend
npm run migrate
npm run seed
```

### Problema: "Cannot find module 'cors'"

**Causa**: Dependências não instaladas.

**Solução**:
```bash
npm install
```

### Problema: "TypeError: Cannot read property 'authenticate' of undefined"

**Causa**: Database não foi importado corretamente.

**Solução**:
```bash
# Verifique .env está correto
npm run dev
```

---

## 📚 Documentação Adicional

- [CODING_STANDARDS.md](../docs/CODING_STANDARDS.md) — Padrões de código
- [FEATURE_COVERAGE_ANALYSIS.md](../docs/FEATURE_COVERAGE_ANALYSIS.md) — Análise de funcionalidades
- [PRODUCT_ROADMAP.md](../docs/PRODUCT_ROADMAP.md) — Visão de futuro
- [ARQ_BACKEND.md](../docs/back/ARQ_BACKEND.md) — Detalhes de arquitetura
- [ARQ_DATABASE.md](../docs/db/ARQ_DATABASE.md) — Detalhes de BD

---

## 📞 Suporte

- 📧 Email: sirlande@example.com
- 🐛 Issues: https://github.com/sirlande/sistema_hotel_prova/issues
- 💬 Discussões: https://github.com/sirlande/sistema_hotel_prova/discussions

---

## 📄 Licença

ISC — Veja [LICENSE](LICENSE) para detalhes.

---

**Última atualização**: 01 Junho 2026  
**Versão**: 0.1.0 (Demo/Scaffold)
