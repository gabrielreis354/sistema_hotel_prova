# Banco de Dados

## Banco Escolhido

PostgreSQL.

## ORM Escolhido

Sequelize ORM.

---

# Entidades (Modelagem Normalizada)

Para garantir integridade, redução de redundância e adequação às Formas Normais (1FN, 2FN, 3FN), a estrutura do banco de dados está normalizada da seguinte maneira:

### 0. Tenant
Representa cada hotel cliente do SaaS. Todas as entidades operacionais referenciam `tenant_id` para isolamento de dados.
- `id`: UUID (Primary Key)
- `name`: String
- `subdomain`: String (Unique) — ex: `aurora.seupms.com.br`
- `legalId`: String (CNPJ)
- `status`: Enum ('ACTIVE', 'SUSPENDED')
- `createdAt`, `updatedAt`: Timestamps

### 1. User
Representa os funcionários do sistema (ex: administradores, recepcionistas).
- `id`: UUID (Primary Key)
- `tenantId`: UUID (Foreign Key -> Tenant)
- `name`: String
- `email`: String (Unique por tenant)
- `password`: String (hash bcrypt)
- `role`: Enum ('ADMIN', 'RECEPTIONIST')
- `createdAt`, `updatedAt`: Timestamps
- `deletedAt`: Timestamp (soft delete)

### 2. RoomCategory
Separa os atributos de tipos de quarto da entidade física para evitar redundância de dados (3FN).
- `id`: UUID (Primary Key)
- `tenantId`: UUID (Foreign Key -> Tenant)
- `name`: String (ex: 'Standard', 'Suite')
- `capacity`: Integer
- `pricePerNight`: Decimal
- `createdAt`, `updatedAt`: Timestamps
- `deletedAt`: Timestamp (soft delete)

### 3. Room
Representa o quarto físico do hotel.
- `id`: UUID (Primary Key)
- `tenantId`: UUID (Foreign Key -> Tenant)
- `number`: String (Unique por tenant)
- `floor`: Integer
- `status`: Enum ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING')
- `categoryId`: UUID (Foreign Key -> RoomCategory)
- `createdAt`, `updatedAt`: Timestamps
- `deletedAt`: Timestamp (soft delete)

### 4. Guest
Representa os hóspedes.
- `id`: UUID (Primary Key)
- `tenantId`: UUID (Foreign Key -> Tenant)
- `fullName`: String
- `cpf`: String (Unique por tenant quando informado)
- `phone`: String
- `email`: String
- `createdAt`, `updatedAt`: Timestamps
- `deletedAt`: Timestamp (soft delete)

### 5. Reservation
Registra as reservas. Inclui o `totalAmount` para manter histórico financeiro caso os preços das categorias mudem no futuro. `guestId` e `roomId` são nullable para preservar o registro mesmo após soft-delete do hóspede/quarto.
- `id`: UUID (Primary Key)
- `tenantId`: UUID (Foreign Key -> Tenant)
- `checkInDate`: Date
- `checkOutDate`: Date
- `status`: Enum ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED')
- `totalAmount`: Decimal
- `guestId`: UUID (Foreign Key -> Guest, nullable)
- `roomId`: UUID (Foreign Key -> Room, nullable)
- `userId`: UUID (Foreign Key -> User, nullable) — usuário que registrou
- `createdAt`, `updatedAt`: Timestamps
- `deletedAt`: Timestamp (soft delete)

### 6. Payment
- `id`: UUID (Primary Key)
- `tenantId`: UUID (Foreign Key -> Tenant) — denormalizado para queries de receita
- `reservationId`: UUID (Foreign Key -> Reservation)
- `method`: Enum ('PIX', 'CASH', 'CARD', 'TRANSFER')
- `amount`: Decimal
- `paidAt`: Timestamp
- `createdAt`: Timestamp

---

# Relacionamentos

```txt
Tenant 1:N User
Tenant 1:N RoomCategory
Tenant 1:N Room
Tenant 1:N Guest
Tenant 1:N Reservation
Tenant 1:N Payment
RoomCategory 1:N Room
Guest 1:N Reservation
Room 1:N Reservation
User 1:N Reservation
Reservation 1:N Payment
```

---

# Objetivos Acadêmicos

O projeto busca demonstrar:

* APIs REST;
* modelagem relacional;
* autenticação;
* Docker;
* Docker Swarm;
* infraestrutura moderna;
* backend com Node.js;
* persistência de dados (usando Sequelize ORM);
* escalabilidade básica.

---

# Roadmap Resumido

## Fase 1

* setup Docker;
* PostgreSQL;
* Express.

---

## Fase 2

* Sequelize ORM;
* autenticação JWT.

---

## Fase 3

* CRUD hóspedes;
* CRUD quartos.

---

## Fase 4

* reservas;
* regras de negócio.

---

## Fase 5

* Swagger;
* testes;
* documentação.

---

## Fase 6

