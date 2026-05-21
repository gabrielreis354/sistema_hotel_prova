# Arquitetura do Backend

## Stack

| Tecnologia | Papel |
|------------|-------|
| Node.js + Express | Servidor HTTP |
| TypeScript | Tipagem estática |
| Sequelize | ORM + Migrations |
| PostgreSQL | Banco de dados relacional |
| JWT + bcrypt | Autenticação e hash de senha |
| Swagger (swagger-jsdoc) | Documentação da API |

---

## Estrutura de Pastas

```
src/
├── config/
│   └── index.ts                  ← todas as variáveis de ambiente tipadas
│
├── database/
│   ├── connection.ts             ← instância do Sequelize
│   └── migrations/               ← arquivos de migration (um por alteração de schema)
│
├── middlewares/
│   ├── auth.middleware.ts        ← valida JWT, popula req.user
│   ├── tenant.middleware.ts      ← injeta req.tenantId (demo: fixo / TCC: do JWT)
│   └── error.middleware.ts       ← handler global de erros (AppError → resposta padronizada)
│
├── modules/
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.routes.ts
│   │
│   ├── rooms/
│   │   ├── room.controller.ts
│   │   ├── room.service.ts
│   │   ├── room.repository.ts
│   │   ├── room.model.ts
│   │   └── room.routes.ts
│   │
│   ├── room-categories/
│   │   ├── room-category.controller.ts
│   │   ├── room-category.service.ts
│   │   ├── room-category.repository.ts
│   │   ├── room-category.model.ts
│   │   └── room-category.routes.ts
│   │
│   ├── guests/
│   │   ├── guest.controller.ts
│   │   ├── guest.service.ts
│   │   ├── guest.repository.ts
│   │   ├── guest.model.ts
│   │   └── guest.routes.ts
│   │
│   └── reservations/
│       ├── reservation.controller.ts
│       ├── reservation.service.ts
│       ├── reservation.repository.ts
│       ├── reservation.model.ts
│       └── reservation.routes.ts
│
├── types/
│   └── express.d.ts              ← augmentação do tipo Request (tenantId, user)
│
├── utils/
│   └── AppError.ts               ← classe de erro com statusCode e mensagem
│
├── app.ts                        ← setup do Express (middlewares globais, rotas, swagger)
└── server.ts                     ← entry point (listen na porta)
```

---

## Padrão por Módulo

Cada módulo segue a mesma separação de responsabilidades:

```
Controller  → recebe req, chama service, devolve res. Zero lógica de negócio.
Service     → regras de negócio. Chama repository para persistência.
Repository  → toda e qualquer query ao banco. Único ponto de contato com o ORM.
Model       → definição Sequelize da tabela, tipos e associações.
Routes      → monta o router Express com middlewares corretos por rota.
```

---

## Fundação Multi-Tenant

O schema e os repositories são multi-tenant completos desde a demo. Na demo, a tabela `tenants` tem 1 registro seedado e o JWT sempre aponta para esse tenant. No TCC, o onboarding cria novos tenants e o JWT passa a carregar o tenant do hotel cadastrado. **O código de middleware e repositories não muda entre as fases.**

```typescript
// src/middlewares/tenant.middleware.ts
// Funciona igual em Demo, TCC e Produto
export const tenantMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  req.tenantId = req.user!.tenantId; // sempre vem do JWT
  next();
};
```

Todos os repositories recebem `tenantId` como parâmetro desde o início:

```typescript
// Demo, TCC e Produto — mesmo código
findAll(tenantId: string): Promise<Room[]> {
  return Room.findAll({ where: { tenantId } });
}

findById(id: string, tenantId: string): Promise<Room | null> {
  return Room.findOne({ where: { id, tenantId } });
}
```

---

## Entidades

### Tenant

| Campo | Tipo | Observações |
|-------|------|-------------|
| id | UUID | PK, gerado automaticamente |
| name | string | nome do hotel ou pousada |
| subdomain | string | único — usado no TCC para roteamento |
| status | enum | ACTIVE, SUSPENDED |
| createdAt | timestamp | automático |
| updatedAt | timestamp | automático |

> **Demo**: 1 registro seedado com UUID fixo. **TCC**: criado via `POST /tenants` no onboarding. Não usa soft delete — tenants são suspensos, nunca excluídos.

### User

| Campo | Tipo | Observações |
|-------|------|-------------|
| id | UUID | PK, gerado automaticamente |
| tenantId | UUID | Fixo na demo |
| name | string | |
| email | string | único por tenant |
| password | string | hash bcrypt, nunca exposto |
| role | enum | ADMIN, RECEPTIONIST |
| createdAt | timestamp | automático |
| updatedAt | timestamp | automático |
| deletedAt | timestamp | soft delete (paranoid) |

### RoomCategory

| Campo | Tipo | Observações |
|-------|------|-------------|
| id | UUID | PK |
| tenantId | UUID | |
| name | string | ex: Standard, Luxo, Suite |
| description | string | |
| pricePerNight | decimal | preço base da categoria |
| createdAt | timestamp | |
| updatedAt | timestamp | |
| deletedAt | timestamp | soft delete |

### Room

| Campo | Tipo | Observações |
|-------|------|-------------|
| id | UUID | PK |
| tenantId | UUID | |
| categoryId | UUID | FK → RoomCategory |
| number | string | ex: 101, 202 |
| floor | integer | |
| capacity | integer | |
| status | enum | AVAILABLE, OCCUPIED, MAINTENANCE, CLEANING |
| createdAt | timestamp | |
| updatedAt | timestamp | |
| deletedAt | timestamp | soft delete |

### Guest

