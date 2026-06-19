# Relatorio Tecnico Completo — Banco de Dados, Infraestrutura e Backend

**Data:** 19/06/2026
**Dev:** Weslley Lucas
**Projeto:** Sistema de Gestao de Hotel — SaaS Multi-Tenant
**Branch:** feature/weslley

---

## 1. Visao Geral do Sistema

O sistema e um **PMS (Property Management System)** para gestao hoteleira, projetado como SaaS multi-tenant. Cada hotel (tenant) opera de forma isolada no mesmo banco de dados, compartilhando a infraestrutura mas com dados completamente segregados.

### Stack Tecnologica

| Camada | Tecnologia | Versao |
|--------|-----------|--------|
| Runtime | Node.js | 24 |
| Framework | Express | 4.19 |
| ORM | Sequelize | 6.37 |
| Banco de dados | PostgreSQL | 17 |
| Cache | Redis | 7 (Alpine) |
| Autenticacao | JWT (jsonwebtoken) | 9.x |
| Hash de senhas | bcryptjs | 2.x |
| Testes | Vitest + Supertest | 4.x / 7.x |
| Documentacao API | Swagger (swagger-jsdoc + swagger-ui-express) | 6.x / 5.x |
| Container | Docker (multi-stage build) | — |
| Orquestracao | Kubernetes | — |
| CI/CD | GitHub Actions | — |
| Modulos | ESM (import/export) | Nativo |

---

## 2. Banco de Dados

### 2.1. Arquitetura do Schema

O banco utiliza **PostgreSQL 17** com as seguintes extensoes:

- `uuid-ossp` — geracao de UUIDs v4 como chaves primarias
- `btree_gist` — suporte a constraint EXCLUDE para prevencao de double booking

### 2.2. Modelo de Dados (8 tabelas)

```
┌──────────────┐
│   tenants    │  Tabela raiz — cada tenant e um hotel
│   (SaaS)     │
└──────┬───────┘
       │ 1:N (tenant_id)
       ├──────────────────────────────────────────────────────┐
       │              │              │             │           │
┌──────▼──────┐ ┌─────▼──────┐ ┌────▼────┐ ┌─────▼────┐ ┌────▼──────┐
│   users     │ │ room_      │ │ guests  │ │ reserva- │ │ payments  │
│             │ │ categories │ │         │ │ tions    │ │           │
└─────────────┘ └─────┬──────┘ └────┬────┘ └──┬───┬──┘ └───────────┘
                      │ 1:N         │ 1:N     │   │
                ┌─────▼──────┐      │         │   │
                │   rooms    │◄─────┼─────────┘   │
                │            │      │         N:N via pivo
                └────────────┘      │     ┌───────▼────────┐
                                    │     │ reservation_   │
                                    │     │ rooms (pivo)   │
                                    │     └────────────────┘
                                    │
                                    └─── guest_id em reservations
```

### 2.3. Tabelas e seus campos

#### tenants (Tabela raiz SaaS)
| Campo | Tipo | Restricao | Descricao |
|-------|------|-----------|-----------|
| id | UUID | PK, default uuid_generate_v4() | Identificador unico |
| name | TEXT | NOT NULL | Nome do hotel |
| subdomain | TEXT | NOT NULL, UNIQUE | Slug para identificacao (ex: hotel-aurora) |
| legal_id | TEXT | — | CNPJ ou documento fiscal |
| status | TEXT | CHECK (ACTIVE, SUSPENDED) | Controle de acesso ao sistema |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |
| updated_at | TIMESTAMPTZ | DEFAULT now(), trigger | Atualizado automaticamente |

#### users (Funcionarios do hotel)
| Campo | Tipo | Restricao | Descricao |
|-------|------|-----------|-----------|
| id | UUID | PK | — |
| tenant_id | UUID | FK → tenants, NOT NULL | Isolamento multi-tenant |
| name | TEXT | NOT NULL | Nome do funcionario |
| email | TEXT | NOT NULL, UNIQUE(tenant_id, email) | Email unico por tenant |
| password_hash | TEXT | NOT NULL | Senha hasheada com bcrypt (salt 10) |
| role | TEXT | CHECK (ADMIN, RECEPTIONIST) | Perfil de acesso |
| deleted_at | TIMESTAMPTZ | — | Soft delete |

