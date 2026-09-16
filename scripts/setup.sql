-- =============================================================================
-- DDL de Referência — Sistema de Gestão de Hotel (SaaS Multi-Tenant)
-- scripts/setup.sql
--
-- PROPÓSITO: este é o script de DDL de referência para criação de novos
-- ambientes (desenvolvimento, homologação, avaliação acadêmica). Ele espelha
-- exatamente services/core-service/db/schema.sql, que é a fonte de verdade sincronizada com os
-- Models Sequelize em services/core-service/app/Models/. Os comentários abaixo são mais detalhados
-- para fins didáticos.
--
-- ORDEM DE CRIAÇÃO: as tabelas são criadas respeitando as dependências de
-- chave estrangeira (tenants primeiro, depois as filhas).
--
-- MULTI-TENANCY: toda tabela de negócio possui tenant_id referenciando
-- tenants(id). O isolamento entre hotéis é garantido na camada de aplicação
-- (sempre filtrando por tenant_id) e reforçado pelas FKs em cascata.
--
-- SOFT DELETE: tabelas de negócio possuem deleted_at; registros "apagados"
-- recebem timestamp em vez de DELETE físico, preservando histórico/auditoria.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Extensões necessárias
--    uuid-ossp  → função uuid_generate_v4() para PKs do tipo UUID
--    btree_gist → permite o constraint EXCLUDE com igualdade (=) + intervalo (&&)
--                 usado para impedir reservas sobrepostas no mesmo quarto
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -----------------------------------------------------------------------------
-- 2) tenants — Hotel/cliente do SaaS (raiz da hierarquia multi-tenant)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- identificador único do hotel
  name       TEXT NOT NULL,                                -- nome comercial do hotel
  subdomain  TEXT NOT NULL UNIQUE,                         -- subdomínio único (ex: aurora) p/ roteamento SaaS
  legal_id   TEXT,                                         -- documento legal (CNPJ), opcional
  status     TEXT NOT NULL DEFAULT 'ACTIVE',               -- situação da conta no SaaS
  created_at TIMESTAMPTZ DEFAULT now(),                    -- data de criação do registro
  updated_at TIMESTAMPTZ DEFAULT now(),                    -- atualizado automaticamente via trigger
  CHECK (status IN ('ACTIVE', 'SUSPENDED'))                -- estados válidos da conta
);

-- -----------------------------------------------------------------------------
-- 3) users — Funcionários do hotel (operadores do sistema)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),                 -- PK do usuário
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,      -- hotel a que pertence
  name          TEXT NOT NULL,                                               -- nome do funcionário
  email         TEXT NOT NULL,                                               -- login (único por tenant)
  password_hash TEXT NOT NULL,                                               -- hash bcrypt da senha
  role          TEXT NOT NULL DEFAULT 'RECEPTIONIST',                        -- perfil de acesso
  deleted_at    TIMESTAMPTZ,                                                 -- soft delete
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, email),                                                 -- e-mail único dentro do hotel
  CHECK (role IN ('ADMIN', 'RECEPTIONIST'))                                  -- perfis válidos
);

-- -----------------------------------------------------------------------------
-- 4) room_categories — Categorias/tipos de quarto com tarifa base
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS room_categories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),               -- PK da categoria
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,    -- hotel dono da categoria
  name            TEXT NOT NULL,                                             -- nome (ex: Standard, Suite)
  capacity        INTEGER NOT NULL DEFAULT 1,                                -- capacidade de pessoas
  price_per_night NUMERIC(10, 2) NOT NULL DEFAULT 0,                         -- tarifa por diária
  deleted_at      TIMESTAMPTZ,                                               -- soft delete
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, name),                                                  -- nome único por hotel
  CHECK (capacity > 0),                                                      -- capacidade positiva
  CHECK (price_per_night >= 0)                                               -- preço não negativo
);

-- -----------------------------------------------------------------------------
-- 5) rooms — Quartos físicos do hotel
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),                   -- PK do quarto
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,        -- hotel dono do quarto
  category_id UUID NOT NULL REFERENCES room_categories(id) ON DELETE RESTRICT, -- categoria (não apaga se houver quartos)
  number      TEXT NOT NULL,                                                 -- número/identificação do quarto
  floor       INTEGER,                                                       -- andar (opcional)
  status      TEXT NOT NULL DEFAULT 'AVAILABLE',                             -- estado operacional atual
  deleted_at  TIMESTAMPTZ,                                                   -- soft delete
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, number),                                                -- número único por hotel
  CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING'))     -- máquina de estados do quarto
);

