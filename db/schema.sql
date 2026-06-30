-- =============================================================================
-- Schema do banco de dados — Sistema de Gestão de Hotel (SaaS Multi-Tenant)
-- Sincronizado com os Models Sequelize em app/Models/
-- Última atualização: 2026-06-08
--
-- IMPORTANTE: Este arquivo é usado por `npm run setup:db`.
-- O comando oficial de migrations é `node command.js migrate` (Sequelize sync).
-- Ambos devem sempre estar em sincronia.
-- =============================================================================

-- 1) Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =============================================================================
-- 2) Tabela principal — Tenants (SaaS)
-- Model: app/Models/TenantModel.js  |  tableName: 'tenants'
-- ATENÇÃO: a coluna FK nas tabelas filhas é tenant_id.
-- =============================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  subdomain        TEXT NOT NULL UNIQUE,
  legal_id         TEXT,
  status           TEXT NOT NULL DEFAULT 'ACTIVE',
  booking_enabled  BOOLEAN NOT NULL DEFAULT true,
  deposit_percent  INTEGER NOT NULL DEFAULT 30,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  CHECK (deposit_percent >= 0 AND deposit_percent <= 100)
);

-- =============================================================================
-- 3) Usuários — funcionários por hotel
-- Model: app/Models/UserModel.js  |  tableName: 'users'
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'RECEPTIONIST',
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, email),
  CHECK (role IN ('ADMIN', 'RECEPTIONIST'))
);

-- =============================================================================
-- 4) Categorias de quarto
-- Model: app/Models/RoomCategoryModel.js  |  tableName: 'room_categories'
-- =============================================================================
CREATE TABLE IF NOT EXISTS room_categories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  capacity        INTEGER NOT NULL DEFAULT 1,
  price_per_night NUMERIC(10, 2) NOT NULL DEFAULT 0,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, name),
  CHECK (capacity > 0),
  CHECK (price_per_night >= 0)
);

-- =============================================================================
-- 5) Quartos físicos
-- Model: app/Models/RoomModel.js  |  tableName: 'rooms'
-- =============================================================================
CREATE TABLE IF NOT EXISTS rooms (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES room_categories(id) ON DELETE RESTRICT,
  number      TEXT NOT NULL,
  floor       INTEGER,
  status      TEXT NOT NULL DEFAULT 'AVAILABLE',
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, number),
  CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING'))
);

-- =============================================================================
-- 6) Hóspedes
-- Model: app/Models/GuestModel.js  |  tableName: 'guests'
-- =============================================================================
CREATE TABLE IF NOT EXISTS guests (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name  TEXT NOT NULL,
  cpf        TEXT,
  phone      TEXT,
  email      TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, cpf),
  UNIQUE (tenant_id, email)
);

-- =============================================================================
-- 7) Reservas
-- Model: app/Models/ReservationModel.js  |  tableName: 'reservations'
-- =============================================================================
CREATE TABLE IF NOT EXISTS reservations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  guest_id       UUID NOT NULL REFERENCES guests(id) ON DELETE RESTRICT,
  room_id        UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  user_id        UUID REFERENCES users(id) ON DELETE RESTRICT,
  check_in_date  DATE NOT NULL,
  check_out_date DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'PENDING',
  total_amount   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  source         TEXT NOT NULL DEFAULT 'MANUAL',
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  CHECK (check_out_date > check_in_date),
  CHECK (total_amount >= 0),
  CHECK (status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED')),
  CHECK (source IN ('MANUAL', 'DIRECT')),
  EXCLUDE USING gist (
    room_id WITH =,
    daterange(check_in_date, check_out_date, '[)') WITH &&
  )
);

-- =============================================================================
-- 8) Tabela pivô — Reservas <-> Quartos (N:N)
-- Model: app/Models/ReservationRoomModel.js  |  tableName: 'reservation_rooms'
-- Uma reserva pode ter múltiplos quartos.
-- =============================================================================
CREATE TABLE IF NOT EXISTS reservation_rooms (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  room_id        UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (reservation_id, room_id)
);

-- =============================================================================
-- 9) Pagamentos
-- Model: app/Models/PaymentModel.js  |  tableName: 'payments'
-- =============================================================================
CREATE TABLE IF NOT EXISTS payments (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reservation_id     UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  amount             NUMERIC(12, 2) NOT NULL,
  method             TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'PAID',
  kind               TEXT NOT NULL DEFAULT 'FULL',
  provider           TEXT,
  provider_charge_id TEXT,
  pix_qr_code        TEXT,
  pix_expiration     TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  deleted_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  CHECK (amount >= 0),
  CHECK (status IN ('PENDING', 'PAID', 'FAILED')),
  CHECK (kind IN ('FULL', 'DEPOSIT', 'BALANCE'))
);

-- =============================================================================
-- 10) Índices
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_checkin ON reservations (tenant_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_rooms_tenant_status         ON rooms (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_users_tenant_email          ON users (tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_reservation_rooms_res_id    ON reservation_rooms (reservation_id);

-- =============================================================================
-- 11) Trigger de updated_at automático
-- =============================================================================
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at         BEFORE UPDATE ON tenants           FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_users_updated_at           BEFORE UPDATE ON users             FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_room_categories_updated_at BEFORE UPDATE ON room_categories   FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_rooms_updated_at           BEFORE UPDATE ON rooms             FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_guests_updated_at          BEFORE UPDATE ON guests            FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_reservations_updated_at    BEFORE UPDATE ON reservations      FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_reservation_rooms_updated  BEFORE UPDATE ON reservation_rooms FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_payments_updated_at        BEFORE UPDATE ON payments         FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
