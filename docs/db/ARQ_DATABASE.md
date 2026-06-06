# Banco de Dados

## Banco Escolhido

PostgreSQL.

## ORM Escolhido

Sequelize ORM.

---

# Entidades (Modelagem Normalizada)

Para garantir integridade, redução de redundância e adequação às Formas Normais (1FN, 2FN, 3FN), a estrutura do banco de dados está normalizada da seguinte maneira:

### 1. User
Representa os funcionários do sistema (ex: administradores, recepcionistas).
- `id`: UUID (Primary Key)
- `name`: String
- `email`: String (Unique)
- `password`: String
- `role`: Enum ('ADMIN', 'RECEPTIONIST')
- `createdAt`, `updatedAt`: Timestamps

### 2. RoomCategory
Separa os atributos de tipos de quarto da entidade física para evitar redundância de dados (3FN).
- `id`: UUID (Primary Key)
- `name`: String (ex: 'Standard', 'Suite')
- `capacity`: Integer
- `pricePerNight`: Decimal
- `createdAt`, `updatedAt`: Timestamps

### 3. Room
Representa o quarto físico do hotel.
- `id`: UUID (Primary Key)
- `number`: String (Unique)
- `floor`: Integer
- `status`: Enum ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING')
- `categoryId`: UUID (Foreign Key -> RoomCategory)
- `createdAt`, `updatedAt`: Timestamps

### 4. Guest
Representa os hóspedes.
- `id`: UUID (Primary Key)
- `fullName`: String
- `cpf`: String (Unique)
- `phone`: String
- `email`: String (Unique)
- `createdAt`, `updatedAt`: Timestamps

### 5. Reservation
Registra as reservas. Inclui o `totalAmount` para manter histórico financeiro caso os preços das categorias mudem no futuro.
- `id`: UUID (Primary Key)
- `checkInDate`: Date
- `checkOutDate`: Date
- `status`: Enum ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED')
- `totalAmount`: Decimal
- `guestId`: UUID (Foreign Key -> Guest)
- `roomId`: UUID (Foreign Key -> Room)
- `userId`: UUID (Foreign Key -> User) - Usuário que registrou a reserva
- `createdAt`, `updatedAt`: Timestamps

---

# Relacionamentos

```txt
RoomCategory 1:N Room
Guest 1:N Reservation
Room 1:N Reservation
User 1:N Reservation
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

- **Abordagem:** Cada hotel é uma `tenant` lógico. A modelagem inclui a entidade `Hotel` e todas as entidades operacionais (usuários, quartos, categorias, reservas, hóspedes) referenciam `hotel_id` para isolar dados por cliente.
- **Vantagem:** permite compartilhar a mesma base com separação lógica, facilitar backups/monitoramento por cliente e aplicar políticas específicas por hotel.

## Esquema SQL (resumido) — Exemplo

O arquivo de script completo está em [db/schema.sql](db/schema.sql). Abaixo há um resumo com trechos comentados para orientação.

```sql
-- Habilita geração de UUIDs (Postgres). Execute como superuser quando configurar o DB.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela de hotéis (tenants)
CREATE TABLE IF NOT EXISTS hotels (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- identificador do hotel (tenant)
	name TEXT NOT NULL,                          -- nome do hotel/empresa
	legal_id TEXT,                                -- documento fiscal (CNPJ/ID)
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Usuários do sistema (funcionários do hotel)
CREATE TABLE IF NOT EXISTS users (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- id do usuário
	hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE, -- link para tenant
	name TEXT NOT NULL,
	email TEXT NOT NULL,
	password_hash TEXT NOT NULL,
	role TEXT NOT NULL, -- valores esperados: 'ADMIN','RECEPTIONIST'
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	UNIQUE (hotel_id, email) -- mesmo email pode existir em hotéis distintos
);

-- Categorias de quarto (por hotel)
CREATE TABLE IF NOT EXISTS room_categories (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	capacity INTEGER NOT NULL DEFAULT 1,
	price_per_night NUMERIC(10,2) NOT NULL DEFAULT 0,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	UNIQUE (hotel_id, name)
);

-- Quartos físicos
CREATE TABLE IF NOT EXISTS rooms (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
	category_id UUID NOT NULL REFERENCES room_categories(id) ON DELETE RESTRICT,
	number TEXT NOT NULL, -- número ou identificação do quarto
	floor INTEGER,
	status TEXT NOT NULL DEFAULT 'AVAILABLE', -- 'AVAILABLE','OCCUPIED','MAINTENANCE','CLEANING'
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	UNIQUE (hotel_id, number) -- número único por hotel
);

-- Hóspedes
CREATE TABLE IF NOT EXISTS guests (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
	full_name TEXT NOT NULL,
	cpf TEXT, -- documento nacional (pode ser NULL para estrangeiros)
	phone TEXT,
	email TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	UNIQUE (hotel_id, cpf), -- evita duplicidade por hotel quando informado
	UNIQUE (hotel_id, email)
);

-- Reservas
CREATE TABLE IF NOT EXISTS reservations (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
	guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE RESTRICT,
	room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, -- quem registrou/atualizou
	check_in_date DATE NOT NULL,
	check_out_date DATE NOT NULL,
	status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING','CONFIRMED','CHECKED_IN',... 
	total_amount NUMERIC(12,2) NOT NULL DEFAULT 0, -- histórico de valor
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	CHECK (check_out_date > check_in_date),
	CHECK (status IN ('PENDING','CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED')),
	EXCLUDE USING gist (
		room_id WITH =,
		daterange(check_in_date, check_out_date, '[)') WITH &&
	)
);

-- Índices para consultas comuns
CREATE INDEX IF NOT EXISTS idx_reservations_hotel_checkin ON reservations (hotel_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_status ON rooms (hotel_id, status);
```

Cada trecho acima no script é acompanhado por comentários curtos explicando o propósito das colunas e constraints.

> Observação: o esquema agora inclui validações adicionais de valores, unicidade de e-mail de hóspede por hotel, `updated_at` em pagamentos e um bloqueio de reservas sobrepostas por quarto usando `btree_gist`.

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
	- `reservations(hotel_id, check_in_date)` — acelera buscas por calendário e verificações de disponibilidade.
	- `reservations(hotel_id, check_out_date)` — para filtros por período.
	- `rooms(hotel_id, status)` — lista rápida de quartos disponíveis/ocupados por hotel.
	- `users(hotel_id, email)` — lookup para autenticação (login).
	- `guests(hotel_id, cpf)` — busca por documento fiscal.

- **Justificativa:** índices compostos por `hotel_id` garantem que buscas por cliente (tenant) utilizem índices e mantenham separação lógica do SaaS; colunas de data indexadas otimizam consultas por período que são comuns em relatórios e verificações de disponibilidade.

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
