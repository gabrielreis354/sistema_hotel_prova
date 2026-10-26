-- =============================================================================
-- Seed da comanda (SPEC-04, T-04.7 — CA-04.7.d, decisão D-66)
-- Roda DEPOIS de seed_hotels.sql (node command.js seed roda os dois, nesta ordem).
--
-- O que cria:
--   - garçom do Hotel Aurora (garcom@aurora.example, senha123) para demonstrar a comanda
--   - cardápio dos dois hotéis
--   - conta da suíte (ROOM, cobrando diária) em cada reserva CHECKED_IN dos hotéis do
--     seed — o mesmo que o check-in faz desde a T-04.6 (D-58)
--   - Hotel Aurora: consumo na Suíte 106 com uma cortesia, Mesa 3 aberta pelo garçom,
--     um day-use aberto e uma conta INTERNAL com refeição de funcionário e perda
--
-- CARACTERÍSTICAS (as mesmas de seed_hotels.sql):
--   - Idempotente: ON CONFLICT nos índices únicos; NOT EXISTS onde não há chave natural.
--   - Referências por subdomínio, e-mail, CPF, número do quarto e nome do produto —
--     NUNCA UUID hardcoded.
--   - Só toca os tenants 'aurora' e 'sol'.
--   - Horários com fuso explícito (-03, Brasília): o instante gravado não depende do
--     fuso da sessão que roda o seed (psql ou command.js), e o NOT EXISTS por
--     consumed_at continua reconhecendo o lançamento.
--   - Item só entra em conta OPEN: se a demonstração já fechou a conta, o seed não a
--     reabre nem lança nela.
-- =============================================================================

BEGIN;

-- Mesmo motivo de seed_hotels.sql: o banco criado pelo sync do Sequelize não tem os
-- DEFAULTs que a inserção direta por SQL precisa.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['products','accounts','account_items']
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT uuid_generate_v4()', tbl);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN created_at SET DEFAULT NOW()', tbl);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN updated_at SET DEFAULT NOW()', tbl);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Garçom do Hotel Aurora (WAITER: lê o cardápio e lança em mesa e balcão)
-- -----------------------------------------------------------------------------
INSERT INTO users (tenant_id, name, email, password_hash, role)
SELECT t.id, 'Garcom Aurora', 'garcom@aurora.example', '$2a$10$dU7xkr/NZyY00/rPNy6kcu2IiP1FVGg1IXjk/YqzJEmjZsWDwL5jS', 'WAITER'
FROM tenants t
WHERE t.subdomain = 'aurora'
ON CONFLICT (tenant_id, email) WHERE deleted_at IS NULL DO NOTHING;

-- -----------------------------------------------------------------------------
-- Cardápio
-- -----------------------------------------------------------------------------
INSERT INTO products (tenant_id, name, description, price, category, active)
SELECT t.id, v.name, v.description, v.price, v.category, v.active
FROM (VALUES
  ('aurora', 'Água mineral 500ml',     NULL,                                  5.00, 'DRINK',   true),
  ('aurora', 'Refrigerante lata',      NULL,                                  7.00, 'DRINK',   true),
  ('aurora', 'Cerveja long neck',      NULL,                                 12.00, 'DRINK',   true),
  ('aurora', 'Caipirinha',             'Limão, cachaça artesanal',            22.00, 'DRINK',   true),
  ('aurora', 'Vinho tinto (garrafa)',  'Cabernet Sauvignon nacional',         89.00, 'DRINK',   true),
  ('aurora', 'Porção de fritas',       NULL,                                 32.00, 'FOOD',    true),
  ('aurora', 'Almoço executivo',       'Prato do dia com suco',               45.00, 'FOOD',    true),
  ('aurora', 'Pudim',                  NULL,                                 14.00, 'FOOD',    true),
  ('aurora', 'Lavanderia (peça)',      NULL,                                 15.00, 'SERVICE', true),
  ('aurora', 'Suco natural',           'Saiu do cardápio de inverno',         10.00, 'DRINK',   false),
  ('sol',    'Água de coco',           NULL,                                  8.00, 'DRINK',   true),
  ('sol',    'Cerveja lata',           NULL,                                  9.00, 'DRINK',   true),
  ('sol',    'Tapioca',                NULL,                                 18.00, 'FOOD',    true),
  ('sol',    'Moqueca (2 pessoas)',    NULL,                                120.00, 'FOOD',    true)
) AS v(subdomain, name, description, price, category, active)
JOIN tenants t ON t.subdomain = v.subdomain
ON CONFLICT (tenant_id, name) WHERE deleted_at IS NULL DO NOTHING;

