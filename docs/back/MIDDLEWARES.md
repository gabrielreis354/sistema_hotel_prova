# Middlewares — CorePMS SaaS Multi-Tenant

## Visão Geral

O sistema tem três middlewares de proteção. Cada middleware tem uma responsabilidade única (SRP) e é aplicado **por rota** no router, nunca globalmente.

| Middleware | Arquivo | Responsabilidade | Aplicado nas rotas? |
|-----------|---------|-----------------|---|
| Auth | `auth.middleware.js` | Valida JWT → injeta `request.user = { userId, role, tenantId }` | **Sim** — em todas as rotas protegidas |
| Role | `role.middleware.js` | Controla acesso por papel via `requireRole(...roles)` | **Sim** — em rotas restritas a ADMIN |
| Tenant | `tenant.middleware.js` | Verifica tenant `ACTIVE` → injeta `request.tenantId` | **Não** — existe mas não está aplicado nas rotas |

---

## Cadeia de Execução Real

```
Request
  └── authMiddleware       ← verifica JWT, injeta request.user = { userId, role, tenantId }
        └── requireRole    ← verifica request.user.role (somente em rotas restritas a ADMIN)
              └── Controller
```

**Rotas públicas** (`POST /auth/login`, `POST /auth/register`) não aplicam nenhum middleware.

### Sobre o `tenantMiddleware`

O `tenantMiddleware` faz uma verificação adicional de segurança: confirma no banco que o tenant do JWT existe e está com status `ACTIVE`. Porém, **ele não está aplicado nas rotas**. Os controllers extraem o `tenantId` diretamente de `request.user.tenantId` (payload do JWT, injetado pelo `authMiddleware`).

Consequência: um token JWT emitido para um tenant que foi posteriormente suspenso continuará válido até expirar (8 horas). Aplicar `tenantMiddleware` nas rotas resolveria isso — é uma melhoria identificada para versão futura.

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

> **Legenda:** `auth ✓` = `authMiddleware` aplicado | `role` = `requireRole(...)` aplicado | `—` = rota pública ou sem restrição de role

| Domínio | Endpoint | auth | requireRole |
|---------|----------|------|-------------|
| **Auth** | `POST /auth/login` | — | — |
| **Auth** | `POST /auth/register` | — | — |
| **Users** | `GET /users` | ✓ | `ADMIN` |
| **Users** | `GET /users/:id` | ✓ | `ADMIN` |
| **Users** | `POST /users` | ✓ | `ADMIN` |
| **Users** | `PUT /users/:id` | ✓ | `ADMIN` |
| **Users** | `DELETE /users/:id` | ✓ | `ADMIN` |
| **Room Categories** | `GET /room-categories` | ✓ | — |
| **Room Categories** | `GET /room-categories/:id` | ✓ | — |
| **Room Categories** | `POST /room-categories` | ✓ | `ADMIN` |
| **Room Categories** | `PUT /room-categories/:id` | ✓ | `ADMIN` |
| **Room Categories** | `DELETE /room-categories/:id` | ✓ | `ADMIN` |
| **Rooms** | `GET /rooms/available` | ✓ | — |
| **Rooms** | `GET /rooms` | ✓ | — |
| **Rooms** | `GET /rooms/:id` | ✓ | — |
| **Rooms** | `POST /rooms` | ✓ | `ADMIN` |
| **Rooms** | `PUT /rooms/:id` | ✓ | `ADMIN` |
| **Rooms** | `DELETE /rooms/:id` | ✓ | `ADMIN` |
| **Guests** | `GET /guests` | ✓ | — |
| **Guests** | `GET /guests/:id` | ✓ | — |
| **Guests** | `POST /guests` | ✓ | — |
| **Guests** | `PUT /guests/:id` | ✓ | — |
| **Guests** | `DELETE /guests/:id` | ✓ | `ADMIN` |
| **Reservations** | `GET /reservations` | ✓ | — |
| **Reservations** | `GET /reservations/:id` | ✓ | — |
| **Reservations** | `POST /reservations` | ✓ | — |
| **Reservations** | `PUT /reservations/:id` | ✓ | — |
| **Reservations** | `PUT /reservations/:id/check-in` | ✓ | — |
| **Reservations** | `PUT /reservations/:id/check-out` | ✓ | — |
| **Reservations** | `PUT /reservations/:id/cancel` | ✓ | — |
| **Reservations** | `DELETE /reservations/:id` | ✓ | `ADMIN` |
| **Reservations** | `POST /reservations/:id/rooms` | ✓ | — |
| **Reservations** | `DELETE /reservations/:id/rooms/:roomId` | ✓ | — |
| **Payments** | `GET /payments` | ✓ | — |
| **Payments** | `GET /payments/:id` | ✓ | — |
| **Payments** | `POST /payments` | ✓ | — |
| **Payments** | `PUT /payments/:id` | ✓ | — |
| **Payments** | `DELETE /payments/:id` | ✓ | `ADMIN` |

---

## Exemplo de Router com Cadeia Real

```javascript
// routes/apis/roomRouter.js  (implementação real)
import { Router } from 'express';
import authMiddleware  from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import ListAvailableRoomsController from '../../app/Controllers/RoomApi/ListAvailableRoomsController.js';
import ListRoomController   from '../../app/Controllers/RoomApi/ListRoomController.js';
import GetRoomController    from '../../app/Controllers/RoomApi/GetRoomController.js';
import CreateRoomController from '../../app/Controllers/RoomApi/CreateRoomController.js';
import UpdateRoomController from '../../app/Controllers/RoomApi/UpdateRoomController.js';
import DeleteRoomController from '../../app/Controllers/RoomApi/DeleteRoomController.js';

export default (() => {
    const router = Router();

    // /available antes de /:id para não ser capturado como parâmetro
    router.get('/available', authMiddleware, ListAvailableRoomsController);

    // Leitura — qualquer usuário autenticado
    router.get('/',    authMiddleware, ListRoomController);
    router.get('/:id', authMiddleware, GetRoomController);

    // Escrita — somente ADMIN
    router.post('/',      authMiddleware, requireRole('ADMIN'), CreateRoomController);
    router.put('/:id',    authMiddleware, requireRole('ADMIN'), UpdateRoomController);
    router.delete('/:id', authMiddleware, requireRole('ADMIN'), DeleteRoomController);

    return router;
})();
```

---

## Decisões de Design

| Decisão | Alternativa Descartada | Motivo |
|---------|----------------------|--------|
| `requireRole` como HOF | Um middleware por papel (`adminMiddleware.js`) | DRY: evita arquivos duplicados para cada role |
| Middlewares aplicados por rota | `router.use(authMiddleware)` global | Permite rotas públicas sem exceção manual |
| Ordem: auth → requireRole | Qualquer outra ordem | `requireRole` depende de `request.user` (injetado por `auth`) |
| `tenantId` extraído de `request.user` | Aplicar `tenantMiddleware` em cada rota | Simplicidade: JWT já carrega o `tenantId` verificado na emissão |
| `RECEPTIONIST` lê quartos/reservas/hóspedes | Restringir leitura a ADMIN | Recepcionista precisa operar o PMS diariamente |
| `ADMIN` exclusivo para deleções e criação de usuários | Permitir por qualquer role | Operações destrutivas e estruturais exigem autorização mais alta |

---

**Versão**: 1.0 | **Maio 2026**
