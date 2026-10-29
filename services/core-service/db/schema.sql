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
  CHECK (role IN ('ADMIN', 'RECEPTIONIST', 'WAITER'))
);

-- Índice PARCIAL, não UNIQUE de tabela: a tabela é soft-delete (deleted_at) e uma
-- constraint UNIQUE não aceita predicado no PostgreSQL. Sem o WHERE, um usuário
-- removido queimaria o e-mail para sempre. Espelha users_email_tenant_unique
-- em app/Models/UserModel.js.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_tenant_unique
  ON users (email, tenant_id)
  WHERE deleted_at IS NULL;

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
  CHECK (capacity > 0),
  CHECK (price_per_night >= 0)
);

-- Índice PARCIAL — ver justificativa em users_email_tenant_unique acima.
-- Espelha room_categories_name_tenant_unique em app/Models/RoomCategoryModel.js.
CREATE UNIQUE INDEX IF NOT EXISTS room_categories_name_tenant_unique
  ON room_categories (tenant_id, name)
  WHERE deleted_at IS NULL;

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
  CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING'))
);

-- Índice PARCIAL — ver justificativa em users_email_tenant_unique acima.
-- Espelha rooms_number_tenant_unique em app/Models/RoomModel.js.
CREATE UNIQUE INDEX IF NOT EXISTS rooms_number_tenant_unique
  ON rooms (tenant_id, number)
  WHERE deleted_at IS NULL;

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
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices PARCIAIS — ver justificativa em users_email_tenant_unique acima. Aqui o
-- efeito é o mais visível na operação: um hóspede antigo removido não poderia se
-- recadastrar com o próprio CPF. Espelham os índices de app/Models/GuestModel.js.
CREATE UNIQUE INDEX IF NOT EXISTS guests_cpf_tenant_unique
  ON guests (cpf, tenant_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS guests_email_tenant_unique
  ON guests (email, tenant_id)
  WHERE deleted_at IS NULL;

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
  CHECK (source IN ('MANUAL', 'DIRECT', 'B2B')),
  -- Anti-double-booking em nível de banco. O predicado WHERE é essencial: sem ele
  -- a constraint conta reservas CANCELADAS e soft-deletadas, e cancelar uma reserva
  -- queimaria aquele quarto naquelas datas para sempre (a aplicação diria
  -- "disponível" e o banco recusaria, virando 500).
  EXCLUDE USING gist (
    room_id WITH =,
    daterange(check_in_date, check_out_date, '[)') WITH &&
  ) WHERE (status <> 'CANCELLED' AND deleted_at IS NULL)
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
  -- Cópia da reserva-mãe, mantida pelo BANCO — nunca pela aplicação (P-1, rodada 3). É sobre
  -- ela que o EXCLUDE recusa o mesmo quarto em duas reservas sobrepostas, inclusive quarto
  -- extra. O quarto principal (reservations.room_id) também tem linha aqui, inserida por
  -- trigger. Triggers, preenchimento de banco legado e o EXCLUDE
  -- reservation_rooms_room_daterange_excl ficam em database/applyDbConstraints.js
  -- (applyRoomOccupancy), aplicado pelo `command.js migrate` — fonte única.
  check_in_date  DATE,
  check_out_date DATE,
  blocks_room    BOOLEAN,
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
  -- Reserva OU conta (T-04.4): account_id entra depois de accounts, na seção 9d
  reservation_id     UUID REFERENCES reservations(id) ON DELETE CASCADE,
  amount             NUMERIC(12, 2) NOT NULL,
  method             TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'PAID',
  kind               TEXT NOT NULL DEFAULT 'FULL',
  provider           TEXT,
  provider_charge_id TEXT,
  pix_qr_code        TEXT,
  pix_expiration     TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  -- Trilha do estorno (T-06.13): nulos em todo pagamento não anulado
  void_reason        TEXT,
  voided_by          UUID REFERENCES users(id),
  voided_at          TIMESTAMPTZ,
  deleted_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  CHECK (amount >= 0),
  -- Mesma lista de app/utils/paymentEnums.js; mesmos nomes de applyPaymentStatusConstraints
  CONSTRAINT payments_status_allowlist CHECK (status IN ('PENDING', 'PAID', 'EXPIRED', 'FAILED', 'VOIDED')),
  CONSTRAINT payments_voided_has_trail CHECK (status <> 'VOIDED' OR (void_reason IS NOT NULL AND btrim(void_reason) <> ''
                                              AND voided_by IS NOT NULL AND voided_at IS NOT NULL)),
  CONSTRAINT payments_trail_only_voided CHECK (status = 'VOIDED' OR (void_reason IS NULL AND voided_by IS NULL AND voided_at IS NULL)),
  -- PAID tem data: a receita conta pelo paid_at e o saldo das contas pelo status
  CONSTRAINT payments_paid_has_paid_at CHECK (status <> 'PAID' OR paid_at IS NOT NULL),
  CHECK (kind IN ('FULL', 'DEPOSIT', 'BALANCE'))
);
-- T-06.13: banco criado antes do estorno. O CHECK antigo (nome automático, sem VOIDED) sai.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_by   UUID REFERENCES users(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_allowlist;
ALTER TABLE payments ADD  CONSTRAINT payments_status_allowlist
  CHECK (status IN ('PENDING', 'PAID', 'EXPIRED', 'FAILED', 'VOIDED'));
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_voided_has_trail;
ALTER TABLE payments ADD  CONSTRAINT payments_voided_has_trail
  CHECK (status <> 'VOIDED' OR (void_reason IS NOT NULL AND btrim(void_reason) <> ''
                                AND voided_by IS NOT NULL AND voided_at IS NOT NULL));
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_trail_only_voided;
ALTER TABLE payments ADD  CONSTRAINT payments_trail_only_voided
  CHECK (status = 'VOIDED' OR (void_reason IS NULL AND voided_by IS NULL AND voided_at IS NULL));
-- NOT VALID: banco antigo pode ter PAID sem data; a linha fica, só não entra nova
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_paid_has_paid_at;
ALTER TABLE payments ADD  CONSTRAINT payments_paid_has_paid_at
  CHECK (status <> 'PAID' OR paid_at IS NOT NULL) NOT VALID;

-- =============================================================================
-- 9b) Consumos extras (frigobar, restaurante, bar, spa) lançados na reserva
-- LEGADO (T-04.2): o model saiu do código e o consumo vive em account_items. A
-- tabela fica, sem escrita, como trilha para auditoria e rollback; o
-- `node command.js migrate` copia o conteúdo dela (database/migrateConsumptions.js).
-- O DROP é pendência registrada no anexo de decisões da SPEC-04.
-- Era: app/Models/ConsumptionModel.js  |  tableName: 'consumptions'
-- Compõem o fechamento de conta: (diária + consumos) − pagamentos.
-- =============================================================================
CREATE TABLE IF NOT EXISTS consumptions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  description    TEXT NOT NULL,
  amount         NUMERIC(12, 2) NOT NULL,
  consumed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by     UUID REFERENCES users(id),
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  CHECK (amount >= 0)
);
-- Checagem do 503 durante a migração (T-04.2) roda a cada bill.
CREATE INDEX IF NOT EXISTS idx_consumptions_reservation ON consumptions (reservation_id);

