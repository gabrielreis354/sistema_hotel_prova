# Banco de Dados — Arquitetura e Decisões

> **Fonte de verdade:** `db/schema.sql`
> **ORM:** Sequelize 6 (`sequelize.sync({ alter: true })` via `node command.js migrate`)
> **Provedor:** PostgreSQL 17

---

## Banco Escolhido

**PostgreSQL 17** — banco relacional com suporte a:
- Integridade ACID para operações financeiras
- UUID nativo como chave primária (`uuid-ossp`)
- Índices GIST e constraint `EXCLUDE USING gist` para evitar double-booking
- Soft delete via coluna `deleted_at` (histórico nunca é destruído)
- Multi-tenancy lógico eficiente via `tenant_id` em todas as tabelas filhas

---

## Estrutura — 8 Tabelas

O banco está estruturado em 8 tabelas, todas com UUID como PK e `tenant_id` como FK de isolamento (exceto a tabela raiz `tenants` e a tabela pivô `reservation_rooms`).

### 1. `tenants` — Raiz do SaaS
Representa cada hotel/pousada cliente da plataforma.

| Coluna | Tipo | Constraint | Descrição |
|---|---|---|---|
| `id` | UUID | PK | Identificador único do tenant |
| `name` | TEXT | NOT NULL | Nome do hotel |
| `subdomain` | TEXT | NOT NULL, UNIQUE | Identificador único na URL de login |
| `legal_id` | TEXT | nullable | CNPJ ou documento fiscal |
| `status` | TEXT | NOT NULL, DEFAULT 'ACTIVE' | ACTIVE ou SUSPENDED |
| `booking_enabled` | BOOLEAN | NOT NULL, DEFAULT true | Liga/desliga o motor de reservas diretas (página pública) |
| `deposit_percent` | INTEGER | NOT NULL, DEFAULT 30, CHECK 0–100 | Percentual cobrado como sinal PIX no ato da reserva online |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | Atualizado por trigger |

---

### 2. `users` — Funcionários do hotel

| Coluna | Tipo | Constraint | Descrição |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenants(id) NOT NULL | Isolamento multi-tenant |
| `name` | TEXT | NOT NULL | |
| `email` | TEXT | NOT NULL | |
| `password_hash` | TEXT | NOT NULL | Hash bcrypt — nunca senha em texto claro |
| `role` | TEXT | NOT NULL, DEFAULT 'RECEPTIONIST' | ADMIN ou RECEPTIONIST |
| `deleted_at` | TIMESTAMPTZ | nullable | Soft delete |
| `created_at` / `updated_at` | TIMESTAMPTZ | | |

**Constraint:** `UNIQUE (tenant_id, email)` — mesmo e-mail pode existir em hotéis diferentes.

---

### 3. `room_categories` — Tipos de quarto

| Coluna | Tipo | Constraint | Descrição |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenants(id) NOT NULL | |
| `name` | TEXT | NOT NULL | Ex: Standard, Suíte, Luxo |
| `capacity` | INTEGER | NOT NULL, DEFAULT 1, CHECK > 0 | |
| `price_per_night` | NUMERIC(10,2) | NOT NULL, CHECK >= 0 | Preço-base por noite |
| `deleted_at` | TIMESTAMPTZ | nullable | Soft delete |

**Constraint:** `UNIQUE (tenant_id, name)` — nome único por hotel.

**Decisão de modelagem (3FN):** separar categoria de quarto do quarto físico evita repetição de `price_per_night` em cada registro de `rooms`.

---

### 4. `rooms` — Quartos físicos

| Coluna | Tipo | Constraint | Descrição |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenants(id) NOT NULL | |
| `category_id` | UUID | FK → room_categories(id) NOT NULL | |
| `number` | TEXT | NOT NULL | Número ou código do quarto |
| `floor` | INTEGER | nullable | Andar |
| `status` | TEXT | NOT NULL, DEFAULT 'AVAILABLE' | Máquina de estados operacional |
| `deleted_at` | TIMESTAMPTZ | nullable | Soft delete |

**Status possíveis:** `AVAILABLE` → `OCCUPIED` (check-in) → `CLEANING` (check-out) → `AVAILABLE` (limpeza concluída). Estado `MAINTENANCE` também disponível para quartos em manutenção (bloqueados para reserva).

