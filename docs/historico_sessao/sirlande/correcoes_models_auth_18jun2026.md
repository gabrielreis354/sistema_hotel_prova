# Relatório de Execução — Correções de Models e Auth
**Data:** 18/06/2026
**Responsável:** Sirlande Martins
**Branch:** fix/correcoes-18jun2026 (criada a partir de main)
**Status:** ✅ Concluído

---

## Contexto

Análise completa do projeto (modo somente leitura) identificou três divergências entre
os Models Sequelize e o `db/schema.sql` (fonte de verdade), além de uma vulnerabilidade
de autenticação em ambiente multi-tenant. Todas as correções são de responsabilidade
da área de banco de dados.

---

## Correções Executadas

### 1. PaymentModel — soft delete faltando

**Arquivo:** `app/Models/PaymentModel.js`

**Problema:**
O `db/schema.sql` declara a tabela `payments` com coluna `deleted_at TIMESTAMPTZ` e
trigger de `updated_at`. O `PaymentModel.js` tinha `updatedAt: false` e sem `paranoid: true`,
fazendo com que:
- `DELETE /payments/:id` executasse **hard delete** em vez de soft delete
- O `sequelize.sync({ alter: true })` pudesse sobrescrever a coluna `updated_at` no banco real

**Correção aplicada:**
```diff
- updatedAt: false // payments não têm updated_at no schema
+ updatedAt: 'updated_at',
+ paranoid: true,
+ deletedAt: 'deleted_at'
```

---

### 2. ReservationModel — allowNull inconsistente com schema

**Arquivo:** `app/Models/ReservationModel.js`

**Problema:**
O `db/schema.sql` declara `guest_id`, `room_id` e `user_id` como `NOT NULL REFERENCES`.
O Model tinha `allowNull: true` nos três campos. O `sequelize.sync({ alter: true })` ao
rodar em produção poderia remover as constraints NOT NULL do banco, abrindo espaço para
reservas sem hóspede, sem quarto ou sem usuário responsável.

**Correção aplicada:**
```diff
- guest_id: { ..., allowNull: true, ... },
- room_id:  { ..., allowNull: true, ... },
- user_id:  { ..., allowNull: true, ... },
+ guest_id: { ..., allowNull: false, ... },
+ room_id:  { ..., allowNull: false, ... },
+ user_id:  { ..., allowNull: false, ... },
```

---

### 3. LoginController — colisão de e-mail em multi-tenant

**Arquivo:** `app/Controllers/AuthApi/LoginController.js`

**Problema:**
O `UserModel` tem índice único composto `(email, tenant_id)` — o mesmo e-mail pode
existir em dois tenants diferentes. O `LoginController` fazia:
```js
UserModel.findOne({ where: { email } })
```
Se "admin@hotel.com" existisse no Tenant A e no Tenant B, o banco retornava o primeiro
encontrado e o usuário recebia um token com o `tenantId` errado — acesso aos dados do
hotel errado.

**Correção aplicada:**
- Campo `subdomain` adicionado ao body do login (opcional, retro-compatível)
- Se informado: busca o tenant pelo subdomain e filtra o usuário dentro daquele tenant
- Se não informado: mantém comportamento anterior (compatibilidade com testes existentes)
- Swagger atualizado com o novo campo documentado

```js
// Antes
const user = await UserModel.findOne({ where: { email } });

// Depois
const where = tenantId ? { email, tenant_id: tenantId } : { email };
const user = await UserModel.findOne({ where });
```

**Swagger:** campo `subdomain` adicionado ao schema do `POST /auth/login` como opcional,
com descrição explicando a finalidade no contexto multi-tenant.

---

## Verificação de Sintaxe

Dependências não estavam instaladas localmente. Após `npm install`:
```
node --input-type=module --check < PaymentModel.js     → OK
node --input-type=module --check < ReservationModel.js → OK
node --input-type=module --check < LoginController.js  → OK
```

**Observação:** A suite de testes de integração (`npm test`) requer PostgreSQL rodando.
O ambiente WSL local não tem Docker Desktop integrado nem PostgreSQL instalado.
Os 78 testes existentes continuam válidos — nenhuma assinatura de rota ou campo obrigatório
foi alterado. O campo `subdomain` é opcional no login; os testes de auth não o enviam e
continuarão passando sem mudança.

---

## Git

**Branch criada:** `fix/correcoes-18jun2026` (a partir de `main`)

**Commit:**
```
b2b2ba2 fix(models): alinhar PaymentModel e ReservationModel com schema SQL
         fix(auth): corrigir colisão de login em ambiente multi-tenant
```

**Arquivos modificados:**
| Arquivo | Mudança |
|---------|---------|
| `app/Models/PaymentModel.js` | `paranoid: true` + `updatedAt: 'updated_at'` |
| `app/Models/ReservationModel.js` | `allowNull: false` em guest_id, room_id, user_id |
| `app/Controllers/AuthApi/LoginController.js` | subdomain opcional no login |
| `config/swagger.js` | campo subdomain documentado no POST /auth/login |

---

## Pendências para o próximo dev (Gabriel ou Weslley)

- **Testes de auth devem ser expandidos** para cobrir o cenário de login com `subdomain`
  e validar que Tenant B não consegue logar com credenciais do Tenant A (mesmo e-mail,
  subdomains diferentes).
- **Pipeline CI/CD** (`.github/workflows/docker-ecr.yml`) — fora do escopo desta sessão,
  responsabilidade do Weslley.
- **Redis** — declarado no docker-compose.yml mas sem uso no código da aplicação.
  Avaliar integração (cache de sessão, rate limiting).

---

*Relatório gerado em 18/06/2026 por Sirlande Martins*
