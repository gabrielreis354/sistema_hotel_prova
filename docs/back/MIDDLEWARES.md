# Plano de Middlewares — CorePMS SaaS Multi-Tenant

## Visão Geral

O sistema usa três middlewares de proteção compostos em cadeia. Cada middleware tem uma responsabilidade única (SRP) e é aplicado **por rota** no router, nunca globalmente.

| Middleware | Arquivo | Responsabilidade |
|-----------|---------|-----------------|
| Auth | `auth.middleware.js` | Valida JWT → injeta `request.user = { userId, role, tenantId }` |
| Tenant | `tenant.middleware.js` | Verifica tenant `ACTIVE` → injeta `request.tenantId` |
| Role | `role.middleware.js` | Controla acesso por papel via `requireRole(...roles)` |

---

## Cadeia de Execução

```
Request
  └── authMiddleware           ← verifica JWT, injeta request.user
        └── tenantMiddleware   ← verifica tenant ACTIVE, injeta request.tenantId
              └── requireRole  ← verifica request.user.role (apenas em rotas restritas)
                    └── Controller
```

A ordem é obrigatória:
- `requireRole` depende de `request.user.role` que só existe após `authMiddleware`
- `tenantMiddleware` depende de `request.user.tenantId` que só existe após `authMiddleware`

**Rotas públicas** (`POST /auth/login`, `POST /auth/register`) não aplicam nenhum middleware.

---

## Implementação dos Middlewares

### `auth.middleware.js`

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

### `tenant.middleware.js`

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

        if (!tenant) {
            return response.status(401).json({ error: 'Tenant não encontrado' });
        }

        if (tenant.status !== 'ACTIVE') {
            return response.status(403).json({ error: 'Conta suspensa' });
        }

        request.tenantId = tenantId;
        next();
    } catch {
        return response.status(500).json({ error: 'Internal server error' });
    }
}
```

### `role.middleware.js` — Higher-Order Function

Usa o padrão **factory** (higher-order function): recebe os papéis permitidos e retorna um middleware. Isso elimina a necessidade de um arquivo por papel (`adminMiddleware.js`, `receptionistMiddleware.js`), mantendo o código DRY.

```javascript
// middlewares/role.middleware.js
export function requireRole(...allowedRoles) {
    return (request, response, next) => {
        const userRole = request.user?.role;

        if (!userRole || !allowedRoles.includes(userRole)) {
            return response.status(403).json({ error: 'Acesso não autorizado' });
        }

        next();
    };
}
```

**Uso em rota:**
```javascript
import { requireRole } from '../../middlewares/role.middleware.js';

// Apenas ADMIN pode criar quartos
router.post('/', authMiddleware, tenantMiddleware, requireRole('ADMIN'), CreateRoomController);

