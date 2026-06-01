Diagrama lógico (tabelas, chaves primárias e estrangeiras)

- tenants (id PK)
  - id UUID PK
  - name TEXT
  - subdomain TEXT UNIQUE         -- ex: aurora.seupms.com.br
  - legal_id TEXT
  - status TEXT DEFAULT 'ACTIVE'  -- ACTIVE | SUSPENDED

- users (id PK)
  - id UUID PK
  - tenant_id UUID FK -> tenants(id)
  - name TEXT
  - email TEXT (unique por tenant)
  - deleted_at TIMESTAMP          -- soft delete

- room_categories (id PK)
  - id UUID PK
  - tenant_id UUID FK -> tenants(id)
  - name TEXT
  - capacity INTEGER
  - price_per_night NUMERIC(10,2)
  - deleted_at TIMESTAMP          -- soft delete

- rooms (id PK)
  - id UUID PK
  - tenant_id UUID FK -> tenants(id)
  - category_id UUID FK -> room_categories(id)
  - number TEXT (unique por tenant)
  - status TEXT                   -- AVAILABLE | OCCUPIED | MAINTENANCE | CLEANING
  - deleted_at TIMESTAMP          -- soft delete

- guests (id PK)
  - id UUID PK
  - tenant_id UUID FK -> tenants(id)
  - full_name TEXT
  - cpf TEXT (unique por tenant quando informado)
  - deleted_at TIMESTAMP          -- soft delete

- reservations (id PK)
  - id UUID PK
  - tenant_id UUID FK -> tenants(id)
  - guest_id UUID FK -> guests(id) (nullable — ON DELETE SET NULL preserva histórico)
  - room_id UUID FK -> rooms(id)   (nullable — mesma razão)
  - user_id UUID FK -> users(id)   (nullable — mesma razão)
  - check_in_date DATE
  - check_out_date DATE
  - status TEXT                    -- PENDING | CONFIRMED | CHECKED_IN | CHECKED_OUT | CANCELLED
  - total_amount NUMERIC(12,2)
  - deleted_at TIMESTAMP           -- soft delete

- payments (id PK)
  - id UUID PK
  - tenant_id UUID FK -> tenants(id)  -- denormalizado para queries de receita por tenant
  - reservation_id UUID FK -> reservations(id)
  - method TEXT                    -- PIX | CASH | CARD | TRANSFER
  - amount NUMERIC(12,2)

Índices recomendados:
- reservations(tenant_id, check_in_date)  — busca por calendário
- reservations(tenant_id, check_out_date) — filtros de saída
- rooms(tenant_id, status)                — quartos disponíveis por tenant
- users(tenant_id, email)                 — autenticação/lookup
- guests(tenant_id, cpf)                  — busca por documento