**Constraint:** `UNIQUE (tenant_id, number)` — número único por hotel.

---

### 5. `guests` — Hóspedes

| Coluna | Tipo | Constraint | Descrição |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenants(id) NOT NULL | |
| `full_name` | TEXT | NOT NULL | |
| `cpf` | TEXT | nullable | CPF — nullable para hóspedes estrangeiros |
| `phone` | TEXT | nullable | |
| `email` | TEXT | nullable | |
| `deleted_at` | TIMESTAMPTZ | nullable | Soft delete |

**Constraints:** `UNIQUE (tenant_id, cpf)` e `UNIQUE (tenant_id, email)` — unicidade por hotel, não global.

---

### 6. `reservations` — Reservas

| Coluna | Tipo | Constraint | Descrição |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenants(id) NOT NULL | |
| `guest_id` | UUID | FK → guests(id) ON DELETE RESTRICT, NOT NULL | Hóspede titular |
| `room_id` | UUID | FK → rooms(id) ON DELETE RESTRICT, NOT NULL | Quarto principal |
| `user_id` | UUID | FK → users(id) ON DELETE RESTRICT, **nullable** | Recepcionista que registrou — NULL em reservas vindas do motor online |
| `check_in_date` | DATE | NOT NULL | |
| `check_out_date` | DATE | NOT NULL | |
| `status` | TEXT | NOT NULL, DEFAULT 'PENDING' | Máquina de estados |
| `total_amount` | NUMERIC(12,2) | NOT NULL, DEFAULT 0 | Valor histórico — preserva preço na data da reserva |
| `source` | TEXT | NOT NULL, DEFAULT 'MANUAL' | Origem da reserva: `MANUAL` (recepção) ou `DIRECT` (motor online) |
| `deleted_at` | TIMESTAMPTZ | nullable | Soft delete |

**Status possíveis:** `PENDING` → `CONFIRMED` → `CHECKED_IN` → `CHECKED_OUT`. Cancelamento: `PENDING` ou `CONFIRMED` → `CANCELLED`.

**Constraint crítica (anti-double-booking):**
```sql
EXCLUDE USING gist (
  room_id WITH =,
  daterange(check_in_date, check_out_date, '[)') WITH &&
)
```
Impede sobreposição de datas no nível do banco — mesmo que dois processos tentem criar a segunda reserva simultaneamente.

---

### 7. `reservation_rooms` — Pivô N:N (Reservas ↔ Quartos adicionais)

| Coluna | Tipo | Constraint | Descrição |
|---|---|---|---|
| `id` | UUID | PK | |
| `reservation_id` | UUID | FK → reservations(id) ON DELETE CASCADE | |
| `room_id` | UUID | FK → rooms(id) ON DELETE CASCADE | |
| `created_at` / `updated_at` | TIMESTAMPTZ | | |

**Constraint:** `UNIQUE (reservation_id, room_id)` — um quarto não pode aparecer duas vezes na mesma reserva.

**Decisão de modelagem (1FN):** uma reserva pode abranger múltiplos quartos (ex: família reserva 2 quartos). A tabela pivô elimina a necessidade de arrays ou grupos repetitivos em `reservations`.

---

### 8. `payments` — Pagamentos

| Coluna | Tipo | Constraint | Descrição |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK → tenants(id) NOT NULL | Desnormalizado — acelera relatórios financeiros por hotel sem JOIN extra |
| `reservation_id` | UUID | FK → reservations(id) ON DELETE CASCADE | |
| `amount` | NUMERIC(12,2) | NOT NULL, CHECK >= 0 | Valor do pagamento |
| `method` | TEXT | NOT NULL | PIX, CARTAO_CREDITO, CARTAO_DEBITO, DINHEIRO |
| `status` | TEXT | NOT NULL, DEFAULT 'PAID', CHECK IN ('PENDING','PAID','EXPIRED','FAILED') | Ciclo de vida: `PAID` (pagamentos manuais) ou `PENDING` → `PAID` (PIX online via webhook). `EXPIRED`/`FAILED` reservados para o PSP real |
| `kind` | TEXT | NOT NULL, DEFAULT 'FULL' | Natureza do valor: `FULL`, `DEPOSIT` (sinal online) ou `BALANCE` (saldo no check-in) |
| `provider` | TEXT | nullable | Nome do PSP (provedor de pagamento). NULL em pagamentos manuais |
| `provider_charge_id` | TEXT | nullable | ID da cobrança no PSP. NULL em pagamentos manuais |
| `pix_qr_code` | TEXT | nullable | Payload PIX copia-e-cola (EMV). NULL em pagamentos manuais |
| `pix_expiration` | TIMESTAMPTZ | nullable | Validade da cobrança PIX. NULL em pagamentos manuais |
| `paid_at` | TIMESTAMPTZ | nullable | Momento do pagamento — NULL enquanto PIX está pendente; preenchido no webhook |
| `deleted_at` | TIMESTAMPTZ | nullable | Soft delete — histórico financeiro nunca é destruído |