#### room_categories (Categorias de quarto)
| Campo | Tipo | Restricao | Descricao |
|-------|------|-----------|-----------|
| id | UUID | PK | — |
| tenant_id | UUID | FK → tenants | — |
| name | TEXT | UNIQUE(tenant_id, name) | Nome unico por tenant (Standard, Suite...) |
| capacity | INTEGER | CHECK (> 0) | Capacidade maxima de hospedes |
| price_per_night | NUMERIC(10,2) | CHECK (>= 0) | Preco base da diaria |
| deleted_at | TIMESTAMPTZ | — | Soft delete |

#### rooms (Quartos fisicos)
| Campo | Tipo | Restricao | Descricao |
|-------|------|-----------|-----------|
| id | UUID | PK | — |
| tenant_id | UUID | FK → tenants | — |
| category_id | UUID | FK → room_categories, ON DELETE RESTRICT | Categoria do quarto |
| number | TEXT | UNIQUE(tenant_id, number) | Numero unico por hotel |
| floor | INTEGER | — | Andar |
| status | TEXT | CHECK (AVAILABLE, OCCUPIED, MAINTENANCE, CLEANING) | Estado atual |
| deleted_at | TIMESTAMPTZ | — | Soft delete |

#### guests (Hospedes)
| Campo | Tipo | Restricao | Descricao |
|-------|------|-----------|-----------|
| id | UUID | PK | — |
| tenant_id | UUID | FK → tenants | — |
| full_name | TEXT | NOT NULL | Nome completo |
| cpf | TEXT | UNIQUE(tenant_id, cpf) | CPF unico por tenant (opcional) |
| phone | TEXT | — | Telefone |
| email | TEXT | UNIQUE(tenant_id, email) | Email unico por tenant |
| deleted_at | TIMESTAMPTZ | — | Soft delete |

#### reservations (Reservas)
| Campo | Tipo | Restricao | Descricao |
|-------|------|-----------|-----------|
| id | UUID | PK | — |
| tenant_id | UUID | FK → tenants | — |
| guest_id | UUID | FK → guests, ON DELETE RESTRICT | Hospede titular |
| room_id | UUID | FK → rooms, ON DELETE RESTRICT | Quarto principal |
| user_id | UUID | FK → users, ON DELETE RESTRICT | Quem criou a reserva |
| check_in_date | DATE | NOT NULL | Data de entrada |
| check_out_date | DATE | NOT NULL, CHECK (> check_in_date) | Data de saida |
| status | TEXT | CHECK (PENDING, CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED) | Estado da reserva |
| total_amount | NUMERIC(12,2) | CHECK (>= 0), calculado server-side | Valor total |
| deleted_at | TIMESTAMPTZ | — | Soft delete |

**Constraint EXCLUDE (anti-double-booking):**
```sql
EXCLUDE USING gist (
    room_id WITH =,
    daterange(check_in_date, check_out_date, '[)') WITH &&
)
```
Impede no nivel do banco que o mesmo quarto tenha reservas com periodos sobrepostos.

#### reservation_rooms (Tabela pivo N:N)
| Campo | Tipo | Restricao | Descricao |
|-------|------|-----------|-----------|
| id | UUID | PK | — |
| reservation_id | UUID | FK → reservations, CASCADE | — |
| room_id | UUID | FK → rooms, CASCADE | — |
| — | — | UNIQUE(reservation_id, room_id) | Impede duplicidade |

Permite que uma reserva tenha multiplos quartos (ex: familia grande reserva 2 quartos).

#### payments (Pagamentos)
| Campo | Tipo | Restricao | Descricao |
|-------|------|-----------|-----------|
| id | UUID | PK | — |
| tenant_id | UUID | FK → tenants | — |
| reservation_id | UUID | FK → reservations, CASCADE | Reserva vinculada |
| amount | NUMERIC(12,2) | CHECK (>= 0) | Valor pago |
| method | TEXT | NOT NULL | PIX, CARTAO_CREDITO, CARTAO_DEBITO, DINHEIRO |
| paid_at | TIMESTAMPTZ | DEFAULT now() | Data do pagamento |
| deleted_at | TIMESTAMPTZ | — | Soft delete |

