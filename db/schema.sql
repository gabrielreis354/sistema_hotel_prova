-- Script de criação do esquema do banco (PostgreSQL)
-- Comentários curtos explicam propósito de cada bloco

-- 1) Extensões úteis
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- gera uuid_generate_v4()

-- 2) Tabela de tenants (cada registro = um hotel cliente do SaaS)
CREATE TABLE IF NOT EXISTS tenants (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name      TEXT NOT NULL,                               -- nome comercial
  subdomain TEXT NOT NULL UNIQUE,                        -- ex: aurora.seupms.com.br
  legal_id  TEXT,                                        -- CNPJ ou documento fiscal
  status    TEXT NOT NULL DEFAULT 'ACTIVE',              -- ACTIVE | SUSPENDED
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3) Usuários (funcionários por tenant)
-- email único por tenant; senha armazenada como hash bcrypt
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,                           -- ADMIN | RECEPTIONIST
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at    TIMESTAMP WITH TIME ZONE,                -- soft delete (paranoid)
  UNIQUE (tenant_id, email)
);

-- 4) Categorias de quarto (ex: Standard, Suite)
CREATE TABLE IF NOT EXISTS room_categories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  capacity        INTEGER NOT NULL DEFAULT 1,
  price_per_night NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at      TIMESTAMP WITH TIME ZONE,              -- soft delete
  UNIQUE (tenant_id, name)
);

-- 5) Quartos físicos
CREATE TABLE IF NOT EXISTS rooms (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES room_categories(id) ON DELETE RESTRICT,
  number      TEXT NOT NULL,
  floor       INTEGER,
  status      TEXT NOT NULL DEFAULT 'AVAILABLE',         -- AVAILABLE | OCCUPIED | MAINTENANCE | CLEANING
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at  TIMESTAMP WITH TIME ZONE,                  -- soft delete
  UNIQUE (tenant_id, number)
);

-- 6) Hóspedes
CREATE TABLE IF NOT EXISTS guests (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name  TEXT NOT NULL,
  cpf        TEXT,
  phone      TEXT,
  email      TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,                   -- soft delete
  UNIQUE (tenant_id, cpf)
);

-- 7) Reservas
-- guest_id e room_id são nullable: ON DELETE SET NULL preserva histórico
-- se hóspede/quarto for soft-deletado, a reserva permanece como registro
CREATE TABLE IF NOT EXISTS reservations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  guest_id       UUID REFERENCES guests(id) ON DELETE SET NULL,
  room_id        UUID REFERENCES rooms(id)   ON DELETE SET NULL,
  user_id        UUID REFERENCES users(id)   ON DELETE SET NULL,
  check_in_date  DATE NOT NULL,
  check_out_date DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'PENDING',
  total_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at     TIMESTAMP WITH TIME ZONE               -- soft delete
);

-- 8) Pagamentos (Módulo Financeiro — TCC)
-- tenant_id denormalizado: evita JOIN obrigatório em queries de receita por tenant
CREATE TABLE IF NOT EXISTS payments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL,
  method         TEXT NOT NULL,                          -- PIX | CASH | CARD | TRANSFER
  paid_at        TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 9) Índices úteis
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_checkin  ON reservations (tenant_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_checkout ON reservations (tenant_id, check_out_date);
CREATE INDEX IF NOT EXISTS idx_rooms_tenant_status          ON rooms        (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_users_tenant_email           ON users        (tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_guests_tenant_cpf            ON guests       (tenant_id, cpf);

-- 10) Triggers/Atualização de timestamps (exemplo simples)
-- Atualiza updated_at automaticamente em UPDATE
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplica trigger a tabelas com coluna updated_at
CREATE TRIGGER trg_tenants_updated_at         BEFORE UPDATE ON tenants         FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_users_updated_at           BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_room_categories_updated_at BEFORE UPDATE ON room_categories FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_rooms_updated_at           BEFORE UPDATE ON rooms           FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_guests_updated_at          BEFORE UPDATE ON guests          FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_reservations_updated_at    BEFORE UPDATE ON reservations    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Fim do schema. Script executável com todas as constraints: scripts/setup.sql
