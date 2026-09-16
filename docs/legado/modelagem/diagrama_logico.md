Diagrama lógico (tabelas, chaves primárias e estrangeiras)

- tenants (id PK)
  - id UUID PK
  - name TEXT
  - subdomain TEXT UNIQUE         -- ex: aurora.seupms.com.br
  - legal_id TEXT
  - status TEXT DEFAULT 'ACTIVE'  -- ACTIVE | SUSPENDED
  - booking_enabled BOOLEAN DEFAULT true  -- motor de reservas diretas (página pública)
  - deposit_percent INTEGER DEFAULT 30    -- % do sinal PIX cobrado online (0–100)

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
  - status TEXT                   -- AVAILABLE | OCCUPIED | CLEANING | MAINTENANCE
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
  - guest_id UUID FK NOT NULL -> guests(id) ON DELETE RESTRICT
  - room_id UUID FK NOT NULL -> rooms(id)   ON DELETE RESTRICT
  - user_id UUID FK -> users(id) ON DELETE RESTRICT  -- nullable: NULL em reservas do motor online
  - check_in_date DATE
  - check_out_date DATE
  - status TEXT                    -- PENDING | CONFIRMED | CHECKED_IN | CHECKED_OUT | CANCELLED
  - total_amount NUMERIC(12,2)
  - source TEXT DEFAULT 'MANUAL'   -- MANUAL (recepção) | DIRECT (motor online)
  - deleted_at TIMESTAMP           -- soft delete

- payments (id PK)
  - id UUID PK
  - tenant_id UUID FK -> tenants(id)  -- denormalizado para queries de receita por tenant
  - reservation_id UUID FK -> reservations(id)
  - amount NUMERIC(12,2)
  - method TEXT                    -- PIX | CARTAO_CREDITO | CARTAO_DEBITO | DINHEIRO
  - status TEXT DEFAULT 'PAID'     -- PENDING | PAID | FAILED
  - kind TEXT DEFAULT 'FULL'       -- FULL | DEPOSIT | BALANCE
  - provider TEXT                  -- nome do PSP (null em pagamentos manuais)
  - provider_charge_id TEXT        -- ID da cobrança no PSP (null em pagamentos manuais)
  - pix_qr_code TEXT               -- payload EMV copia-e-cola (null em pagamentos manuais)
  - pix_expiration TIMESTAMPTZ     -- validade do PIX (null em pagamentos manuais)
  - paid_at TIMESTAMPTZ            -- null enquanto PIX pendente; preenchido via webhook
  - deleted_at TIMESTAMP           -- soft delete

Índices recomendados:
- reservations(tenant_id, check_in_date)  — busca por calendário
- reservations(tenant_id, check_out_date) — filtros de saída
- rooms(tenant_id, status)                — quartos disponíveis por tenant
- users(tenant_id, email)                 — autenticação/lookup
- guests(tenant_id, cpf)                  — busca por documento