### 2.4. Indices

| Indice | Tabela | Campos | Proposito |
|--------|--------|--------|-----------|
| idx_reservations_tenant_checkin | reservations | (tenant_id, check_in_date) | Acelerar busca de reservas por periodo |
| idx_rooms_tenant_status | rooms | (tenant_id, status) | Listar quartos disponiveis rapidamente |
| idx_users_tenant_email | users | (tenant_id, email) | Login e busca de usuario por email |
| idx_reservation_rooms_res_id | reservation_rooms | (reservation_id) | JOINs entre reserva e quartos extras |

### 2.5. Triggers

Todas as 8 tabelas possuem trigger `BEFORE UPDATE` que atualiza `updated_at` automaticamente via funcao `trigger_set_timestamp()`. Isso garante auditoria de quando cada registro foi alterado pela ultima vez, sem depender do codigo da aplicacao.

### 2.6. Consultas de Agregacao (KPIs gerenciais)

5 consultas parametrizadas por tenant_id para relatorios:

| # | Consulta | Funcoes SQL | Para que serve |
|---|----------|------------|----------------|
| 1 | Receita total por mes/ano | SUM, COUNT, AVG, date_trunc | Relatorio financeiro mensal |
| 2 | Taxa de ocupacao por data | COUNT, NULLIF, LEFT JOIN | KPI operacional — % quartos ocupados |
| 3 | Ranking de quartos mais reservados | COUNT, GROUP BY, LIMIT | Precificacao e manutencao preventiva |
| 4 | Ticket medio por categoria | AVG, JOIN room_categories | Analise de receita por segmento |
| 5 | Top 10 hospedes recorrentes | COUNT, SUM, MIN, MAX | Programa de fidelidade |

Todas respeitam soft delete (`deleted_at IS NULL`) e isolamento multi-tenant (`tenant_id = $1`).

### 2.7. Seed de dados

Arquivo `seed/seed_hotels.sql` com **165 registros** distribuidos em 2 tenants (Hotel Aurora e Pousada Sol):

| Tabela | Aurora | Sol | Total |
|--------|-------:|----:|------:|
| tenants | — | — | 2 |
| room_categories | 3 | 2 | 5 |
| rooms | 15 | 10 | 25 |
| users | 3 | 2 | 5 |
| guests | 40 | 20 | 60 |
| reservations | 25 | 15 | 40 |
| payments | 18 | 10 | 28 |

Seed e idempotente (pode rodar varias vezes sem duplicar dados).

### 2.8. Conceitos de Banco Aplicados

| Conceito | Onde aparece |
|----------|-------------|
| **Normalizacao (3FN)** | Categorias separadas de quartos, hospedes separados de reservas |
| **Integridade referencial** | FKs com ON DELETE CASCADE/RESTRICT conforme a semantica |
| **UNIQUE composto** | (tenant_id, campo) — unicidade por tenant, nao global |
| **CHECK constraints** | Validacao no nivel do banco (status, valores >= 0, datas) |
| **EXCLUDE constraint** | Anti-double-booking usando btree_gist + daterange |
| **Soft delete** | deleted_at em vez de DELETE fisico — preserva historico |
| **UUID como PK** | Evita colisoes em ambiente distribuido |
| **Triggers** | updated_at automatico em todas as tabelas |
| **Multi-tenancy por coluna** | tenant_id em todas as tabelas, isolamento por query |

---

## 3. Backend

### 3.1. Arquitetura em Camadas

```
Request HTTP
    │
    ▼
┌─────────────────┐
│   Express       │  Roteamento (routes/router.js)
│   Router        │  Define endpoints e associa controllers
└────────┬────────┘
         │
    ▼─────────────▼
┌──────────┐  ┌──────────┐
│ Auth     │  │ Tenant   │  Middlewares de seguranca
│ Middle.  │  │ Middle.  │  - Valida JWT
└────┬─────┘  └────┬─────┘  - Extrai tenantId
     │              │        - Verifica se tenant esta ACTIVE
     ▼──────────────▼
┌─────────────────────┐
│   Controller        │  Logica de negocio
│   (1 por acao)      │  - Validacao de entrada
└────────┬────────────┘  - Regras de negocio
         │               - Respostas HTTP
         ▼
┌─────────────────────┐
│   Sequelize Model   │  Acesso ao banco
│   (1 por entidade)  │  - ORM com validacao
└────────┬────────────┘  - Hooks, scopes
         │
         ▼
┌─────────────────────┐
│   PostgreSQL 17     │  Persistencia
└─────────────────────┘
```