-- -----------------------------------------------------------------------------
-- Conta da suíte de cada estadia em andamento (D-58): ROOM, cobrando diária, no
-- quarto principal, rotulada "Suíte <número>". Reserva que já tem conta de diária
-- fica como está — é o que o check-in faz (reaproveita).
-- -----------------------------------------------------------------------------
INSERT INTO accounts (tenant_id, type, status, reservation_id, room_id, guest_id, label, charges_lodging, opened_at)
SELECT r.tenant_id, 'ROOM', 'OPEN', r.id, r.room_id, r.guest_id, 'Suíte ' || rm.number, true,
       (r.check_in_date + time '14:00') AT TIME ZONE 'America/Sao_Paulo'
FROM reservations r
JOIN tenants t ON t.id = r.tenant_id AND t.subdomain IN ('aurora', 'sol')
JOIN rooms rm  ON rm.id = r.room_id
WHERE r.status = 'CHECKED_IN'
  AND r.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.reservation_id = r.id AND a.charges_lodging = true AND a.deleted_at IS NULL
  )
ON CONFLICT (reservation_id, room_id) WHERE charges_lodging = true AND deleted_at IS NULL DO NOTHING;

-- -----------------------------------------------------------------------------
-- Contas avulsas do Hotel Aurora — sem chave natural: NOT EXISTS por (tipo, rótulo)
--   Mesa 3           → TABLE, aberta pelo garçom
--   Day-use          → DAY_USE de um cliente sem hospedagem (CPF 30000000010)
--   Equipe e perdas  → INTERNAL: nunca é receita (RN-006)
-- -----------------------------------------------------------------------------
INSERT INTO accounts (tenant_id, type, status, guest_id, label, charges_lodging, opened_at)
SELECT t.id, v.type, 'OPEN', g.id, v.label, false, v.opened_at::timestamptz
FROM (VALUES
  ('TABLE',    'Mesa 3',                     NULL,          '2026-06-17 12:10-03'),
  ('DAY_USE',  'Day-use — piscina',          '30000000010', '2026-06-17 10:00-03'),
  ('INTERNAL', 'Equipe e perdas — junho',    NULL,          '2026-06-01 08:00-03')
) AS v(type, label, guest_cpf, opened_at)
JOIN tenants t ON t.subdomain = 'aurora'
LEFT JOIN guests g ON g.tenant_id = t.id AND g.cpf = v.guest_cpf AND g.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a
  WHERE a.tenant_id = t.id AND a.type = v.type AND a.label = v.label AND a.deleted_at IS NULL
);

-- -----------------------------------------------------------------------------
-- Lançamentos do Hotel Aurora. Descrição e preço copiados do cardápio, como o
-- POST /accounts/:id/items faz; total = quantity × unit_price (CHECK do banco).
-- Cortesia e consumo interno: billable = false com motivo (RN-007) — só ADMIN e
-- recepção lançam, por isso o autor é o admin. A mesa é do garçom.
-- -----------------------------------------------------------------------------
WITH alvo AS (
  -- conta de cada lançamento: a suíte pela reserva (quarto + data de entrada); as
  -- avulsas pelo rótulo
  SELECT a.id AS account_id, a.tenant_id, 'Suíte 106' AS conta
  FROM accounts a
  JOIN tenants t      ON t.id = a.tenant_id AND t.subdomain = 'aurora'
  JOIN reservations r ON r.id = a.reservation_id
  JOIN rooms rm       ON rm.id = r.room_id AND rm.number = '106'
  WHERE a.type = 'ROOM' AND a.charges_lodging = true AND a.status = 'OPEN'
    AND a.deleted_at IS NULL AND r.check_in_date = '2026-06-15'
  UNION ALL
  SELECT a.id, a.tenant_id, a.label
  FROM accounts a
  JOIN tenants t ON t.id = a.tenant_id AND t.subdomain = 'aurora'
  WHERE a.type IN ('TABLE', 'DAY_USE', 'INTERNAL') AND a.status = 'OPEN' AND a.deleted_at IS NULL
    AND a.label IN ('Mesa 3', 'Day-use — piscina', 'Equipe e perdas — junho')
)
INSERT INTO account_items (tenant_id, account_id, product_id, description, quantity, unit_price, total,
                           billable, reason, created_by, origin, consumed_at)