| Campo | Tipo | Observações |
|-------|------|-------------|
| id | UUID | PK |
| tenantId | UUID | |
| fullName | string | |
| cpf | string | único por tenant |
| phone | string | |
| email | string | |
| createdAt | timestamp | |
| updatedAt | timestamp | |
| deletedAt | timestamp | soft delete |

### Reservation

| Campo | Tipo | Observações |
|-------|------|-------------|
| id | UUID | PK |
| tenantId | UUID | |
| guestId | UUID | FK → Guest |
| roomId | UUID | FK → Room |
| checkInDate | date | |
| checkOutDate | date | |
| totalAmount | decimal | calculado na criação, imutável após check-in |
| status | enum | PENDING, CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED |
| createdAt | timestamp | |
| updatedAt | timestamp | |
| deletedAt | timestamp | soft delete |

---

## Endpoints

### Auth

```http
POST /auth/register
POST /auth/login
```

JWT payload: `{ userId, role, tenantId }`

### Room Categories

```http
GET    /room-categories
POST   /room-categories
PATCH  /room-categories/:id
DELETE /room-categories/:id
```

### Rooms

```http
GET    /rooms
POST   /rooms
PATCH  /rooms/:id
DELETE /rooms/:id
GET    /rooms/available?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
```

### Guests

```http
GET    /guests
GET    /guests/:id
POST   /guests
PUT    /guests/:id
DELETE /guests/:id
```

### Reservations

```http
POST   /reservations
GET    /reservations
GET    /reservations/:id
PATCH  /reservations/:id/cancel
PATCH  /reservations/:id/check-in
PATCH  /reservations/:id/check-out
```

---

## Regras de Negócio

### RN-01 — Conflito de reservas

Não é possível criar uma reserva se o quarto já possui uma reserva `CONFIRMED` ou `CHECKED_IN` com sobreposição de datas:

```
nova.checkIn  < existente.checkOut
    E
nova.checkOut > existente.checkIn
```

### RN-02 — Check-in

Pré-condição: status da reserva deve ser `CONFIRMED`.  
Ao confirmar: status da reserva → `CHECKED_IN`, status do quarto → `OCCUPIED`.

### RN-03 — Check-out

Pré-condição: status da reserva deve ser `CHECKED_IN`.  
Ao confirmar: status da reserva → `CHECKED_OUT`, status do quarto → `CLEANING`.

### RN-04 — Cancelamento

Pré-condição: status da reserva deve ser `CONFIRMED` ou `PENDING`.  
Reservas com status `CHECKED_IN` não podem ser canceladas — devem passar pelo check-out.  
Ao cancelar: status do quarto → `AVAILABLE`.

### RN-05 — Cálculo do total

```
totalAmount = noites × pricePerNight da RoomCategory
noites = diferença em dias entre checkOutDate e checkInDate
```

Calculado no momento da criação. Imutável após check-in.

---

## Tipos Globais

```typescript
// src/types/express.d.ts
declare namespace Express {
  interface Request {
    user?: {
      userId: string;
      role: 'ADMIN' | 'RECEPTIONIST';
      tenantId: string;
    };
    tenantId: string;
  }
}
```

---

## Formato Padrão de Resposta

```json
// Sucesso
{ "success": true, "data": { ... } }

// Erro
{ "success": false, "error": "mensagem legível para o cliente" }

// Lista (futuro — paginação)
{ "success": true, "data": [...], "meta": { "total": 100, "page": 1, "limit": 20 } }
```

---

**Versão**: 2.0 | **Maio 2026**


### Funcionalidades

* login;
* registro;
* JWT;
* proteção de rotas.

### Entidade

User:

* id;
* name;
* email;
* password;
* role.

---

# 2. Quartos

### Funcionalidades

* cadastrar quarto;
* listar quartos;
* atualizar quarto;
* remover quarto;
* listar quartos disponíveis.

### Entidade

Room:

* id;
* number;
* floor;
* capacity;
* pricePerNight;
* status.

### Status

* AVAILABLE;
* OCCUPIED;
* MAINTENANCE;
* CLEANING.

---

# 3. Hóspedes

### Funcionalidades

* cadastrar hóspede;
* listar hóspedes;
* buscar hóspede;
* atualizar hóspede;
* remover hóspede.

### Entidade

Guest:

* id;
* fullName;
* cpf;
* phone;
* email.

---

# 4. Reservas (Módulo Principal)

### Funcionalidades

* criar reserva;
* listar reservas;
* buscar reserva;
* cancelar reserva;
* check-in;
* check-out.

### Entidade

Reservation:

* id;
* guestId;
* roomId;
* checkInDate;
* checkOutDate;
* status.

### Status

* PENDING;
* CONFIRMED;
* CHECKED_IN;
* CHECKED_OUT;
* CANCELLED.

---

# Regras de Negócio

## Regra 1

Não permitir reservas conflitantes no mesmo quarto.

---

## Regra 2

Check-in altera status do quarto.

---

## Regra 3

Check-out libera quarto.

---

## Regra 4

Cancelamento libera disponibilidade.

---

# Endpoints Principais

## Auth

```http
POST /auth/login
POST /auth/register
```

---

## Rooms

```http
GET /rooms
POST /rooms
PATCH /rooms/:id
DELETE /rooms/:id
GET /rooms/available
```

---

## Guests

```http
GET /guests
GET /guests/:id
POST /guests
PUT /guests/:id
DELETE /guests/:id
```

---

## Reservations

```http
POST /reservations
GET /reservations
GET /reservations/:id
PATCH /reservations/:id/cancel
PATCH /reservations/:id/check-in
PATCH /reservations/:id/check-out
```

---