### 3.2. Modulos e Endpoints

#### Auth (publico — sem JWT)
| Metodo | Endpoint | Controller | Descricao |
|--------|----------|-----------|-----------|
| POST | /auth/register | RegisterController | Cria tenant + primeiro usuario ADMIN |
| POST | /auth/login | LoginController | Autentica e retorna JWT (8h) |

#### Users (protegido — JWT obrigatorio)
| Metodo | Endpoint | Controller | Descricao |
|--------|----------|-----------|-----------|
| GET | /users | ListUserController | Lista usuarios do tenant |
| POST | /users | CreateUserController | Cria usuario (ADMIN/RECEPTIONIST) |
| GET | /users/:id | GetUserController | Busca por ID |
| PUT | /users/:id | UpdateUserController | Atualiza usuario |
| DELETE | /users/:id | DeleteUserController | Soft delete |

#### Room Categories (protegido)
| Metodo | Endpoint | Controller | Descricao |
|--------|----------|-----------|-----------|
| GET | /room-categories | ListRoomCategoryController | Lista categorias |
| POST | /room-categories | CreateRoomCategoryController | Cria categoria |
| GET | /room-categories/:id | GetRoomCategoryController | Busca por ID |
| PUT | /room-categories/:id | UpdateRoomCategoryController | Atualiza |
| DELETE | /room-categories/:id | DeleteRoomCategoryController | Soft delete |

#### Rooms (protegido)
| Metodo | Endpoint | Controller | Descricao |
|--------|----------|-----------|-----------|
| GET | /rooms | ListRoomController | Lista quartos |
| POST | /rooms | CreateRoomController | Cria quarto |
| GET | /rooms/available | ListAvailableRoomsController | Quartos sem conflito no periodo |
| GET | /rooms/:id | GetRoomController | Busca por ID |
| PUT | /rooms/:id | UpdateRoomController | Atualiza |
| DELETE | /rooms/:id | DeleteRoomController | Soft delete |

#### Guests (protegido)
| Metodo | Endpoint | Controller | Descricao |
|--------|----------|-----------|-----------|
| GET | /guests | ListGuestController | Lista hospedes |
| POST | /guests | CreateGuestController | Cria hospede |
| GET | /guests/:id | GetGuestController | Busca por ID |
| PUT | /guests/:id | UpdateGuestController | Atualiza |
| DELETE | /guests/:id | DeleteGuestController | Soft delete |

#### Reservations (protegido — maquina de estados)
| Metodo | Endpoint | Controller | Descricao |
|--------|----------|-----------|-----------|
| GET | /reservations | ListReservationController | Lista reservas |
| POST | /reservations | CreateReservationController | Cria reserva (calcula total server-side) |
| GET | /reservations/:id | GetReservationController | Busca com quartos N:N |
| PUT | /reservations/:id | UpdateReservationController | Atualiza (status protegido) |
| DELETE | /reservations/:id | DeleteReservationController | Soft delete (ADMIN) |
| PUT | /reservations/:id/cancel | CancelReservationController | Cancela (PENDING/CONFIRMED) |
| PUT | /reservations/:id/check-in | CheckInController | Check-in + quartos OCCUPIED |
| PUT | /reservations/:id/check-out | CheckOutController | Check-out + quartos CLEANING |
| POST | /reservations/:id/rooms | AddRoomToReservationController | Adiciona quarto extra (N:N) |
| DELETE | /reservations/:id/rooms/:roomId | RemoveRoomFromReservationController | Remove quarto extra |

#### Payments (protegido)
| Metodo | Endpoint | Controller | Descricao |
|--------|----------|-----------|-----------|
| GET | /payments | ListPaymentController | Lista pagamentos |
| POST | /payments | CreatePaymentController | Registra pagamento |
| GET | /payments/:id | GetPaymentController | Busca por ID |
| PUT | /payments/:id | UpdatePaymentController | Atualiza |
| DELETE | /payments/:id | DeletePaymentController | Soft delete |