// ADMIN e RECEPTIONIST podem criar reservas
router.post('/', authMiddleware, tenantMiddleware, requireRole('ADMIN', 'RECEPTIONIST'), CreateReservationController);
```

---

## Tabela de Permissões por Rota

### Papéis

| Papel | Descrição |
|-------|-----------|
| `ADMIN` | Acesso total: gerencia estrutura (quartos, categorias, usuários) e opera o PMS |
| `RECEPTIONIST` | Operação diária: hóspedes, reservas, check-in/out — sem gerenciamento de estrutura |

### Matriz de Acesso

| Domínio | Endpoint | Método | auth | tenant | requireRole |
|---------|----------|--------|------|--------|-------------|
| **Auth** | `POST /auth/login` | Público | — | — | — |
| **Auth** | `POST /auth/register` | Público | — | — | — |
| **Users** | `GET /users` | Listar usuários | ✓ | ✓ | `ADMIN` |
| **Users** | `POST /users` | Criar usuário | ✓ | ✓ | `ADMIN` |
| **Users** | `PUT /users/:id` | Atualizar usuário | ✓ | ✓ | `ADMIN` |
| **Users** | `DELETE /users/:id` | Deletar usuário | ✓ | ✓ | `ADMIN` |
| **Room Categories** | `GET /room-categories` | Listar categorias | ✓ | ✓ | — |
| **Room Categories** | `POST /room-categories` | Criar categoria | ✓ | ✓ | `ADMIN` |
| **Room Categories** | `PUT /room-categories/:id` | Atualizar categoria | ✓ | ✓ | `ADMIN` |
| **Room Categories** | `DELETE /room-categories/:id` | Deletar categoria | ✓ | ✓ | `ADMIN` |
| **Rooms** | `GET /rooms` | Listar quartos | ✓ | ✓ | — |
| **Rooms** | `GET /rooms/:id` | Buscar quarto | ✓ | ✓ | — |
| **Rooms** | `POST /rooms` | Criar quarto | ✓ | ✓ | `ADMIN` |
| **Rooms** | `PUT /rooms/:id` | Atualizar quarto | ✓ | ✓ | `ADMIN` |
| **Rooms** | `DELETE /rooms/:id` | Deletar quarto | ✓ | ✓ | `ADMIN` |
| **Guests** | `GET /guests` | Listar hóspedes | ✓ | ✓ | — |
| **Guests** | `GET /guests/:id` | Buscar hóspede | ✓ | ✓ | — |
| **Guests** | `POST /guests` | Criar hóspede | ✓ | ✓ | — |
| **Guests** | `PUT /guests/:id` | Atualizar hóspede | ✓ | ✓ | — |
| **Guests** | `DELETE /guests/:id` | Deletar hóspede | ✓ | ✓ | `ADMIN` |
| **Reservations** | `GET /reservations` | Listar reservas | ✓ | ✓ | — |
| **Reservations** | `GET /reservations/:id` | Buscar reserva | ✓ | ✓ | — |
| **Reservations** | `POST /reservations` | Criar reserva | ✓ | ✓ | — |
| **Reservations** | `PUT /reservations/:id/check-in` | Check-in | ✓ | ✓ | — |
| **Reservations** | `PUT /reservations/:id/check-out` | Check-out | ✓ | ✓ | — |
| **Reservations** | `PUT /reservations/:id` | Editar reserva | ✓ | ✓ | — |
| **Reservations** | `DELETE /reservations/:id` | Cancelar reserva | ✓ | ✓ | `ADMIN` |

> Colunas `auth` e `tenant` com `—` indicam rotas públicas. `requireRole` com `—` significa que qualquer usuário autenticado com tenant ACTIVE tem acesso.

---

## Exemplo de Router com Cadeia Completa

```javascript
// routes/apis/roomRouter.js
import { Router } from 'express';
import authMiddleware    from '../../middlewares/auth.middleware.js';
import tenantMiddleware  from '../../middlewares/tenant.middleware.js';
import { requireRole }   from '../../middlewares/role.middleware.js';
import ListRoomController   from '../../app/Controllers/RoomApi/ListRoomController.js';
import GetRoomController    from '../../app/Controllers/RoomApi/GetRoomController.js';
import CreateRoomController from '../../app/Controllers/RoomApi/CreateRoomController.js';
import UpdateRoomController from '../../app/Controllers/RoomApi/UpdateRoomController.js';
import DeleteRoomController from '../../app/Controllers/RoomApi/DeleteRoomController.js';

export default (() => {
    const router = Router();

    // Leitura — ADMIN e RECEPTIONIST
    router.get('/',    authMiddleware, tenantMiddleware, ListRoomController);
    router.get('/:id', authMiddleware, tenantMiddleware, GetRoomController);

    // Escrita — ADMIN apenas
    router.post('/',    authMiddleware, tenantMiddleware, requireRole('ADMIN'), CreateRoomController);
    router.put('/:id',  authMiddleware, tenantMiddleware, requireRole('ADMIN'), UpdateRoomController);
    router.delete('/:id', authMiddleware, tenantMiddleware, requireRole('ADMIN'), DeleteRoomController);

    return router;
})();
```

---

## Decisões de Design

| Decisão | Alternativa Descartada | Motivo |
|---------|----------------------|--------|
| `requireRole` como HOF | Um middleware por papel (`adminMiddleware.js`) | DRY: evita arquivos duplicados para cada role |
| Middlewares aplicados por rota | `router.use(authMiddleware)` global | Permite rotas públicas sem exceção manual |
| Ordem: auth → tenant → role | Qualquer outra ordem | `role` depende de `request.user` (injetado por `auth`) |
| `RECEPTIONIST` lê quartos | Restringir leitura a ADMIN | Recepcionista precisa consultar disponibilidade |
| `ADMIN` exclusivo para deleções | Permitir deleção por qualquer role | Operações destrutivas exigem autorização mais alta |

---

**Versão**: 1.0 | **Maio 2026**
