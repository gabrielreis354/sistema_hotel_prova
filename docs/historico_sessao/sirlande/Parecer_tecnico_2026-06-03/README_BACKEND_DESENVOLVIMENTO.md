# 🏗️ README — Backend Development

**Guia Técnico para Desenvolvimento Backend**  
Sistema de Gestão de Hotel — Node.js + Express + Sequelize

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Setup Local](#setup-local)
3. [Estrutura de Código](#estrutura-de-código)
4. [Criando um Novo Endpoint](#criando-um-novo-endpoint)
5. [Padrões de Desenvolvimento](#padrões-de-desenvolvimento)
6. [Banco de Dados](#banco-de-dados)
7. [Segurança](#segurança)
8. [Troubleshooting Dev](#troubleshooting-dev)
9. [Checklist de Qualidade](#checklist-de-qualidade)

---

## 🎯 Visão Geral

Este backend segue arquitetura **MVC (Model-View-Controller)** com **isolamento multi-tenant**:

```
REQUEST
  ↓
Route Handler (routes/apis/*.js)
  ↓
Controller (app/Controllers/*/*.js) — Lógica da requisição
  ↓
Model (app/Models/*.js) — ORM Sequelize
  ↓
PostgreSQL (Dados)
  ↓
JSON Response
```

### Características

| Recurso | Implementação |
|---|---|
| Linguagem | JavaScript (ES Modules) |
| Runtime | Node.js 20+ |
| Framework | Express 4.19.2 |
| ORM | Sequelize 6.37.3 |
| Banco | PostgreSQL 17 |
| Auth | JWT 8h + bcryptjs |
| Multi-tenant | Isolamento por hotel_id |

---

## 🔧 Setup Local

### 1. Clonar e Instalar

```bash
git clone https://github.com/seu-usuario/sistema_hotel_prova.git
cd sistema_hotel_prova

npm install
```

### 2. Configurar .env

```bash
cp .env.example .env
```

Editar `.env`:
```ini
NODE_ENV=development
NODE_WEB_PORT=3000
POSTGRES_HOST=postgres        # (ou localhost se BD local)
POSTGRES_PORT=5432
POSTGRES_DB=gestao_hotel
POSTGRES_USER=hotel_user
POSTGRES_PASSWORD=hotel_password
JWT_SECRET=sua_chave_aqui
```

### 3. Subir Banco de Dados

#### Opção A: Docker Compose (Recomendado)

```bash
docker compose up -d postgres
```

Aguardar ~10s para iniciar, depois executar schema:

```bash
docker exec hotel_postgres psql -U hotel_user -d gestao_hotel < db/schema.sql
docker exec hotel_postgres psql -U hotel_user -d gestao_hotel < seed/seed_hotels.sql
```

#### Opção B: PostgreSQL Local

```bash
# Criar banco
createdb -U postgres gestao_hotel

# Executar schema
psql -U postgres -d gestao_hotel < db/schema.sql
psql -U postgres -d gestao_hotel < seed/seed_hotels.sql

# Editar .env
POSTGRES_HOST=localhost
POSTGRES_USER=postgres
POSTGRES_PASSWORD=sua_senha
```

### 4. Iniciar Servidor

```bash
npm run dev
```

Saída esperada:
```
==================================================
🚀 Servidor Hotel PMS rodando com sucesso!
📡 URL Local: http://localhost:3000
💾 Banco de Dados PostgreSQL conectado via Sequelize
==================================================
```

### 5. Testar

```bash
# Health check
curl http://localhost:3000/health

# Swagger
curl http://localhost:3000/api-docs
```

---

## 📁 Estrutura de Código

### app/Controllers/

Cada controller é uma **função assíncrona** que recebe (request, response):

```
Controllers/
├── AuthApi/
│   ├── LoginController.js        — POST /auth/login
│   └── RegisterController.js     — POST /auth/register
├── UserApi/
│   ├── CreateUserController.js   — POST /users
│   ├── ListUserController.js     — GET /users
│   ├── GetUserController.js      — GET /users/:id
│   ├── UpdateUserController.js   — PUT /users/:id
│   └── DeleteUserController.js   — DELETE /users/:id
├── RoomApi/
│   └── ... (5 controllers CRUD)
├── GuestApi/
│   └── ... (5 controllers CRUD)
├── RoomCategoryApi/
│   └── ... (5 controllers CRUD)
├── ReservationApi/
│   ├── CreateReservationController.js
│   ├── CheckInController.js      — PUT /reservations/:id/check-in
│   ├── CheckOutController.js     — PUT /reservations/:id/check-out
│   ├── AddRoomToReservationController.js
│   ├── RemoveRoomFromReservationController.js
│   └── ... (5 controllers CRUD)
└── PaymentApi/
    └── ... (5 controllers CRUD)
```

**Estrutura de um Controller**:

```javascript
// app/Controllers/UserApi/CreateUserController.js
import UserModel from '../../Models/UserModel.js';
import bcrypt from 'bcryptjs';

export default async function CreateUserController(request, response) {
    try {
        // 1. Extrair dados
        const { name, email, password, role } = request.body;
        const tenantId = request.user.tenantId; // Do JWT

        // 2. Validar
        const errors = [];
        if (!name) errors.push('name obrigatório');
        if (!email) errors.push('email obrigatório');
        if (!password) errors.push('password obrigatório');
        if (errors.length) {
            return response.status(400).json({ errors });
        }

        // 3. Verificar duplicata
        const existing = await UserModel.findOne({
            where: { tenant_id: tenantId, email }
        });
        if (existing) {
            return response.status(409).json({ error: 'Email já cadastrado' });
        }

        // 4. Processar
        const password_hash = await bcrypt.hash(password, 10);
        const user = await UserModel.create({
            tenant_id: tenantId,
            name,
            email,
            password_hash,
            role: role || 'RECEPTIONIST'
        });

        // 5. Retornar
        return response.status(201).json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            created_at: user.created_at
        });

    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
```

### app/Models/

Cada model mapeia uma tabela PostgreSQL usando Sequelize:

```javascript
// app/Models/UserModel.js
import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const UserModel = sequelize.define(
    'UserModel',
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'tenants', key: 'id' }
        },
        name: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        email: {
            type: DataTypes.TEXT,
            allowNull: false,
            unique: 'unique_email_per_tenant' // ← Unique por tenant
        },
        password_hash: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        role: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: 'RECEPTIONIST'
        }
    },
    {
        tableName: 'users',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        paranoid: true,              // ← Soft delete (created_at, updated_at, deleted_at)
        deletedAt: 'deleted_at'
    }
);

export default UserModel;
```

### routes/apis/

Cada router conecta endpoints a controllers:

```javascript
// routes/apis/userRouter.js
import { Router } from 'express';
import CreateUserController from '../../app/Controllers/UserApi/CreateUserController.js';
import ListUserController from '../../app/Controllers/UserApi/ListUserController.js';
import GetUserController from '../../app/Controllers/UserApi/GetUserController.js';
import UpdateUserController from '../../app/Controllers/UserApi/UpdateUserController.js';
import DeleteUserController from '../../app/Controllers/UserApi/DeleteUserController.js';
import { requireRole } from '../../middlewares/role.middleware.js';

const router = Router();

router.post('/', CreateUserController);
router.get('/', ListUserController);
router.get('/:id', GetUserController);
router.put('/:id', UpdateUserController);
router.delete('/:id', requireRole('ADMIN'), DeleteUserController);

export default router;
```

Importado em `routes/router.js`:

```javascript
router.use('/users', authMiddleware, userRouter);
```

### middlewares/

**authMiddleware** — Valida JWT (automático em todas rotas)

```javascript
// middlewares/auth.middleware.js
import jwt from 'jsonwebtoken';

export default function authMiddleware(request, response, next) {
    const authHeader = request.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return response.status(401).json({ error: 'Token não fornecido' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        request.user = payload; // { userId, role, tenantId }
        next();
    } catch {
        return response.status(401).json({ error: 'Token inválido ou expirado' });
    }
}
```

**roleMiddleware** — Valida roles (usado em DELETE)

```javascript
// middlewares/role.middleware.js
export function requireRole(...allowedRoles) {
    return (request, response, next) => {
        if (!allowedRoles.includes(request.user?.role)) {
            return response.status(403).json({ error: 'Acesso não autorizado' });
        }
        next();
    };
}

// Uso:
router.delete('/:id', requireRole('ADMIN'), DeleteUserController);
```

**tenantMiddleware** — Valida tenant (usado em operações críticas)

```javascript
// middlewares/tenant.middleware.js
import TenantModel from '../app/Models/TenantModel.js';

export default async function tenantMiddleware(request, response, next) {
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
        return response.status(401).json({ error: 'Tenant não identificado' });
    }

    try {
        const tenant = await TenantModel.findByPk(tenantId);

        if (!tenant || tenant.status !== 'ACTIVE') {
            return response.status(403).json({ error: 'Tenant não encontrado ou suspenso' });
        }

        request.tenantId = tenantId;
        next();
    } catch {
        return response.status(500).json({ error: 'Erro interno' });
    }
}
```

### database/relations.js

Define relacionamentos Sequelize (1:N, N:N, etc):

```javascript
// database/relations.js
export default function initRelations() {
    // 1:N — Tenant → Users
    TenantModel.hasMany(UserModel, { foreignKey: "tenant_id", as: "users" });
    UserModel.belongsTo(TenantModel, { foreignKey: "tenant_id", as: "tenant" });

    // 1:N — RoomCategory → Rooms
    RoomCategoryModel.hasMany(RoomModel, { foreignKey: "category_id", as: "rooms" });
    RoomModel.belongsTo(RoomCategoryModel, { foreignKey: "category_id", as: "category" });

    // N:N — Reservation ↔ Rooms (via pivô)
    ReservationModel.belongsToMany(RoomModel, {
        through: ReservationRoomModel,
        foreignKey: 'reservation_id',
        otherKey: 'room_id',
        as: 'rooms'
    });
    RoomModel.belongsToMany(ReservationModel, {
        through: ReservationRoomModel,
        foreignKey: 'room_id',
        otherKey: 'reservation_id',
        as: 'reservations_pivot'
    });
}
```

---

## 🆕 Criando um Novo Endpoint

### Exemplo: GET /users/:id/reservations (listar reservas de um usuário)

#### Passo 1: Criar Controller

```javascript
// app/Controllers/UserApi/GetUserReservationsController.js
import ReservationModel from '../../Models/ReservationModel.js';
import UserModel from '../../Models/UserModel.js';

export default async function GetUserReservationsController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;

        // Verificar que user pertence ao tenant
        const user = await UserModel.findOne({
            where: { id, tenant_id: tenantId }
        });
        if (!user) {
            return response.status(404).json({ error: 'Usuário não encontrado' });
        }

        // Buscar reservas criadas pelo usuário
        const reservations = await ReservationModel.findAll({
            where: { user_id: id, tenant_id: tenantId }
        });

        return response.json(reservations);

    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno' });
    }
}
```

#### Passo 2: Adicionar Rota

```javascript
// routes/apis/userRouter.js
import GetUserReservationsController from '../../app/Controllers/UserApi/GetUserReservationsController.js';

// Adicionar após GetUserController:
router.get('/:id/reservations', GetUserReservationsController);
```

#### Passo 3: Documentar Swagger

```javascript
// config/swagger.js
paths: {
    '/users/{id}/reservations': {
        get: {
            tags: ['Users'],
            summary: 'Listar reservas de um usuário',
            parameters: [
                {
                    name: 'id',
                    in: 'path',
                    required: true,
                    schema: { type: 'string', format: 'uuid' }
                }
            ],
            responses: {
                '200': {
                    description: 'Lista de reservas',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/Reservation' }
                            }
                        }
                    }
                },
                '404': { description: 'Usuário não encontrado' }
            }
        }
    }
}
```

#### Passo 4: Testar

```bash
# 1. Fazer login para obter JWT
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aurora.example","password":"HASHED_PASSWORD_PLACEHOLDER"}'

# Resposta:
# {"token":"eyJ...","user":{"id":"uuid-123","name":"Admin","email":"admin@aurora.example","role":"ADMIN"}}

# 2. Usar token para acessar novo endpoint
curl -X GET http://localhost:3000/users/uuid-123/reservations \
  -H "Authorization: Bearer eyJ..."

# Resposta:
# [{"id":"res-1","user_id":"uuid-123","guest_id":"guest-1","status":"PENDING","check_in_date":"2026-07-01"}]
```

---

## 📐 Padrões de Desenvolvimento

### Validação de Entrada

✅ **DO:**
```javascript
const { email, password } = request.body;

if (!email) return response.status(400).json({ error: 'email obrigatório' });
if (!password) return response.status(400).json({ error: 'password obrigatório' });

// Validar formato
if (!email.includes('@')) return response.status(400).json({ error: 'email inválido' });
if (password.length < 6) return response.status(400).json({ error: 'password mínimo 6 caracteres' });
```

❌ **DON'T:**
```javascript
// Sem validação
const user = await UserModel.findOne({ where: { email: request.body.email } });
```

### Tratamento de Erro

✅ **DO:**
```javascript
try {
    const user = await UserModel.findOne({ where: { email } });
    if (!user) return response.status(404).json({ error: 'Usuário não encontrado' });
    // ...
} catch (error) {
    console.error('Erro ao buscar usuário:', error);
    return response.status(500).json({ error: 'Erro interno do servidor' });
}
```

❌ **DON'T:**
```javascript
// Sem try-catch (unhandled rejection)
const user = await UserModel.findOne({ where: { email } });
```

### Isolamento Multi-Tenant

✅ **DO:**
```javascript
// Sempre filtrar por tenantId do JWT
const user = await UserModel.findOne({
    where: { id, tenant_id: request.user.tenantId }
});
```

❌ **DON'T:**
```javascript
// Sem filtro de tenant (security issue!)
const user = await UserModel.findByPk(id);
```

### Respostas HTTP

✅ **DO:**
```javascript
// Criar
response.status(201).json({ id, name, email });

// OK
response.json({ users: [...] });

// Erro validação
response.status(400).json({ error: 'Email obrigatório' });

// Não autorizado
response.status(401).json({ error: 'Token inválido' });

// Acesso negado
response.status(403).json({ error: 'Acesso não autorizado' });

// Não encontrado
response.status(404).json({ error: 'Usuário não encontrado' });

// Conflito (duplicata)
response.status(409).json({ error: 'Email já cadastrado' });

// Erro servidor
response.status(500).json({ error: 'Erro interno do servidor' });
```

### Senhas

✅ **DO:**
```javascript
import bcrypt from 'bcryptjs';

// Hash na criação
const password_hash = await bcrypt.hash(password, 10);
await UserModel.create({ password_hash });

// Compare no login
const valid = await bcrypt.compare(password, user.password_hash);
if (!valid) return response.status(401).json({ error: 'Credenciais inválidas' });
```

❌ **DON'T:**
```javascript
// Nunca salvar senha em texto plano
await UserModel.create({ password: password });
```

### JWT

✅ **DO:**
```javascript
import jwt from 'jsonwebtoken';

// Gerar com payload
const token = jwt.sign(
    { userId: user.id, tenantId: user.tenant_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
);

// Verificar em middleware
const payload = jwt.verify(token, process.env.JWT_SECRET);
request.user = payload;
```

---

## 💾 Banco de Dados

### Criar Tabela

```sql
-- db/schema.sql
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (tenant_id, name),
  CHECK (price >= 0)
);

CREATE INDEX idx_products_tenant ON products(tenant_id);
```

### Criar Model Sequelize

```javascript
// app/Models/ProductModel.js
import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const ProductModel = sequelize.define(
    'ProductModel',
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'hotels', key: 'id' }
        },
        name: { type: DataTypes.TEXT, allowNull: false },
        price: { type: DataTypes.DECIMAL(10, 2), allowNull: false }
    },
    {
        tableName: 'products',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
);

export default ProductModel;
```

### Adicionar Relacionamento

```javascript
// database/relations.js
TenantModel.hasMany(ProductModel, { foreignKey: "tenant_id", as: "products" });
ProductModel.belongsTo(TenantModel, { foreignKey: "tenant_id", as: "tenant" });
```

### Queries Comuns

```javascript
// Criar
await ProductModel.create({ tenant_id, name, price });

// Listar
await ProductModel.findAll({ where: { tenant_id } });

// Buscar um
await ProductModel.findOne({ where: { id, tenant_id } });

// Atualizar
await ProductModel.update(
    { name, price },
    { where: { id, tenant_id } }
);

// Deletar (soft delete automático)
await ProductModel.destroy({ where: { id, tenant_id } });

// Com relacionamento
await TenantModel.findByPk(tenantId, { include: 'products' });
```

### Indices Importantes

Para melhorar performance, adicionar índices em produção:

```sql
CREATE INDEX idx_users_email ON users(tenant_id, email);
CREATE INDEX idx_reservations_guest ON reservations(guest_id);
CREATE INDEX idx_payments_reservation ON payments(reservation_id);
CREATE INDEX idx_reservation_rooms_pivô ON reservation_rooms(reservation_id, room_id);
```

---

## 🔐 Segurança

### Autenticação

- ✅ JWT com expiração 8h
- ✅ bcryptjs com 10 rounds
- ✅ Tokens verificados em middleware
- ⚠️ Sem refresh tokens (MVP)

### Autorização

- ✅ Roles ADMIN/RECEPTIONIST
- ✅ DELETE exige ADMIN
- ✅ Multi-tenant isolation

### SQL Injection

- ✅ ORM Sequelize parameteriza queries
- ✅ Nenhuma query raw (evitar .query())

### XSS

- ✅ API não renderiza HTML
- ✅ Dados retornam como JSON

### Rate Limiting

- ❌ Não implementado (adicionar em produção)
- Recomendação: express-rate-limit

### HTTPS

- ❌ Não configurado (apenas HTTP)
- Recomendação: Nginx com certificado SSL/TLS

---

## 🔧 Troubleshooting Dev

### Erro: "Sequelize não conecta"

```bash
# Verificar variáveis
echo $POSTGRES_HOST
echo $POSTGRES_DB

# Testar conexão BD
docker exec hotel_postgres psql -U hotel_user -d gestao_hotel -c "SELECT 1"

# Ver logs
docker compose logs postgres
```

### Erro: "Model não tem assocação"

```javascript
// Verificar se relationamento foi definido em database/relations.js
// Se faltou:
TenantModel.hasMany(ProductModel, { foreignKey: "tenant_id" });

// Testar include:
await TenantModel.findByPk(id, { include: 'products' });
```

### Erro: "Email já cadastrado" (mesmo quando não tem)

```javascript
// Problema: unique não é por tenant
// Correção em Model:
{
    email: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: 'unique_email_per_tenant'  // ← Chave composta
    }
}
```

---

## ✅ Checklist de Qualidade

Antes de fazer PR:

- [ ] Código segue padrão de outro controller
- [ ] Validação de entrada (campos obrigatórios)
- [ ] Try-catch em operações async
- [ ] Isolamento por tenantId
- [ ] Status HTTP apropriado (201, 400, 401, 403, 404, 500)
- [ ] Sem senhas em texto plano
- [ ] Sem queries raw (usar ORM)
- [ ] Endpoints documentados em swagger.js
- [ ] Testado em http://localhost:3000/api-docs
- [ ] Commit com mensagem clara

---

## 📚 Recursos

- [Express Documentation](https://expressjs.com/)
- [Sequelize Documentation](https://sequelize.org/)
- [JWT Introduction](https://jwt.io/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

**Última atualização**: Junho 3, 2026  
**Mantido por**: Tech Lead