**Total: 31 endpoints REST**

### 3.3. Maquinas de Estado

#### Reservas
```
PENDING ──────► CONFIRMED ──────► CHECKED_IN ──────► CHECKED_OUT
   │                │                                      │
   │                │                                      │
   ▼                ▼                                      ▼
CANCELLED      CANCELLED                            (estado final)
```

**Regras:**
- Cancelamento so permitido em PENDING ou CONFIRMED (allowlist, nao blocklist — fail-safe)
- Check-in transiciona reserva para CHECKED_IN e quartos para OCCUPIED (transacao atomica)
- Check-out transiciona reserva para CHECKED_OUT e quartos para CLEANING (transacao atomica)
- Status NAO pode ser alterado via PUT /reservations/:id (protegido por design)
- Quartos extras (N:N) tambem mudam de status no check-in/out

#### Quartos
```
AVAILABLE ──► OCCUPIED (via check-in)
OCCUPIED  ──► CLEANING (via check-out)
CLEANING  ──► AVAILABLE (manual pelo admin)
```

### 3.4. Seguranca

| Mecanismo | Implementacao | Arquivo |
|-----------|--------------|---------|
| **Autenticacao JWT** | Token Bearer com payload {userId, role, tenantId}, expira em 8h | middlewares/auth.middleware.js |
| **Isolamento multi-tenant** | Toda query filtra por tenant_id extraido do JWT | Todos os controllers |
| **Verificacao de tenant ativo** | Middleware verifica se tenant.status == ACTIVE | middlewares/tenant.middleware.js |
| **Hash de senha** | bcrypt com salt factor 10 | RegisterController.js |
| **Controle de acesso** | roleMiddleware verifica se usuario tem role necessaria | middlewares/role.middleware.js |
| **Validacao de entrada** | Validacao manual em cada controller (campos obrigatorios) | Cada controller |
| **Protecao de status** | UpdateReservationController nao permite alterar status via PUT | UpdateReservationController.js |
| **Allowlist (fail-safe)** | CancelController usa CANCELLABLE_STATUSES (nao blocklist) | CancelReservationController.js |

### 3.5. Transacoes Sequelize

Check-in e check-out atualizam 2+ tabelas simultaneamente (reserva + quartos). Para garantir consistencia, usam `sequelize.transaction()`:

```
Check-in (transacao atomica):
1. reservation.status = CHECKED_IN
2. room.status = OCCUPIED
3. quartos extras (N:N) → OCCUPIED
Se qualquer passo falhar → ROLLBACK de tudo
```

### 3.6. Calculo de total_amount (server-side)

O valor da reserva e calculado pelo servidor, nunca aceito do cliente:

```
total_amount = price_per_night × numero_de_noites
numero_de_noites = Math.ceil((check_out - check_in) / (1000 × 60 × 60 × 24))
```

Isso previne fraude onde o cliente enviaria um valor menor no body da request.

### 3.7. Prevencao de Double Booking (dupla camada)

| Camada | Mecanismo | Arquivo |
|--------|-----------|---------|
| **Aplicacao** | checkReservationConflict() — busca reservas sobrepostas antes de criar | app/utils/checkReservationConflict.js |
| **Banco** | EXCLUDE USING gist — constraint no PostgreSQL que impede overlap | db/schema.sql (tabela reservations) |

A dupla camada garante que mesmo em condicoes de concorrencia (2 requests simultaneas), o banco rejeita a segunda.

### 3.8. Testes Automatizados

Suite com **78 testes de integracao** usando banco real (nao mocks):

| Arquivo | Testes | Cobertura |
|---------|--------|-----------|
| auth.test.js | 12 | Register, login, JWT, multi-tenant login |
| room-categories.test.js | 7 | CRUD completo + 404 |
| rooms.test.js | 12 | CRUD + /available (filtros de data) |
| guests.test.js | 9 | CRUD + CPF unico por tenant |
| reservations.test.js | 20 | State machine completa, total_amount, extras, conflitos |
| payments.test.js | 7 | CRUD + 404 + DELETE |
| tenant-isolation.test.js | 13 | Dados de tenant A invisiveis para tenant B |

