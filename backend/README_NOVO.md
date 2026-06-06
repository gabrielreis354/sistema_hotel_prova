# 🚀 Backend — Instalação, Execução e Desenvolvimento

> Guia prático para iniciar, desenvolver e testar o backend do Sistema de Gestão de Hotel.

---

## 📋 Quick Start (5 minutos)

### 1. Instalar Dependências

```bash
cd backend
npm install
```

### 2. Configurar Banco de Dados

```bash
# Opção A: Com Docker (recomendado)
docker-compose up -d

# Opção B: Com PostgreSQL local já instalado
# (sem comando, apenas verifique que está rodando)
```

### 3. Executar Migrations e Seeders

```bash
npm run migrate
npm run seed
```

### 4. Iniciar Servidor

```bash
npm run dev
```

### 5. Testar

```bash
curl http://localhost:3000
# Resposta: {"status":"online","project":"Sistema Hotel API"}
```

✅ **Pronto!** Backend rodando em `http://localhost:3000`

---

## 📁 Estrutura do Backend

```
backend/
├── src/
│   ├── app.ts                      ← App Express
│   ├── server.ts                   ← Inicialização + servidor
│   ├── config/
│   │   └── database.ts             ← Conexão Sequelize
│   ├── models/                     ← ORM Models
│   │   ├── User.ts                 ⚠️ Desalinhado com schema
│   │   ├── Room.ts                 ⚠️ Desalinhado com schema
│   │   ├── Reservation.ts          ⚠️ Incompleto
│   │   └── ReservationRoom.ts      ⚠️ Não usado
│   ├── database/
│   │   ├── config.js               ← Config Sequelize CLI
│   │   ├── migrations/
│   │   │   ├── 20260521-create-schema.js
│   │   │   └── 20260522-add-unique-constraint-hotels-name.js
│   │   └── seeders/
│   │       └── 20260521-seed-hotels.js
│   ├── controllers/                ❌ (não existe — TODO)
│   ├── services/                   ❌ (não existe — TODO)
│   ├── routes/                     ❌ (não existe — TODO)
│   └── middlewares/                ❌ (não existe — TODO)
├── dist/                           ← Build TypeScript
├── .env.example                    ← Template variáveis
├── .sequelizerc                    ← Config CLI Sequelize
├── package.json
├── tsconfig.json
└── README.md (este arquivo)
```

---

## 🔧 Scripts Disponíveis

### Desenvolvimento

```bash
# Inicia servidor com hot-reload (ts-node-dev)
npm run dev

# Compila TypeScript
npm run build

# Executa versão compilada
npm run start
```

### Banco de Dados

```bash
# Cria todas as tabelas (migrations up)
npm run migrate

# Remove todas as tabelas (migrations down)
npm run migrate:undo

# Popula banco com dados de demo
npm run seed

# Listar migrations (requer sequelize-cli instalado globalmente)
npm run migrate -- status
```

### Combinações Comuns

```bash
# Setup completo from scratch
npm run migrate:undo && npm run migrate && npm run seed

# Reset + Development
npm run migrate:undo && npm run migrate && npm run seed && npm run dev
```

---

## 🗄️ Migrations

Controlam versão do schema PostgreSQL.

### Como Funcionam

```bash
# Executa todas as migrations não aplicadas
npm run migrate

# Executa no contexto:
# npx sequelize-cli db:migrate --config ./src/database/config.js
```

### Migrations Disponíveis

| Arquivo | Data | Descrição | Status |
|---------|------|-----------|--------|
| `20260521-create-schema.js` | 2026-05-21 | Cria 7 tabelas principais | ✅ Implementado |
| `20260522-add-unique-constraint-hotels-name.js` | 2026-05-22 | Constraint unique em hotels.name | ✅ Implementado |

### Arquivo de Configuração

O arquivo `src/database/config.js` define a conexão:

```javascript
module.exports = {
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres'
  }
}
```

Lê variáveis de `.env` via `dotenv` (veja seção abaixo).

---

## 🌱 Seeders

Populam banco com dados iniciais/de teste.

### Como Funcionam

```bash
npm run seed

# Executa no contexto:
# npx sequelize-cli db:seed:all --config ./src/database/config.js
```

### Dados Criados

#### Hotels
```sql
INSERT INTO hotels VALUES
  ('Hotel Aurora', '00.000.000/0001-01'),
  ('Pousada Sol', '00.000.000/0001-02');
```

#### Room Categories (para Hotel Aurora)
```sql
INSERT INTO room_categories VALUES
  ('Standard', 2 guests, R$ 120/noite),
  ('Suite', 4 guests, R$ 320/noite);
```

