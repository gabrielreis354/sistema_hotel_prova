# Arquitetura do Backend (JavaScript ESModules)

## Stack Tecnológica

| Tecnologia | Papel |
|------------|-------|
| Node.js + Express | Servidor HTTP (API REST) |
| JavaScript (ESModules) | Lógica e sintaxe moderna (`import`/`export`) |
| Sequelize ORM | Integração com o Banco de Dados Relacional |
| PostgreSQL | Banco de dados principal |
| JWT + bcryptjs | Autenticação e criptografia de senhas |
| Kubernetes | Infraestrutura principal (manifests em `k8s/`) |

---

## Estrutura de Pastas (Padrão MVC Acadêmico)

O backend vive na **raiz do repositório** — não existe uma subpasta `backend/`. Isso espelha diretamente o projeto de referência de sala de aula (`unifaat-2026-dw-project`), onde `_web.js`, `app/`, `routes/`, `database/` e `bootstrap/` ficam todos na raiz.

> **Nota sobre o projeto de referência:** ele serve como guia de *padrões de código* (estrutura de pastas, estilo de controller, model com Sequelize, paginação). O domínio — entidades, regras de negócio, multi-tenant — é específico do CorePMS e não deve ser copiado do projeto de sala.

```
sistema_gestao_hotel/           ← raiz do repositório
├── app/
│   ├── Controllers/             ← Single-Action Controllers (um por arquivo)
│   │   ├── AuthApi/
│   │   │   ├── LoginController.js
│   │   │   └── RegisterController.js
│   │   ├── RoomApi/
│   │   │   ├── CreateRoomController.js
│   │   │   ├── ListRoomController.js
│   │   │   ├── GetRoomController.js
│   │   │   ├── UpdateRoomController.js
│   │   │   └── DeleteRoomController.js
│   │   ├── GuestApi/
│   │   ├── ReservationApi/
│   │   └── PaymentApi/
│   └── Models/                  ← Definição dos Models do Sequelize (tabelas)
│       ├── TenantModel.js
│       ├── UserModel.js
│       ├── RoomCategoryModel.js
│       ├── RoomModel.js
│       ├── GuestModel.js
│       ├── ReservationModel.js
│       ├── ReservationRoomModel.js
│       └── PaymentModel.js
│
├── database/
│   ├── connections/
│   │   └── sequelize.js         ← Instância IIFE do Sequelize (singleton)
│   └── relations.js             ← Configuração central de relacionamentos (FKs)
│
├── routes/
│   ├── apis/                    ← Roteadores por domínio (IIFE)
│   │   ├── authRouter.js
│   │   ├── userRouter.js
│   │   ├── roomRouter.js
│   │   ├── guestRouter.js
│   │   └── reservationRouter.js
│   └── router.js                ← Roteador principal (aplica express.json() aqui)
│
├── bootstrap/
│   ├── app.js                   ← Inicializador (dotenv.config + initRelations)
│   └── config.js                ← Constantes globais (ex: CONSTANTS.DIR)
│
├── middlewares/                 ← Middlewares de Auth, Tenant e RBAC
│   ├── auth.middleware.js
│   ├── tenant.middleware.js
│   └── role.middleware.js
│
├── docs/                        ← Documentação do projeto
├── db/                          ← Schema SQL de referência
├── scripts/                     ← DDL executável (setup.sql)
├── seed/                        ← Dados de desenvolvimento
├── modelagem/                   ← DER e diagrama lógico
│
├── _web.js                      ← Entrypoint do Express (listen na porta)
├── package.json                 ← "type": "module" + dependências
├── k8s/                         ← Manifests Kubernetes (ambiente principal)
├── docker-compose.yml           ← Alternativo — usado somente para testes automatizados
├── .env                         ← Variáveis de ambiente para uso com Docker Compose (não commitado)
└── .env.example                 ← Template de variáveis para uso com Docker Compose
```

---

## Padrões por Camada (Responsabilidades)

### Controller — Single-Action

Cada controller é uma **função `async` exportada por padrão** (Single-Action Controller, um arquivo por operação). Responsabilidades:

1. Extrair parâmetros de `request.body`, `request.params` ou `request.query`
2. Validar campos obrigatórios (acumula erros em array)
3. Chamar o Model para a consulta no banco
4. Retornar resposta JSON com o status HTTP correto