### 3.9. Documentacao da API

Swagger UI disponivel em `/api-docs` com documentacao de todos os 31 endpoints, schemas, exemplos de request/response e autenticacao Bearer.

### 3.10. Conceitos de Backend Aplicados

| Conceito | Onde aparece |
|----------|-------------|
| **REST** | Endpoints seguem convencoes HTTP (GET lista, POST cria, PUT atualiza, DELETE remove) |
| **MVC simplificado** | Model (Sequelize) + Controller (logica) + Routes (roteamento) |
| **Separation of Concerns** | 1 controller por acao, middlewares isolados, utils compartilhados |
| **DRY** | checkReservationConflict() reutilizado em create e update |
| **Fail-safe (allowlist)** | Cancelamento usa lista de estados permitidos, nao bloqueados |
| **Transacoes ACID** | Check-in/out usam sequelize.transaction() para atomicidade |
| **Soft delete** | deleted_at em vez de DELETE fisico |
| **ESM** | import/export nativo, nunca require() |
| **Singleton** | Conexao Sequelize instanciada uma unica vez |
| **State machine** | Transicoes de status controladas por endpoints dedicados |

---

## 4. Infraestrutura

### 4.1. Docker (Ambiente de Desenvolvimento)

#### Dockerfile (Multi-stage build)

```
Stage 1 (deps):     node:24-alpine → npm ci --omit=dev → so dependencias de producao
Stage 2 (runner):   node:24-alpine → COPY node_modules + codigo → USER node → HEALTHCHECK
```

| Conceito | Implementacao |
|----------|--------------|
| Multi-stage build | 2 stages — imagem final sem ferramentas de build |
| Non-root | USER node — container nao roda como root |
| Healthcheck | Verifica /health a cada 10s com start_period de 15s |
| .dockerignore | Exclui tests/, docs/, k8s/, .env, .git/ da imagem |

#### Docker Compose (4 servicos)

```
┌──────────────────────────────────────────────────┐
│                 hotel_network (bridge)            │
│                                                  │
│  Postgres (:5432)  ──┐                           │
│  healthcheck:        ├──► Node.js (:3000) ──► Nginx (:80)
│  pg_isready          │    healthcheck:        healthcheck:
│                      │    /health             depende de Node
│  Redis (:6379) ──────┘    JWT_SECRET: obrig.                  │
│  healthcheck:             depends_on:                         │
│  redis-cli ping           postgres: healthy                   │
│                           redis: healthy                      │
└──────────────────────────────────────────────────┘
                                    │
                              porta 80 exposta
                              (unico ponto de entrada)
```

| Conceito | Implementacao |
|----------|--------------|
| Service dependency com health | depends_on + condition: service_healthy |
| Network isolation | Somente Nginx expoe porta; Node, Postgres, Redis sao internos |
| Reverse proxy | Nginx como unico ponto de entrada |
| Variavel obrigatoria | JWT_SECRET com ${VAR:?msg} — Compose aborta sem valor |
| Volumes nomeados | postgres_data e redis_data persistem entre restarts |
| Healthchecks | Todos os 4 servicos verificam saude periodicamente |

#### Nginx (Docker Compose)

| Configuracao | Valor | Proposito |
|-------------|-------|-----------|
| X-Frame-Options | SAMEORIGIN | Anti-clickjacking |
| X-Content-Type-Options | nosniff | Anti-MIME sniffing |
| X-XSS-Protection | 1; mode=block | Filtro XSS do navegador |
| Referrer-Policy | strict-origin-when-cross-origin | Nao vazar URL completa |
| client_max_body_size | 10m | Limitar tamanho de upload |
| Rate limiting /auth/login | 5r/m, burst=3, nodelay | Anti-brute-force |

### 4.2. Kubernetes (Ambiente de Producao)

#### Visao geral do cluster