-- =============================================================================
-- 9b) Catálogo de produtos (cardápio) — base do módulo de consumo
-- Model: ProductModel
-- SERVICE cobre o que não é consumível (day-use, sonorização, lavanderia).
-- =============================================================================
CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  price       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  category    TEXT NOT NULL DEFAULT 'OTHER',
  active      BOOLEAN NOT NULL DEFAULT true,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  CHECK (price >= 0),
  CHECK (category IN ('FOOD', 'DRINK', 'SERVICE', 'OTHER'))
);

-- Unicidade por tenant, não global — dois hotéis podem ter "Cerveja 600ml".
-- Índice PARCIAL: sem o WHERE, um produto soft-deletado queimaria o nome para
-- sempre, já que a linha morta continuaria disputando unicidade.
CREATE UNIQUE INDEX IF NOT EXISTS products_name_tenant_unique
  ON products (tenant_id, name)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- 9d) Comanda — contas e itens lançados (SPEC-04, T-04.1; MER 4.11 e 4.12)
-- Models: AccountModel, AccountItemModel
-- Allowlists em app/utils/accountEnums.js. Mesmos nomes de constraint que
-- database/applyDbConstraints.js (applyAccountConstraints) — fonte do migrate.
-- =============================================================================
CREATE TABLE IF NOT EXISTS accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'OPEN',
  reservation_id  UUID REFERENCES reservations(id) ON DELETE RESTRICT,
  room_id         UUID REFERENCES rooms(id) ON DELETE RESTRICT,
  guest_id        UUID REFERENCES guests(id) ON DELETE RESTRICT,
  label           TEXT NOT NULL,
  charges_lodging BOOLEAN NOT NULL DEFAULT true,
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ,
  closed_room_charges NUMERIC(12, 2),
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT accounts_type_allowlist   CHECK (type IN ('ROOM', 'DAY_USE', 'TABLE', 'DIRECT', 'INTERNAL')),
  CONSTRAINT accounts_status_allowlist CHECK (status IN ('OPEN', 'CLOSED', 'PAID')),
  -- D-4: só a conta da suíte cobra diária
  CONSTRAINT accounts_charges_lodging_room_only CHECK (type = 'ROOM' OR charges_lodging = false),
  -- D-5: vínculos exigidos por tipo
  CONSTRAINT accounts_room_requires_stay CHECK (type <> 'ROOM' OR (reservation_id IS NOT NULL AND room_id IS NOT NULL AND guest_id IS NOT NULL)),
  CONSTRAINT accounts_reservation_only_room CHECK (type = 'ROOM' OR reservation_id IS NULL),
  CONSTRAINT accounts_no_guest_table_internal CHECK (type NOT IN ('TABLE', 'INTERNAL') OR guest_id IS NULL),
  -- D-39: diária gravada no fechamento; conta aberta calcula na hora
  CONSTRAINT accounts_closed_room_charges_only_closed CHECK (status <> 'OPEN' OR closed_room_charges IS NULL),
  CONSTRAINT accounts_closed_room_charges_non_negative CHECK (closed_room_charges IS NULL OR closed_room_charges >= 0)
);
-- T-04.3: banco criado antes desta coluna
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS closed_room_charges NUMERIC(12, 2);