-- -----------------------------------------------------------------------------
-- 6) guests — Hóspedes cadastrados
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guests (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),                    -- PK do hóspede
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,         -- hotel dono do cadastro
  full_name  TEXT NOT NULL,                                                  -- nome completo
  cpf        TEXT,                                                           -- documento (opcional, único por tenant)
  phone      TEXT,                                                           -- telefone de contato
  email      TEXT,                                                           -- e-mail (único por tenant)
  deleted_at TIMESTAMPTZ,                                                    -- soft delete
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, cpf),                                                   -- CPF único por hotel (não global)
  UNIQUE (tenant_id, email)                                                  -- e-mail único por hotel
);

-- -----------------------------------------------------------------------------
-- 7) reservations — Reservas (núcleo transacional do sistema)
--    O constraint EXCLUDE impede que o mesmo quarto tenha duas reservas com
--    períodos sobrepostos (proteção de double-booking no nível do banco).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),                -- PK da reserva
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,     -- hotel dono da reserva
  guest_id       UUID NOT NULL REFERENCES guests(id) ON DELETE RESTRICT,     -- hóspede (não apaga com reserva)
  room_id        UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,      -- quarto principal
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,      -- funcionário responsável
  check_in_date  DATE NOT NULL,                                              -- data de entrada
  check_out_date DATE NOT NULL,                                              -- data de saída
  status         TEXT NOT NULL DEFAULT 'PENDING',                            -- estado na máquina de reservas
  total_amount   NUMERIC(12, 2) NOT NULL DEFAULT 0,                          -- valor calculado server-side
  deleted_at     TIMESTAMPTZ,                                                -- soft delete
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  CHECK (check_out_date > check_in_date),                                    -- período válido
  CHECK (total_amount >= 0),                                                 -- valor não negativo
  CHECK (status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED')),
  EXCLUDE USING gist (                                                       -- impede sobreposição de datas
    room_id WITH =,                                                          -- ...para o mesmo quarto...
    daterange(check_in_date, check_out_date, '[)') WITH &&                   -- ...com intervalos que se cruzam
  )
);

-- -----------------------------------------------------------------------------
-- 8) reservation_rooms — Pivô N:N entre reservas e quartos
--    Permite que uma reserva contemple múltiplos quartos (quartos extras).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservation_rooms (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),                -- PK da associação
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,-- reserva (apaga em cascata)
  room_id        UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,       -- quarto associado
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (reservation_id, room_id)                                           -- evita duplicar o mesmo quarto
);

-- -----------------------------------------------------------------------------
-- 9) payments — Pagamentos vinculados a reservas
--    tenant_id é denormalizado aqui para acelerar relatórios financeiros
--    por hotel sem precisar de JOIN com reservations.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),                -- PK do pagamento
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,     -- hotel dono (denormalizado)
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,-- reserva paga
  amount         NUMERIC(12, 2) NOT NULL,                                    -- valor do pagamento
  method         TEXT NOT NULL,                                              -- forma de pagamento (ex: PIX)
  paid_at        TIMESTAMPTZ DEFAULT now(),                                  -- data/hora do pagamento
  deleted_at     TIMESTAMPTZ,                                                -- soft delete
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  CHECK (amount >= 0)                                                        -- valor não negativo
);

-- -----------------------------------------------------------------------------
-- 10) Índices — aceleram os filtros mais frequentes da aplicação
-- -----------------------------------------------------------------------------
-- Busca por calendário de reservas (tela do recepcionista)
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_checkin ON reservations (tenant_id, check_in_date);
-- Listagem de quartos por estado (ex: disponíveis)
CREATE INDEX IF NOT EXISTS idx_rooms_tenant_status         ON rooms (tenant_id, status);
-- Autenticação/lookup de usuários por e-mail
CREATE INDEX IF NOT EXISTS idx_users_tenant_email          ON users (tenant_id, email);
-- Resolução rápida dos quartos de uma reserva (pivô)
CREATE INDEX IF NOT EXISTS idx_reservation_rooms_res_id    ON reservation_rooms (reservation_id);

-- -----------------------------------------------------------------------------
-- 11) Trigger de updated_at — mantém o campo sempre atualizado em UPDATE
-- -----------------------------------------------------------------------------
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
CREATE TRIGGER trg_payments_updated_at        BEFORE UPDATE ON payments          FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- =============================================================================
-- Observações de produção:
-- - Em produção, gerencie alterações via migrations (node command.js migrate).
-- - Para alto volume, considere particionar reservations por intervalo de data.
-- - Os mesmos objetos são criados por services/core-service/db/schema.sql; mantenha ambos em sincronia.
-- =============================================================================