```
┌───────────────────────── Namespace: hotel-system ─────────────────────────┐
│                                                                           │
│  LoadBalancer (:80)                                                       │
│       │                                                                   │
│       ▼                                                                   │
│  ┌─────────┐  NetworkPolicy   ┌──────────┐  NetworkPolicy  ┌──────────┐ │
│  │  Nginx  │ ──────────────►  │ Backend  │ ─────────────►  │ Postgres │ │
│  │ Deploy  │  so nginx→back   │ Deploy   │  so back→pg     │ Stateful │ │
│  │ 1 rep   │                  │ 3 reps   │                  │ Set      │ │
│  │         │                  │ PDB: ≥2  │                  │ 1 rep    │ │
│  └─────────┘                  └────┬─────┘                  └────┬─────┘ │
│                                    │                              │       │
│                                    │ NetworkPolicy                │ PVC   │
│                                    │ so back→redis                │ 1Gi   │
│                                    ▼                              ▼       │
│                               ┌──────────┐              ┌────────────┐   │
│                               │  Redis   │              │ postgres-  │   │
│                               │ Deploy   │              │ data (PV)  │   │
│                               │ Recreate │              └────────────┘   │
│                               │ PVC 512Mi│                                │
│                               └──────────┘                                │
│                                                                           │
│  ConfigMap: hotel-config         Secret: hotel-secret                     │
│  (NODE_ENV, POSTGRES_HOST...)    (POSTGRES_PASSWORD, JWT_SECRET)          │
└───────────────────────────────────────────────────────────────────────────┘
```

#### Manifests Kubernetes (9 arquivos)

| Arquivo | Recurso | Proposito |
|---------|---------|-----------|
| namespace.yaml | Namespace | Isola todos os recursos em `hotel-system` |
| configmap.yaml | ConfigMap | Variaveis nao-sensiveis (NODE_ENV, POSTGRES_HOST, REDIS_URL) |
| secret.yaml | Secret | Senhas com placeholder (TROCAR_ANTES_DE_APLICAR) |
| postgres.yaml | StatefulSet + PVC + Service | Banco com identidade estavel e volume persistente |
| redis.yaml | Deployment + PVC + Service | Cache com persistencia AOF e strategy Recreate |
| backend.yaml | Deployment + Service | API com 3 replicas, probes, resource limits |
| nginx.yaml | ConfigMap + Deployment + Service (LB) | Proxy reverso com headers de seguranca e rate limiting |
| pdb.yaml | PodDisruptionBudget | Garante minimo 2 pods backend durante manutencao |
| networkpolicy.yaml | 3 NetworkPolicies | Segmentacao de rede (menor privilegio) |

#### Conceitos Kubernetes aplicados

| Conceito | Recurso | Descricao |
|----------|---------|-----------|
| **StatefulSet** | Postgres | Identidade estavel (postgres-0), reatacha PVC no restart |
| **PersistentVolumeClaim** | Postgres (1Gi) + Redis (512Mi) | Dados sobrevivem ao restart do pod |
| **Deployment** | Backend, Redis, Nginx | Pods stateless (backend) ou com PVC (Redis) |
| **Probes (readiness + liveness)** | Todos | readiness: remove do Service / liveness: reinicia pod |
| **Resource requests/limits** | Todos | Garante recursos minimos e previne OOMKill em cascata |
| **PodDisruptionBudget** | Backend (min 2) | Zero downtime durante drain de no |
| **NetworkPolicy** | Postgres, Redis, Backend | Firewall L4 — cada servico so aceita trafego autorizado |
| **ConfigMap** | hotel-config, nginx-config | Configuracao externalizada (nao hardcoded no container) |
| **Secret** | hotel-secret | Credenciais separadas do ConfigMap (acesso restrito) |
| **Namespace** | hotel-system | Isolamento logico dos recursos no cluster |
| **Strategy: Recreate** | Redis | Mata pod antigo antes de criar novo (evita conflito de PVC) |
| **LoadBalancer** | Nginx Service | Ponto de entrada unico com IP externo |
| **Kustomize** | kustomization.yaml | Gerencia todos os manifests com `kubectl apply -k k8s/` |

### 4.3. CI/CD (GitHub Actions)

Pipeline em `.github/workflows/docker-ecr.yml` (pendente push — token sem scope workflow):