-- T-04.4: pagamento da conta. Mesmos nomes de applyPaymentAccountConstraints.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT;
ALTER TABLE payments ALTER COLUMN reservation_id DROP NOT NULL;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_reservation_or_account;
ALTER TABLE payments ADD  CONSTRAINT payments_reservation_or_account
  CHECK (reservation_id IS NOT NULL OR account_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_payments_account ON payments (account_id);
-- Webhook PIX acha o pagamento só pelo id da cobrança do PSP: único entre os vivos,
-- global (sem tenant_id). Mesmo nome de applyDbConstraints (indicesParciais).
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_charge_id_unique
  ON payments (provider_charge_id)
  WHERE deleted_at IS NULL;
-- Pagamento com conta tem a reserva e o tenant da conta, e nunca é de conta INTERNAL
CREATE OR REPLACE FUNCTION payments_account_consistency() RETURNS trigger AS $$
DECLARE
  conta accounts%ROWTYPE;
BEGIN
  IF NEW.account_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO conta FROM accounts WHERE id = NEW.account_id;
  IF conta.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR conta.reservation_id IS DISTINCT FROM NEW.reservation_id THEN
    RAISE EXCEPTION 'payments_account_consistency: o pagamento precisa ter a reserva e o tenant da conta %', NEW.account_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF conta.type = 'INTERNAL' THEN
    RAISE EXCEPTION 'payments_account_consistency: conta INTERNAL não recebe pagamento (%)', NEW.account_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS payments_account_consistency ON payments;
CREATE TRIGGER payments_account_consistency
  BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_account_consistency();

-- RN-005 (D-3): uma conta cobrando diária por quarto DA ESTADIA. Parcial: conta
-- excluída não disputa; a próxima estadia no mesmo quarto cobra a sua.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_lodging_unique
  ON accounts (reservation_id, room_id)
  WHERE charges_lodging = true AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS account_items (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_id     UUID REFERENCES products(id) ON DELETE RESTRICT,
  description    TEXT NOT NULL,
  quantity       INTEGER NOT NULL,
  unit_price     NUMERIC(10, 2) NOT NULL,
  total          NUMERIC(10, 2) NOT NULL,
  billable       BOOLEAN NOT NULL DEFAULT true,
  reason         TEXT,
  client_item_id UUID,
  -- Nulo só no consumo antigo migrado (D-25): autoria desconhecida não é inventada
  created_by     UUID REFERENCES users(id) ON DELETE RESTRICT,
  deleted_by     UUID REFERENCES users(id) ON DELETE RESTRICT,
  origin         TEXT NOT NULL DEFAULT 'ACCOUNT',
  -- Quando o hóspede consumiu (D-26); created_at é quando o servidor gravou
  consumed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT account_items_origin_allowlist        CHECK (origin IN ('ACCOUNT', 'LEGACY_CONSUMPTION')),
  CONSTRAINT account_items_created_by_required     CHECK (created_by IS NOT NULL OR origin = 'LEGACY_CONSUMPTION'),
  CONSTRAINT account_items_quantity_positive       CHECK (quantity > 0),
  CONSTRAINT account_items_unit_price_non_negative CHECK (unit_price >= 0),
  -- CA-04.1.c: total sempre quantity × unit_price (implica total >= 0)
  CONSTRAINT account_items_total_matches           CHECK (total = quantity * unit_price),
  CONSTRAINT account_items_reason_allowlist        CHECK (reason IS NULL OR reason IN ('COURTESY', 'STAFF', 'LOSS', 'INTERNAL_USE')),
  -- RN-007: cortesia exige motivo
  CONSTRAINT account_items_reason_required         CHECK (billable OR reason IS NOT NULL)
);

-- T-04.2: banco provisionado antes das colunas novas. As constraints delas chegam
-- pelo `node command.js migrate` (applyAccountConstraints).
ALTER TABLE account_items ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE account_items ADD COLUMN IF NOT EXISTS origin      TEXT NOT NULL DEFAULT 'ACCOUNT';
ALTER TABLE account_items ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- RN-008 (D-6): índice TOTAL de propósito — exceção à regra dos paranoid. O item
-- excluído continua barrando o reenvio do mesmo client_item_id da fila offline.
CREATE UNIQUE INDEX IF NOT EXISTS account_items_client_item_tenant_unique
  ON account_items (tenant_id, client_item_id);

-- =============================================================================
-- 9c) Módulo B2B — clientes corporativos, orçamentos e contratos de evento
-- Models: CorporateClientModel, EventQuoteModel, QuoteServiceModel, ContractModel,
--         ContractInstallmentModel
-- =============================================================================
CREATE TABLE IF NOT EXISTS corporate_clients (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  razao_social       TEXT NOT NULL,
  cnpj               VARCHAR(14),
  cpf                VARCHAR(11),
  email              TEXT,
  telefone           TEXT,
  endereco           TEXT,
  representante_nome TEXT,
  representante_cpf  VARCHAR(11),
  representante_rg   TEXT,
  deleted_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- Índices PARCIAIS — ver justificativa em users_email_tenant_unique acima.
-- Espelham os índices de app/Models/CorporateClientModel.js.
CREATE UNIQUE INDEX IF NOT EXISTS corporate_clients_cnpj_tenant_unique
  ON corporate_clients (cnpj, tenant_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS corporate_clients_cpf_tenant_unique
  ON corporate_clients (cpf, tenant_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS event_quotes (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  corporate_client_id         UUID NOT NULL REFERENCES corporate_clients(id) ON DELETE RESTRICT,
  check_in                    DATE NOT NULL,
  check_out                   DATE NOT NULL,
  pessoas                     INTEGER NOT NULL,
  valor_diaria_com_refeicao   NUMERIC(10, 2),
  valor_diaria_sem_refeicao   NUMERIC(10, 2),
  inclui_refeicao             BOOLEAN NOT NULL DEFAULT false,
  inclui_roupa_cama           BOOLEAN NOT NULL DEFAULT false,
  desconto_pct                NUMERIC(5, 2) NOT NULL DEFAULT 0,
  total                       NUMERIC(10, 2) NOT NULL,
  observacoes                 TEXT,
  status                      TEXT NOT NULL DEFAULT 'SENT',
  pdf_url                     TEXT,
  deleted_at                  TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  updated_at                  TIMESTAMPTZ DEFAULT now(),
  CHECK (check_out > check_in),
  CHECK (status IN ('SENT', 'CONFIRMED', 'CANCELLED'))
);

CREATE TABLE IF NOT EXISTS quote_services (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quote_id       UUID NOT NULL REFERENCES event_quotes(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  quantidade     INTEGER NOT NULL DEFAULT 1,
  valor_unitario NUMERIC(10, 2) NOT NULL,
  diarias        INTEGER NOT NULL DEFAULT 1,
  total          NUMERIC(10, 2) NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contracts (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  corporate_client_id  UUID NOT NULL REFERENCES corporate_clients(id) ON DELETE RESTRICT,
  quote_id             UUID REFERENCES event_quotes(id) ON DELETE SET NULL,
  -- Reserva-bloco criada ao assinar o contrato (SignContractController) — bloqueia
  -- os quartos do evento para não serem vendidos avulso no mesmo período.
  reservation_id       UUID REFERENCES reservations(id) ON DELETE SET NULL,
  objeto               TEXT NOT NULL,
  check_in             DATE NOT NULL,
  check_out            DATE NOT NULL,
  pessoas              INTEGER NOT NULL,
  total                NUMERIC(10, 2) NOT NULL,
  testemunha_1         TEXT NOT NULL,
  testemunha_2         TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'GENERATED',
  pdf_url              TEXT,
  deleted_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  CHECK (check_out > check_in),
  CHECK (status IN ('GENERATED', 'SIGNED', 'CANCELLED'))
);

CREATE TABLE IF NOT EXISTS contract_installments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_id     UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  descricao       TEXT NOT NULL,
  data_vencimento DATE NOT NULL,
  valor           NUMERIC(10, 2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING',
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  CHECK (status IN ('PENDING', 'PAID'))
);

-- =============================================================================
-- 10) Índices
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_checkin ON reservations (tenant_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_rooms_tenant_status         ON rooms (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_users_tenant_email          ON users (tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_reservation_rooms_res_id    ON reservation_rooms (reservation_id);
CREATE INDEX IF NOT EXISTS idx_event_quotes_client         ON event_quotes (corporate_client_id);
CREATE INDEX IF NOT EXISTS idx_quote_services_quote        ON quote_services (quote_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client            ON contracts (corporate_client_id);
CREATE INDEX IF NOT EXISTS idx_contract_installments_contract ON contract_installments (contract_id);
CREATE INDEX IF NOT EXISTS idx_accounts_tenant_status      ON accounts (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_accounts_reservation        ON accounts (reservation_id);
CREATE INDEX IF NOT EXISTS idx_account_items_account       ON account_items (account_id);

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
CREATE TRIGGER trg_consumptions_updated_at    BEFORE UPDATE ON consumptions     FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_corporate_clients_updated  BEFORE UPDATE ON corporate_clients   FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_event_quotes_updated_at    BEFORE UPDATE ON event_quotes        FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_quote_services_updated_at  BEFORE UPDATE ON quote_services      FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_contracts_updated_at       BEFORE UPDATE ON contracts           FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_contract_installments_upd  BEFORE UPDATE ON contract_installments FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_accounts_updated_at        BEFORE UPDATE ON accounts            FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER trg_account_items_updated_at   BEFORE UPDATE ON account_items       FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