---

## Relacionamentos

```
tenants  1:N  users
tenants  1:N  room_categories
tenants  1:N  rooms
tenants  1:N  guests
tenants  1:N  reservations
tenants  1:N  payments

room_categories  1:N  rooms
guests           1:N  reservations
users            1:N  reservations
reservations     N:N  rooms   (via reservation_rooms)
reservations     1:N  payments
```

---

## Normalização

| Forma Normal | Status | Evidência |
|---|---|---|
| **1FN** | Atendida | Todos os atributos são atômicos. Relação N:N (reservas ↔ quartos) resolvida pela tabela pivô `reservation_rooms` em vez de grupos repetitivos |
| **2FN** | Atendida | Toda coluna depende da chave primária completa (UUID) |
| **3FN** | Atendida | `price_per_night` fica em `room_categories`, não em `rooms` |
| **Desnormalizações intencionais** | `tenant_id` em `payments`; `total_amount` em `reservations` | Desnormalizações documentadas e justificadas: `tenant_id` evita JOIN com `reservations` em relatórios financeiros; `total_amount` preserva o valor histórico quando o preço da categoria muda |

---

## Índices

```sql
-- Filtro principal de isolamento multi-tenant + data de check-in
CREATE INDEX idx_reservations_tenant_checkin ON reservations (tenant_id, check_in_date);

-- Filtro de quartos por status por hotel (painel de disponibilidade)
CREATE INDEX idx_rooms_tenant_status ON rooms (tenant_id, status);

-- Login: lookup rápido por e-mail dentro do tenant
CREATE INDEX idx_users_tenant_email ON users (tenant_id, email);

-- Busca de pagamentos por reserva
CREATE INDEX idx_reservation_rooms_res_id ON reservation_rooms (reservation_id);
```

Todos os índices de queries multi-tenant são **compostos começando por `tenant_id`** — garante que buscas de um hotel usem sempre o índice e não façam full-table-scan em dados de outros hotéis.

---

## Migrations

O projeto não usa `sequelize-cli`. As tabelas são criadas e atualizadas via:

```bash
# Kubernetes (ambiente principal)
kubectl exec -n hotel-system deploy/backend -- node command.js migrate

# Docker Compose (alternativo — testes)
docker compose exec node_web node command.js migrate
```

O comando executa `sequelize.sync({ alter: true })` — cria tabelas novas e adiciona colunas sem destruir dados existentes.

O schema SQL completo (DDL com triggers e constraints) está em `db/schema.sql`.

---

## Recursos de documentação

| Arquivo | Conteúdo |
|---|---|
| `db/schema.sql` | DDL completo — fonte de verdade |
| `scripts/setup.sql` | DDL comentado para fins acadêmicos |
| `modelagem/der.png` | Diagrama Entidade-Relacionamento |
| `modelagem/DER.mmd` | Fonte do DER em Mermaid |
| `modelagem/modelo_logico.png` | Diagrama Lógico |
| `modelagem/dicionario_dados.md` | Dicionário completo de colunas |
| `queries/crud.sql` | Consultas CRUD com isolamento por tenant_id |
| `queries/consultas_avancadas.sql` | 5 JOINs complexos |
| `queries/agregacoes.sql` | 5 consultas de agregação (relatórios) |
| `seed/seed_hotels.sql` | 165 registros de exemplo (2 hotéis) |
| `justificativa/arquitetura.md` | Justificativa completa da escolha tecnológica |

---

*Última atualização: 18/06/2026*