```
Push/PR para main
       │
       ▼
┌──────────────────────────┐
│  Job: test               │
│  - PostgreSQL 17 service │
│  - npm ci                │
│  - npm test (78 testes)  │
│  ❌ Falhou? → PARA TUDO  │
└──────────┬───────────────┘
           │ ✅ Passou
           ▼
┌──────────────────────────┐
│  Job: build-and-push     │  (so em push, nao em PR)
│  needs: test             │  ← Quality Gate
│  - Login AWS ECR         │
│  - docker build          │
│  - docker push :sha      │
│  - docker push :latest   │
└──────────────────────────┘
```

| Conceito | Implementacao |
|----------|--------------|
| **Quality Gate** | `needs: test` — build so roda se testes passarem |
| **Service Container** | PostgreSQL 17 como service do GitHub Actions para testes |
| **Separation of Jobs** | test e build-and-push sao jobs independentes |
| **Immutable tags** | Imagem taggeada com SHA do commit (versionamento imutavel) |
| **Trigger seletivo** | PR roda so testes; push roda testes + build |

### 4.4. Seguranca de Infraestrutura

| Camada | Protecao | Conceito |
|--------|----------|----------|
| Nginx | Headers de seguranca (X-Frame-Options, etc.) | OWASP Security Headers |
| Nginx | Rate limiting /auth/login (5r/m) | Anti-brute-force |
| Docker | USER node (non-root) | Principio do menor privilegio |
| Docker | JWT_SECRET obrigatorio (${VAR:?}) | Fail-fast |
| Docker | .dockerignore exclui .env e secrets | Prevencao de vazamento |
| K8s | NetworkPolicy (3 regras) | Segmentacao de rede |
| K8s | Secrets com placeholders | Nao commitar senhas reais |
| K8s | Resource limits | Prevencao de OOMKill em cascata |
| CI/CD | Secrets via GitHub Secrets | Credenciais AWS nao ficam no codigo |

### 4.5. Consistencia entre ambientes

| Aspecto | Docker Compose (dev) | Kubernetes (prod) |
|---------|---------------------|-------------------|
| Headers de seguranca | ✅ default.conf | ✅ nginx ConfigMap |
| Rate limiting | ✅ 5r/m /auth/login | ✅ 5r/m /auth/login |
| Healthchecks | ✅ Todos os servicos | ✅ Probes em todos os pods |
| Persistencia | ✅ Volumes nomeados | ✅ PVC |
| Network isolation | ✅ So Nginx expoe porta | ✅ NetworkPolicy |

---

## 5. Resumo de Conceitos por Area

### Banco de Dados
1. Normalizacao (3FN)
2. Integridade referencial (FK com CASCADE/RESTRICT)
3. UNIQUE composto (multi-tenant)
4. CHECK constraints
5. EXCLUDE constraint (anti-double-booking com btree_gist)
6. Soft delete (deleted_at)
7. UUID como PK
8. Triggers (updated_at automatico)
9. Multi-tenancy por coluna
10. Indices compostos para performance
11. Consultas de agregacao (SUM, AVG, COUNT, GROUP BY, date_trunc)
12. Seed idempotente (ON CONFLICT DO NOTHING)

### Backend
1. REST API (convencoes HTTP)
2. MVC simplificado
3. Separation of Concerns
4. DRY (utils compartilhados)
5. Fail-safe (allowlist de estados)
6. Transacoes ACID (sequelize.transaction)
7. Calculo server-side (total_amount)
8. State machine (reservas e quartos)
9. JWT + middlewares de autenticacao
10. Isolamento multi-tenant por query
11. Testes de integracao com banco real
12. Documentacao Swagger

### Infraestrutura
1. Multi-stage build (Docker)
2. Container non-root
3. Healthchecks (Docker + K8s probes)
4. Reverse proxy (Nginx)
5. Rate limiting
6. Security headers (OWASP)
7. StatefulSet (dados persistentes)
8. PersistentVolumeClaim
9. NetworkPolicy (segmentacao de rede)
10. PodDisruptionBudget (zero downtime)
11. Resource limits (prevencao de cascata)
12. Quality Gate (CI/CD)
13. Service containers (CI)
14. Consistencia dev/prod
15. Secrets management (placeholders + GitHub Secrets)

---

*Relatorio gerado em 19/06/2026 por Weslley Lucas.*
