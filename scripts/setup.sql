-- DDL final (scripts/setup.sql)
-- Script executável com todas as constraints.
-- Em produção, use Sequelize migrations para gerenciar alterações de schema.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants (um registro por hotel cliente do SaaS)
CREATE TABLE IF NOT EXISTS tenants (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name      TEXT NOT NULL,
  subdomain TEXT NOT NULL UNIQUE,
  legal_id  TEXT,
  status    TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CHECK (status IN ('ACTIVE', 'SUSPENDED'))
);

-- Usuários
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
  UNIQUE (tenant_id, email),
  CHECK (role IN ('ADMIN','RECEPTIONIST'))
);

-- Categorias de quarto
CREATE TABLE IF NOT EXISTS room_categories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  capacity        INTEGER NOT NULL DEFAULT 1,
  price_per_night NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at      TIMESTAMP WITH TIME ZONE,
  UNIQUE (tenant_id, name)
);

-- Quartos físicos
CREATE TABLE IF NOT EXISTS rooms (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES room_categories(id) ON DELETE RESTRICT,
  number      TEXT NOT NULL,
  floor       INTEGER,
  status      TEXT NOT NULL DEFAULT 'AVAILABLE',
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at  TIMESTAMP WITH TIME ZONE,
  UNIQUE (tenant_id, number),
  CHECK (status IN ('AVAILABLE','OCCUPIED','MAINTENANCE','CLEANING'))
);

-- Hóspedes
CREATE TABLE IF NOT EXISTS guests (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name  TEXT NOT NULL,
  cpf        TEXT,
  phone      TEXT,
  email      TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (tenant_id, cpf)
);

-- Reservas
CREATE TABLE IF NOT EXISTS reservations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  guest_id       UUID REFERENCES guests(id)      ON DELETE SET NULL,
  room_id        UUID REFERENCES rooms(id)        ON DELETE SET NULL,
  user_id        UUID REFERENCES users(id)        ON DELETE SET NULL,
  check_in_date  DATE NOT NULL,
  check_out_date DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'PENDING',
  total_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at     TIMESTAMP WITH TIME ZONE,
  CHECK (check_out_date > check_in_date),
  CHECK (status IN ('PENDING','CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED'))
);

-- Pagamentos
CREATE TABLE IF NOT EXISTS payments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL,
  method         TEXT NOT NULL,
  paid_at        TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CHECK (method IN ('PIX','CASH','CARD','TRANSFER'))
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_checkin  ON reservations (tenant_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_checkout ON reservations (tenant_id, check_out_date);
CREATE INDEX IF NOT EXISTS idx_rooms_tenant_status          ON rooms        (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_users_tenant_email           ON users        (tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_guests_tenant_cpf            ON guests       (tenant_id, cpf);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at         BEFORE UPDATE ON tenants         FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_users_updated_at           BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_room_categories_updated_at BEFORE UPDATE ON room_categories FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_rooms_updated_at           BEFORE UPDATE ON rooms           FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_guests_updated_at          BEFORE UPDATE ON guests          FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_reservations_updated_at    BEFORE UPDATE ON reservations    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Observações:
-- - Use Sequelize migrations (sequelize-cli) para gerenciar alterações em produção.
-- - Considere particionamento de reservations por data em ambientes de alto volume.