```javascript
// app/Controllers/RoomApi/CreateRoomController.js
import RoomModel from "../../Models/RoomModel.js";

export default async function CreateRoomController(request, response) {
    try {
        const { number, category_id } = request.body;

        const error = [];
        if (!number)      error.push("number obrigatório!");
        if (!category_id) error.push("category_id obrigatório!");
        if (error.length > 0) return response.status(400).json({ error });

        const room = await RoomModel.create({
            tenant_id:   request.user.tenantId, // extraído do JWT pelo authMiddleware
            number:      number,
            category_id: category_id
        });

        return response.status(201).json(room);
    } catch (error) {
        console.error(error);
        if (error.name === "SequelizeUniqueConstraintError") {
            return response.status(409).json({ error: error.errors[0].message });
        }
        return response.status(500).json({ error: "Internal server error" });
    }
}
```

**Padrão de atualização** — usa instância + `save()`, não `Model.update()`:
```javascript
const room = await RoomModel.findByPk(id);
if (!room) return response.status(404).json({ error: "Room not found" });

room.status = status;
await room.save();

return response.json(room);
```

**Padrão de deleção** — soft delete via `destroy()` (Sequelize `paranoid: true` preenche `deleted_at`):
```javascript
await room.destroy(); // preenche deleted_at, não remove a linha
return response.status(204).send();
```

---

### Controller — Listagem

Endpoints de listagem usam `findAll` com filtro obrigatório de `tenant_id` e retornam a lista diretamente como array JSON. Não há paginação implementada nesta fase do projeto.

```javascript
// app/Controllers/RoomApi/ListRoomController.js
export default async function ListRoomController(request, response) {
    try {
        const tenantId = request.user.tenantId; // extraído do JWT pelo authMiddleware
        const rooms = await RoomModel.findAll({
            where: { tenant_id: tenantId },
            include: [{ model: RoomCategoryModel, as: 'category', attributes: ['id', 'name', 'price_per_night'] }]
        });
        return response.json(rooms);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
```

---

### Model — `sequelize.define()`

Cada model usa `sequelize.define()` com:
- UUID como PK (diferença do projeto de referência que usa INTEGER — nosso projeto usa UUID por ser multi-tenant SaaS)
- `references` para FKs (informa ao Sequelize a tabela/coluna referenciada)
- `field` nos campos cujo nome JS (camelCase) difere do nome físico no banco (snake_case)
- `timestamps: true` + `createdAt: 'created_at'` + `updatedAt: 'updated_at'` nos options da tabela
- `paranoid: true` + `deletedAt: 'deleted_at'` nas tabelas com soft delete

```javascript
// app/Models/RoomModel.js
import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const RoomModel = sequelize.define(
    'RoomModel',
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
        category_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'room_categories', key: 'id' }
        },
        number: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        status: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: 'AVAILABLE'
        }
    },
    {
        tableName:  'rooms',
        timestamps: true,
        createdAt:  'created_at',
        updatedAt:  'updated_at',
        paranoid:   true,          // soft delete: preenche deleted_at em vez de remover
        deletedAt:  'deleted_at'
    }
);

export default RoomModel;
```

---

### Relations — `database/relations.js`

Arquivo centraliza todas as associações Sequelize. Exporta função `initRelations()` chamada em `bootstrap/app.js`:

```javascript
// database/relations.js
import TenantModel      from "../app/Models/TenantModel.js";
import UserModel        from "../app/Models/UserModel.js";
import RoomModel        from "../app/Models/RoomModel.js";
import ReservationModel from "../app/Models/ReservationModel.js";

export default function initRelations() {
    TenantModel.hasMany(UserModel, { foreignKey: "tenant_id", as: "users" });
    UserModel.belongsTo(TenantModel, { foreignKey: "tenant_id", as: "tenant" });

    TenantModel.hasMany(RoomModel, { foreignKey: "tenant_id", as: "rooms" });
    RoomModel.belongsTo(TenantModel, { foreignKey: "tenant_id", as: "tenant" });

    // ... demais associações
}
```

---

### Middlewares

Os middlewares ficam em `middlewares/` e são aplicados **por rota** diretamente no router, não globalmente.

| Middleware | Arquivo | Responsabilidade |
|-----------|---------|------------------|
| Auth | `auth.middleware.js` | Valida JWT → injeta `request.user = { userId, role, tenantId }` |
| Tenant | `tenant.middleware.js` | Verifica tenant `ACTIVE` (disponível mas não aplicado nas rotas — veja nota) |
| Role | `role.middleware.js` | Controla acesso por papel via `requireRole(...roles)` (HOF) |

Cadeia de execução em rotas protegidas:

```
Request
  └── authMiddleware       ← verifica JWT, injeta request.user (inclui tenantId)
        └── requireRole    ← verifica request.user.role (somente em rotas restritas a ADMIN)
              └── Controller
```

> **Nota sobre `tenantMiddleware`:** o arquivo existe e verifica se o tenant está ativo (`status = ACTIVE`). No entanto, ele não está aplicado nas rotas atualmente — os controllers extraem `tenantId` diretamente de `request.user.tenantId` (injetado pelo `authMiddleware`). Isso significa que tenants suspensos ainda conseguem autenticar, embora o JWT seja válido pelo tempo de expiração. Isso é uma melhoria futura.

> Rotas públicas (`POST /auth/login`, `POST /auth/register`) **não** aplicam nenhum middleware.

Para o código de cada middleware e a tabela de permissões por rota — veja [docs/back/MIDDLEWARES.md](MIDDLEWARES.md).

---

### Router — IIFE por domínio

Cada roteador de domínio em `routes/apis/` é uma **IIFE** que retorna o `Router`. O `express.json()` é aplicado **uma única vez** no `routes/router.js` principal, não em cada sub-roteador:

```javascript
// routes/apis/roomRouter.js
import { Router } from 'express';
import authMiddleware  from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import ListRoomController   from '../../app/Controllers/RoomApi/ListRoomController.js';
import CreateRoomController from '../../app/Controllers/RoomApi/CreateRoomController.js';

export default (() => {
    const router = Router();

    router.get('/',  authMiddleware, ListRoomController);
    router.post('/', authMiddleware, requireRole('ADMIN'), CreateRoomController);
    // ...

    return router;
})();
```

```javascript
// routes/router.js
import express   from 'express';
import { Router } from 'express';
import roomRouter from './apis/roomRouter.js';

const router = Router();

router.use(express.json()); // ← único ponto de aplicação do body parser

router.use('/rooms', roomRouter);
// ...

export default router;
```

---

## Fundação Multi-Tenant (Isolamento de Dados)

O sistema é estruturado como um SaaS Multi-Tenant desde a base. Cada hotel ou pousada cadastrada corresponde a um registro na tabela `tenants`. 

Todas as entidades principais possuem uma coluna `tenant_id`. O isolamento é garantido através do cabeçalho de autenticação JWT, contendo o payload `{ userId, role, tenantId }`:

1. **Extração do Tenant**: O `authMiddleware` decodifica o JWT e injeta `request.user = { userId, role, tenantId }`. Os controllers extraem o tenant a partir de `request.user.tenantId`.
2. **Criação de Registros**: O `tenant_id` vem de `request.user.tenantId`:
   ```javascript
   const room = await RoomModel.create({
       tenant_id: request.user.tenantId, // extraído do JWT pelo authMiddleware
       number: number,
       category_id: category_id
   });
   ```
3. **Leitura/Atualização/Deleção**: Todas as consultas filtram por `tenant_id` para impedir que um hotel acesse dados de outro:
   ```javascript
   const tenantId = request.user.tenantId;
   const rooms = await RoomModel.findAll({
       where: { tenant_id: tenantId }
   });
   ```

---

## Formato Padrão de Resposta HTTP

A API REST utiliza os códigos de status nativos do protocolo HTTP para expressar resultados:

* **`200 OK`**: Sucesso para consultas de leitura simples (GET por ID) e atualizações.
* **`200 OK` (listagem)**: Retorna array JSON direto com os registros do tenant.
* **`201 Created`**: Sucesso na criação de novos registros. Retorna o objeto criado.
* **`204 No Content`**: Sucesso para deleções (soft delete via `destroy()`).
* **`400 Bad Request`**: Parâmetros inválidos ou campos obrigatórios ausentes. Retorna array: `{ error: ["campo obrigatório!"] }`.
* **`401 Unauthorized`**: JWT ausente ou inválido.
* **`403 Forbidden`**: Role do usuário logado não possui privilégios para a rota (ex: recepcionista cadastrando quarto).
* **`404 Not Found`**: Registro não encontrado. Retorna `{ error: "X not found" }`.
* **`409 Conflict`**: Violação de chave única (ex: número de quarto duplicado no mesmo tenant). Retorna `{ error: error.errors[0].message }`.
* **`500 Internal Server Error`**: Erros inesperados. Retorna `{ error: "Internal server error" }`.

---

**Versão**: 3.0 (JS ESModules - MVC Acadêmico) | **Maio 2026**