#### Rooms
```sql
INSERT INTO rooms VALUES
  ('101', floor 1, Standard, AVAILABLE);
```

#### Users
```sql
INSERT INTO users VALUES
  (email: admin@aurora.example, role: ADMIN);
```

#### Guests
```sql
INSERT INTO guests VALUES
  ('João Silva', CPF: 11122233344);
```

### Verificar Dados

```bash
# Acessar PostgreSQL via Docker
docker exec -it hotel_postgres psql -U hotel_user -d hotel_db

# Dentro do psql:
SELECT * FROM hotels;
SELECT * FROM room_categories WHERE name = 'Standard';
SELECT * FROM rooms;
SELECT * FROM users;
SELECT * FROM guests;

\q  # Sair
```

---

## 🔐 Variáveis de Ambiente

### Arquivo `.env`

Crie baseado em `.env.example`:

```bash
cp .env.example .env
```

### Variáveis Obrigatórias

```env
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=hotel_db
DB_USER=hotel_user
DB_PASSWORD=hotel_pass
```

### Variáveis Opcionais (mas recomendadas)

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=seu-secret-super-seguro-aqui-min-32-caracteres
JWT_EXPIRY=24h
LOG_LEVEL=debug
```

### ⚠️ Segurança

- **Nunca commite `.env`** (está em `.gitignore`)
- **Altere JWT_SECRET** — use string forte (32+ chars)
- **Use valores diferentes** entre dev/staging/prod
- **Em produção**: use gestor de secrets (AWS Secrets Manager, HashiCorp Vault, etc)

---

## 📡 Execução Local

### Terminal 1: Banco de Dados (Docker)

```bash
docker-compose up
```

Aguarde:
```
hotel_postgres | [1] LOG:  database system is ready to accept connections
```

### Terminal 2: Aplicação

```bash
cd backend
npm install  # (se primeira vez)
npm run migrate
npm run seed
npm run dev
```

Saída esperada:
```
✅ PostgreSQL conectado
🚀 Servidor rodando na porta 3000
```

### Terminal 3: Teste

```bash
curl http://localhost:3000
```

Resposta:
```json
{"status":"online","project":"Sistema Hotel API"}
```

---

## 🚢 Execução em Produção (Futuro)

### Build

```bash
npm run build
```

Compila `src/*.ts` → `dist/*.js`

### Execução

```bash
export NODE_ENV=production
export DB_PASSWORD=MINHA_SENHA_SEGURA
npm start
```

---

## 📊 Rotas Principais (Planejadas)

| Método | Rota | Descrição | Status |
|--------|------|-----------|--------|
| `GET` | `/` | Health check | ✅ Implementado |
| `POST` | `/auth/register` | Registrar usuário | ❌ TODO |
| `POST` | `/auth/login` | Login com JWT | ❌ TODO |
| `GET` | `/rooms` | Listar quartos | ❌ TODO |
| `GET` | `/rooms/available` | Quartos disponíveis | ❌ TODO |
| `POST` | `/rooms` | Criar quarto | ❌ TODO |
| `GET` | `/guests` | Listar hóspedes | ❌ TODO |
| `POST` | `/guests` | Registrar hóspede | ❌ TODO |
| `POST` | `/reservations` | Criar reserva | ❌ TODO |
| `GET` | `/reservations/:id` | Buscar reserva | ❌ TODO |
| `PATCH` | `/reservations/:id/check-in` | Check-in | ❌ TODO |
| `PATCH` | `/reservations/:id/check-out` | Check-out | ❌ TODO |

---

## ⚙️ Boas Práticas de Desenvolvimento

### 1. Controllers

Responsáveis por **requisições HTTP**, não lógica.

```typescript
// ❌ ERRADO
export class RoomController {
  async create(req, res) {
    const room = await Room.create(req.body);  // ← Lógica aqui
    res.json(room);
  }
}

// ✅ CERTO
export class RoomController {
  constructor(private roomService: RoomService) {}
  
  async create(req, res) {
    const room = await this.roomService.create(req.body);  // ← Lógica delegada
    res.status(201).json(room);
  }
}
```

### 2. Services

Responsáveis por **lógica de negócio**, não HTTP.

```typescript
// ✅ Exemplo correto
export class ReservationService {
  async createReservation(data) {
    // Valida conflito
    const conflict = await this.checkConflict(data.roomId, data.checkInDate, data.checkOutDate);
    if (conflict) throw new Error('Quarto indisponível');
    
    // Calcula total
    const nights = daysBetween(data.checkInDate, data.checkOutDate);
    const totalAmount = nights * category.pricePerNight;
    
    // Persiste
    return await Reservation.create({
      ...data,
      totalAmount,
      status: 'PENDING'
    });
  }
}
```

### 3. Models

Definem estrutura de dados, NÃO lógica.

```typescript
// ✅ Exemplo correto (simples)
export class Reservation extends Model {}

Reservation.init({
  id: { type: DataTypes.UUID, primaryKey: true },
  checkInDate: { type: DataTypes.DATEONLY },
  checkOutDate: { type: DataTypes.DATEONLY },
  status: { type: DataTypes.ENUM('PENDING', 'CONFIRMED', ...) },
  totalAmount: { type: DataTypes.DECIMAL(12, 2) }
}, { sequelize, tableName: 'reservations' });
```

### 4. Middlewares de Autenticação

Valida JWT antes de acessar controller.

```typescript
// ✅ Exemplo esperado (ainda não implementado)
export const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
};
```

### 5. Validações

Use schemas (Joi, Zod, etc) para validar entrada.

```typescript
// ✅ Exemplo esperado
export const createReservationSchema = {
  guestId: joi.string().uuid().required(),
  roomId: joi.string().uuid().required(),
  checkInDate: joi.date().required(),
  checkOutDate: joi.date().min(joi.ref('checkInDate')).required()
};
```

---

## 🧪 Testes (Futuro)

### Estrutura de Testes

```
backend/
├── src/
│   └── ...
└── __tests__/
    ├── unit/
    │   ├── services/
    │   └── utils/
    └── integration/
        ├── auth.test.ts
        ├── rooms.test.ts
        └── reservations.test.ts
```

### Executar Testes

```bash
npm test
npm test:coverage
```

---

## 🐛 Debugging

### Logs

Servidor exibe logs em `src/server.ts`:

```typescript
console.log("✅ PostgreSQL conectado");
console.error("❌ Erro ao conectar ao banco:", error);
```

### Ver Logs do Docker

```bash
docker-compose logs postgres -f
docker-compose logs postgres | tail -50
```

### Breakpoints (VS Code)

Configure `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Backend",
      "program": "${workspaceFolder}/backend/src/server.ts",
      "preLaunchTask": "tsc",
      "outFiles": ["${workspaceFolder}/backend/dist/**/*.js"],
      "env": { "NODE_ENV": "development" }
    }
  ]
}
```

Depois abra arquivo `.ts`, defina breakpoint (F9) e pressione F5.

---

## 📚 Documentação Relacionada

- [README.md](../README.md) — Visão geral completa
- [CODING_STANDARDS.md](../docs/CODING_STANDARDS.md) — Padrões de código
- [ARQ_BACKEND.md](../docs/back/ARQ_BACKEND.md) — Arquitetura detalhada
- [ARQ_DATABASE.md](../docs/db/ARQ_DATABASE.md) — Schema e relacionamentos

---

## 🚨 Problemas Comuns

### "Cannot find module 'dotenv'"

```bash
npm install
```

### "Cannot connect to PostgreSQL"

1. Verifique se PostgreSQL está rodando:
   ```bash
   docker ps  # Deve listar hotel_postgres
   ```

2. Verifique credenciais em `.env`:
   ```bash
   cat .env | grep DB_
   ```

3. Teste conexão direta:
   ```bash
   docker exec -it hotel_postgres psql -U hotel_user -d hotel_db -c "SELECT 1;"
   ```

### "Relation 'users' does not exist"

Migrations não foram executadas:
```bash
npm run migrate
```

### "Porta 5432 já em uso"

Outro PostgreSQL está rodando:
```bash
docker-compose down
# OU parar PostgreSQL local
pg_ctl stop
```

---

## 📋 Checklist — Primeiro Setup

- [ ] Instalou Node.js (20.x+)
- [ ] Clonou repositório
- [ ] Navegou para `/backend`
- [ ] Executou `npm install`
- [ ] Copiou `.env.example` para `.env`
- [ ] Iniciou Docker: `docker-compose up -d`
- [ ] Aguardou PostgreSQL ficar pronto (5-10s)
- [ ] Executou migrations: `npm run migrate`
- [ ] Executou seeders: `npm run seed`
- [ ] Iniciou dev: `npm run dev`
- [ ] Testou GET / (recebeu JSON)
- [ ] Verificou dados no BD:
  ```bash
  docker exec -it hotel_postgres psql -U hotel_user -d hotel_db -c "SELECT COUNT(*) FROM users;"
  ```

---

**Dúvidas?** Consulte [README.md](../README.md) para contexto completo ou abra uma issue no repositório.