* Docker Swarm;
* Kubernetes (complementar).

---

## Observação sobre Multi-tenant (SaaS)

- **Abordagem:** Cada hotel é um `tenant` lógico. A tabela `tenants` centraliza o registro de clientes SaaS. Todas as entidades operacionais (users, rooms, room_categories, guests, reservations, payments) incluem `tenant_id` como FK para isolar dados por cliente na mesma base de dados.
- **Vantagem:** permite compartilhar a mesma instância PostgreSQL com separação lógica total, facilitar backups por cliente e aplicar políticas específicas por tenant.
- **Soft delete:** todas as entidades operacionais têm `deleted_at` (Sequelize `paranoid: true`). Tenants não usam soft delete — são `SUSPENDED`, não deletados.

## Esquema SQL (resumido) — Exemplo

O arquivo de script completo está em [db/schema.sql](db/schema.sql). O script executável com todas as constraints está em [scripts/setup.sql](scripts/setup.sql).

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants (um registro por hotel cliente SaaS)
CREATE TABLE IF NOT EXISTS tenants (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name      TEXT NOT NULL,
  subdomain TEXT NOT NULL UNIQUE,
  legal_id  TEXT,
  status    TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Usuários do sistema
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at    TIMESTAMP WITH TIME ZONE,
  UNIQUE (tenant_id, email)
);

-- (demais tabelas: room_categories, rooms, guests, reservations, payments)
-- Veja o schema completo em db/schema.sql e scripts/setup.sql
```

Cada trecho acima no script é acompanhado por comentários curtos explicando o propósito das colunas e constraints.

---

## Próximos passos (técnicos)

- Adicionar scripts de migração com ferramenta (ex: Sequelize Migrations ou Flyway).
- Definir políticas de backup e esquemas de particionamento caso o volume por tenant cresça.
- Implementar testes de integridade e dados fictícios para QA.

---

## Entrega acadêmica — requisitos do professor

1) Escolha do SGBD

- **Provedor:** PostgreSQL
- **Justificativa curta:** PostgreSQL oferece robustez ACID, suporte a tipos avançados (UUID, JSONB), extensões (uuid-ossp), e forte suporte a índices e transações—adequado para integridade e consistência exigidas por um sistema de reservas hoteleiras multi-tenant. Para um SaaS com relações bem definidas e necessidade de consultas complexas/joins e agregações, um banco relacional como PostgreSQL é preferível a NoSQL.

2) Modelagem e Estrutura

- **Diagrama Entidade-Relacionamento (DER):** disponível em [modelagem/DER.mmd](modelagem/DER.mmd)
- **Diagrama Lógico:** disponível em [modelagem/diagrama_logico.md](modelagem/diagrama_logico.md)
- **DDL (scripts):** o DDL final está em [scripts/setup.sql](scripts/setup.sql). O arquivo contém tabelas, chaves estrangeiras, índices e triggers de atualização de timestamps.

3) Requisitos de Performance

- **Estratégia de indexação (resumo):**
	- `reservations(tenant_id, check_in_date)` — acelera buscas por calendário e verificações de disponibilidade.
	- `reservations(tenant_id, check_out_date)` — para filtros por período.
	- `rooms(tenant_id, status)` — lista rápida de quartos disponíveis/ocupados por tenant.
	- `users(tenant_id, email)` — lookup para autenticação (login).
	- `guests(tenant_id, cpf)` — busca por documento fiscal.

- **Justificativa:** índices compostos por `tenant_id` garantem que buscas por cliente utilizem índices e mantenham separação lógica do SaaS; colunas de data indexadas otimizam consultas por período que são comuns em relatórios e verificações de disponibilidade.

4) Organização do Repositório (conforme solicitado)

- **/modelagem:** Diagramas e mapa lógico — [modelagem/DER.mmd](modelagem/DER.mmd), [modelagem/diagrama_logico.md](modelagem/diagrama_logico.md)
- **/scripts:** DDL final e observações — [scripts/setup.sql](scripts/setup.sql)
- **/seed:** Seeds para popular DB em desenvolvimento — [seed/seed_hotels.sql](seed/seed_hotels.sql)
- **/queries:** Exemplos das operações principais e agregações — [queries/queries.sql](queries/queries.sql)

5) Observações finais e próximos passos acadêmicos

- Gerar migrations com `sequelize-cli` para aplicar o `scripts/setup.sql` em etapas controladas.
- Criar `seed` mais completo com transações para manter integridade ao popular múltiplas tabelas.
- Implementar testes de performance (ex: pgbench ou scripts que simulem reservas concorrentes) e considerar particionamento de `reservations` por time-range se o volume for muito alto.

---

Se quiser, eu posso gerar os arquivos de migrations do Sequelize (arquivos `up`/`down`) correspondentes ao `scripts/setup.sql` ou criar os modelos Sequelize em JavaScript/TypeScript com comentários explicativos. Qual opção prefere? 