SELECT al.tenant_id, al.account_id, p.id, p.name, v.quantity, p.price, v.quantity * p.price,
       v.billable, v.reason, u.id, 'ACCOUNT', v.consumed_at::timestamptz
FROM (VALUES
  -- conta,                     produto,                 qtd, faturável, motivo,     autor,                    consumido em
  ('Suíte 106',                 'Cerveja long neck',       4, true,  NULL,         'admin@aurora.example',  '2026-06-15 21:30-03'),
  ('Suíte 106',                 'Porção de fritas',        1, true,  NULL,         'admin@aurora.example',  '2026-06-15 21:30-03'),
  ('Suíte 106',                 'Lavanderia (peça)',       3, true,  NULL,         'admin@aurora.example',  '2026-06-16 09:00-03'),
  ('Suíte 106',                 'Vinho tinto (garrafa)',   1, false, 'COURTESY',   'admin@aurora.example',  '2026-06-15 20:00-03'),
  ('Mesa 3',                    'Almoço executivo',        2, true,  NULL,         'garcom@aurora.example', '2026-06-17 12:15-03'),
  ('Mesa 3',                    'Refrigerante lata',       2, true,  NULL,         'garcom@aurora.example', '2026-06-17 12:15-03'),
  ('Day-use — piscina',         'Caipirinha',              2, true,  NULL,         'admin@aurora.example',  '2026-06-17 11:00-03'),
  ('Day-use — piscina',         'Água mineral 500ml',      3, true,  NULL,         'admin@aurora.example',  '2026-06-17 11:00-03'),
  ('Day-use — piscina',         'Pudim',                   1, false, 'COURTESY',   'admin@aurora.example',  '2026-06-17 13:00-03'),
  ('Equipe e perdas — junho',   'Almoço executivo',        6, false, 'STAFF',      'admin@aurora.example',  '2026-06-10 12:00-03'),
  ('Equipe e perdas — junho',   'Vinho tinto (garrafa)',   1, false, 'LOSS',       'admin@aurora.example',  '2026-06-12 22:00-03'),
  ('Equipe e perdas — junho',   'Água mineral 500ml',     12, false, 'INTERNAL_USE','admin@aurora.example', '2026-06-14 08:00-03')
) AS v(conta, produto, quantity, billable, reason, autor, consumed_at)
JOIN alvo al   ON al.conta = v.conta
JOIN products p ON p.tenant_id = al.tenant_id AND p.name = v.produto AND p.deleted_at IS NULL
JOIN users u    ON u.tenant_id = al.tenant_id AND u.email = v.autor AND u.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM account_items ai
  WHERE ai.account_id = al.account_id AND ai.description = p.name AND ai.consumed_at = v.consumed_at::timestamptz
);

COMMIT;

-- =============================================================================
-- RESUMO DO SEED DA COMANDA
-- users: 1 (garçom) | products: 14 (1 inativo) | accounts: suítes das reservas
-- CHECKED_IN + 3 avulsas | account_items: 12
-- Relatório de consumo interno do Aurora (GET /analytics/internal-consumption):
--   STAFF 270,00 · COURTESY 103,00 · LOSS 89,00 · INTERNAL_USE 60,00
-- =============================================================================
