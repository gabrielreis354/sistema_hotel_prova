-- =============================================================================
-- Seed de Dados — Sistema de Gestão de Hotel (SaaS Multi-Tenant)
-- Sincronizado com db/schema.sql
--
-- CARACTERÍSTICAS:
--   - Idempotente: pode rodar em banco limpo OU já populado sem erro
--     (ON CONFLICT DO NOTHING em todas as inserções; NOT EXISTS em payments,
--      que não possui constraint única natural).
--   - Referências por sub-SELECT/JOIN (subdomain, cpf, número do quarto) —
--     NUNCA UUID hardcoded.
--   - ~165 registros distribuídos em 2 tenants (Hotel Aurora e Pousada Sol).
--   - Todos os usuários criados têm senha: senha123
--
-- PRÉ-REQUISITO: o schema já deve existir (node command.js migrate
--   ou npm run setup:db).
--
-- IMPORTANTE — constraint EXCLUDE de reservations:
--   O mesmo quarto não pode ter duas reservas com períodos sobrepostos
--   (vale para QUALQUER status). Os dados abaixo respeitam isso: reservas no
--   mesmo quarto usam janelas de datas separadas.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Garante DEFAULTs nas colunas gerenciadas pelo Sequelize em nível de aplicação.
-- Necessário para inserção direta via SQL (seed, scripts de setup).
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['tenants','users','room_categories','rooms','guests','reservations','reservation_rooms','payments']
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT uuid_generate_v4()', tbl);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN created_at SET DEFAULT NOW()', tbl);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN updated_at SET DEFAULT NOW()', tbl);
  END LOOP;
END $$;

-- =============================================================================
-- TENANTS (2 registros)
-- =============================================================================
-- booking_enabled / deposit_percent alimentam o motor de reserva direta.
-- Sinal diferente por hotel demonstra a configuração por tenant (Aurora 30%, Sol 50%).
INSERT INTO tenants (name, subdomain, legal_id, status, booking_enabled, deposit_percent) VALUES
  ('Hotel Aurora', 'aurora', '00.000.000/0001-01', 'ACTIVE', true, 30),
  ('Pousada Sol',  'sol',    '00.000.000/0001-02', 'ACTIVE', true, 50)
ON CONFLICT (subdomain) DO NOTHING;


-- #############################################################################
-- TENANT 1 — HOTEL AURORA
-- #############################################################################

-- -----------------------------------------------------------------------------
-- Categorias do Hotel Aurora (3)
-- -----------------------------------------------------------------------------
INSERT INTO room_categories (tenant_id, name, capacity, price_per_night)
SELECT t.id, v.name, v.capacity, v.price
FROM tenants t
CROSS JOIN (VALUES
  ('Standard',     2, 150.00),
  ('Suite',        4, 350.00),
  ('Presidencial', 6, 800.00)
) AS v(name, capacity, price)
WHERE t.subdomain = 'aurora'
ON CONFLICT (tenant_id, name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Quartos Standard do Hotel Aurora (8: 101-108, andar 1)
-- -----------------------------------------------------------------------------
INSERT INTO rooms (tenant_id, category_id, number, floor, status)
SELECT t.id, rc.id, v.number, v.floor, v.status
FROM tenants t
JOIN room_categories rc ON rc.tenant_id = t.id AND rc.name = 'Standard'
CROSS JOIN (VALUES
  ('101', 1, 'AVAILABLE'),
  ('102', 1, 'AVAILABLE'),
  ('103', 1, 'AVAILABLE'),
  ('104', 1, 'AVAILABLE'),
  ('105', 1, 'AVAILABLE'),
  ('106', 1, 'AVAILABLE'),
  ('107', 1, 'AVAILABLE'),
  ('108', 1, 'AVAILABLE')
) AS v(number, floor, status)
WHERE t.subdomain = 'aurora'
ON CONFLICT (tenant_id, number) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Quartos Suite do Hotel Aurora (5: 201-205, andar 2)
-- -----------------------------------------------------------------------------
INSERT INTO rooms (tenant_id, category_id, number, floor, status)
SELECT t.id, rc.id, v.number, v.floor, v.status
FROM tenants t
JOIN room_categories rc ON rc.tenant_id = t.id AND rc.name = 'Suite'
CROSS JOIN (VALUES
  ('201', 2, 'AVAILABLE'),
  ('202', 2, 'AVAILABLE'),
  ('203', 2, 'AVAILABLE'),
  ('204', 2, 'AVAILABLE'),
  ('205', 2, 'AVAILABLE')
) AS v(number, floor, status)
WHERE t.subdomain = 'aurora'
ON CONFLICT (tenant_id, number) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Quartos Presidencial do Hotel Aurora (2: 301-302, andar 3)
-- -----------------------------------------------------------------------------
INSERT INTO rooms (tenant_id, category_id, number, floor, status)
SELECT t.id, rc.id, v.number, v.floor, v.status
FROM tenants t
JOIN room_categories rc ON rc.tenant_id = t.id AND rc.name = 'Presidencial'
CROSS JOIN (VALUES
  ('301', 3, 'AVAILABLE'),
  ('302', 3, 'AVAILABLE')
) AS v(number, floor, status)
WHERE t.subdomain = 'aurora'
ON CONFLICT (tenant_id, number) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Usuários do Hotel Aurora (3: 1 ADMIN + 2 RECEPTIONIST)
-- Senha: senha123 (hash bcrypt 10 rounds)
-- -----------------------------------------------------------------------------
INSERT INTO users (tenant_id, name, email, password_hash, role)
SELECT t.id, v.name, v.email, '$2a$10$dU7xkr/NZyY00/rPNy6kcu2IiP1FVGg1IXjk/YqzJEmjZsWDwL5jS', v.role
FROM tenants t
CROSS JOIN (VALUES
  ('Admin Aurora',       'admin@aurora.example',  'ADMIN'),
  ('Recepcao Aurora 1',  'recep1@aurora.example', 'RECEPTIONIST'),
  ('Recepcao Aurora 2',  'recep2@aurora.example', 'RECEPTIONIST')
) AS v(name, email, role)
WHERE t.subdomain = 'aurora'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Hóspedes do Hotel Aurora — lote 1 (20: CPFs 30000000001..20)
-- -----------------------------------------------------------------------------
INSERT INTO guests (tenant_id, full_name, cpf, phone, email)
SELECT t.id, v.full_name, v.cpf, v.phone, v.email
FROM tenants t
CROSS JOIN (VALUES
  ('Ana Souza',         '30000000001', '+55-11-91000-0001', 'hospede01@aurora.example'),
  ('Bruno Carvalho',    '30000000002', '+55-11-91000-0002', 'hospede02@aurora.example'),
  ('Carla Mendes',      '30000000003', '+55-11-91000-0003', 'hospede03@aurora.example'),
  ('Diego Almeida',     '30000000004', '+55-11-91000-0004', 'hospede04@aurora.example'),
  ('Eduarda Lima',      '30000000005', '+55-11-91000-0005', 'hospede05@aurora.example'),
  ('Felipe Rocha',      '30000000006', '+55-11-91000-0006', 'hospede06@aurora.example'),
  ('Gabriela Nunes',    '30000000007', '+55-11-91000-0007', 'hospede07@aurora.example'),
  ('Henrique Dias',     '30000000008', '+55-11-91000-0008', 'hospede08@aurora.example'),
  ('Isabela Castro',    '30000000009', '+55-11-91000-0009', 'hospede09@aurora.example'),
  ('Joao Pereira',      '30000000010', '+55-11-91000-0010', 'hospede10@aurora.example'),
  ('Karina Barbosa',    '30000000011', '+55-11-91000-0011', 'hospede11@aurora.example'),
  ('Lucas Martins',     '30000000012', '+55-11-91000-0012', 'hospede12@aurora.example'),
  ('Mariana Ferreira',  '30000000013', '+55-11-91000-0013', 'hospede13@aurora.example'),
  ('Nelson Ribeiro',    '30000000014', '+55-11-91000-0014', 'hospede14@aurora.example'),
  ('Olivia Cardoso',    '30000000015', '+55-11-91000-0015', 'hospede15@aurora.example'),
  ('Paulo Teixeira',    '30000000016', '+55-11-91000-0016', 'hospede16@aurora.example'),
  ('Quiteria Gomes',    '30000000017', '+55-11-91000-0017', 'hospede17@aurora.example'),
  ('Rafael Moreira',    '30000000018', '+55-11-91000-0018', 'hospede18@aurora.example'),
  ('Sabrina Pinto',     '30000000019', '+55-11-91000-0019', 'hospede19@aurora.example'),
  ('Thiago Araujo',     '30000000020', '+55-11-91000-0020', 'hospede20@aurora.example')
) AS v(full_name, cpf, phone, email)
WHERE t.subdomain = 'aurora'
ON CONFLICT (tenant_id, cpf) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Hóspedes do Hotel Aurora — lote 2 (20: CPFs 30000000021..40)
-- -----------------------------------------------------------------------------
INSERT INTO guests (tenant_id, full_name, cpf, phone, email)
SELECT t.id, v.full_name, v.cpf, v.phone, v.email
FROM tenants t
CROSS JOIN (VALUES
  ('Ursula Campos',       '30000000021', '+55-11-91000-0021', 'hospede21@aurora.example'),
  ('Vinicius Lopes',      '30000000022', '+55-11-91000-0022', 'hospede22@aurora.example'),
  ('Wesley Freitas',      '30000000023', '+55-11-91000-0023', 'hospede23@aurora.example'),
  ('Xenia Duarte',        '30000000024', '+55-11-91000-0024', 'hospede24@aurora.example'),
  ('Yara Monteiro',       '30000000025', '+55-11-91000-0025', 'hospede25@aurora.example'),
  ('Zeca Andrade',        '30000000026', '+55-11-91000-0026', 'hospede26@aurora.example'),
  ('Amanda Correia',      '30000000027', '+55-11-91000-0027', 'hospede27@aurora.example'),
  ('Beatriz Fonseca',     '30000000028', '+55-11-91000-0028', 'hospede28@aurora.example'),
  ('Caio Ramos',          '30000000029', '+55-11-91000-0029', 'hospede29@aurora.example'),
  ('Daniela Vieira',      '30000000030', '+55-11-91000-0030', 'hospede30@aurora.example'),
  ('Emerson Pacheco',     '30000000031', '+55-11-91000-0031', 'hospede31@aurora.example'),
  ('Fernanda Cunha',      '30000000032', '+55-11-91000-0032', 'hospede32@aurora.example'),
  ('Gustavo Tavares',     '30000000033', '+55-11-91000-0033', 'hospede33@aurora.example'),
  ('Helena Barros',       '30000000034', '+55-11-91000-0034', 'hospede34@aurora.example'),
  ('Icaro Macedo',        '30000000035', '+55-11-91000-0035', 'hospede35@aurora.example'),
  ('Julia Sales',         '30000000036', '+55-11-91000-0036', 'hospede36@aurora.example'),
  ('Kleber Antunes',      '30000000037', '+55-11-91000-0037', 'hospede37@aurora.example'),
  ('Leticia Farias',      '30000000038', '+55-11-91000-0038', 'hospede38@aurora.example'),
  ('Marcelo Bittencourt', '30000000039', '+55-11-91000-0039', 'hospede39@aurora.example'),
  ('Natalia Siqueira',    '30000000040', '+55-11-91000-0040', 'hospede40@aurora.example')
) AS v(full_name, cpf, phone, email)
WHERE t.subdomain = 'aurora'
ON CONFLICT (tenant_id, cpf) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Reservas do Hotel Aurora (25)
-- Distribuição: 8 CHECKED_OUT, 4 CHECKED_IN, 5 CONFIRMED, 5 PENDING, 3 CANCELLED.
-- user_id = admin@aurora.example. guest/room resolvidos por cpf/número.
-- Janelas de datas separadas por quarto (respeita o EXCLUDE).
-- -----------------------------------------------------------------------------
INSERT INTO reservations (tenant_id, guest_id, room_id, user_id, check_in_date, check_out_date, status, total_amount)
SELECT t.id, g.id, rm.id, u.id, v.check_in::date, v.check_out::date, v.status, v.total
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'admin@aurora.example'
CROSS JOIN (VALUES
  -- CHECKED_OUT (8)
  ('30000000001','101','2026-01-05','2026-01-08','CHECKED_OUT', 450.00),
  ('30000000001','102','2026-01-10','2026-01-12','CHECKED_OUT', 300.00),
  ('30000000002','103','2026-01-15','2026-01-20','CHECKED_OUT', 750.00),
  ('30000000003','201','2026-02-01','2026-02-05','CHECKED_OUT', 1400.00),
  ('30000000001','202','2026-02-10','2026-02-12','CHECKED_OUT', 700.00),
  ('30000000004','301','2026-02-15','2026-02-18','CHECKED_OUT', 2400.00),
  ('30000000005','104','2026-03-01','2026-03-04','CHECKED_OUT', 450.00),
  ('30000000002','105','2026-03-10','2026-03-15','CHECKED_OUT', 750.00),
  -- CHECKED_IN (4)
  ('30000000006','106','2026-06-15','2026-06-20','CHECKED_IN', 750.00),
  ('30000000007','107','2026-06-16','2026-06-19','CHECKED_IN', 450.00),
  ('30000000008','203','2026-06-14','2026-06-18','CHECKED_IN', 1400.00),
  ('30000000009','302','2026-06-17','2026-06-21','CHECKED_IN', 3200.00),
  -- CONFIRMED (5)
  ('30000000010','108','2026-07-01','2026-07-05','CONFIRMED', 600.00),
  ('30000000011','204','2026-07-10','2026-07-14','CONFIRMED', 1400.00),
  ('30000000012','205','2026-08-01','2026-08-03','CONFIRMED', 700.00),
  ('30000000001','101','2026-08-10','2026-08-14','CONFIRMED', 600.00),
  ('30000000013','301','2026-09-01','2026-09-05','CONFIRMED', 3200.00),
  -- PENDING (5)
  ('30000000014','102','2026-09-10','2026-09-12','PENDING', 300.00),
  ('30000000015','103','2026-10-01','2026-10-04','PENDING', 450.00),
  ('30000000016','201','2026-10-10','2026-10-15','PENDING', 1750.00),
  ('30000000017','202','2026-11-01','2026-11-03','PENDING', 700.00),
  ('30000000018','104','2026-11-10','2026-11-13','PENDING', 450.00),
  -- CANCELLED (3)
  ('30000000019','105','2027-01-05','2027-01-08','CANCELLED', 450.00),
  ('30000000020','203','2027-02-01','2027-02-04','CANCELLED', 1050.00),
  ('30000000021','302','2027-03-01','2027-03-05','CANCELLED', 3200.00)
) AS v(guest_cpf, room_number, check_in, check_out, status, total)
JOIN guests g ON g.tenant_id = t.id AND g.cpf = v.guest_cpf
JOIN rooms  rm ON rm.tenant_id = t.id AND rm.number = v.room_number
WHERE t.subdomain = 'aurora'
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Pagamentos do Hotel Aurora (18) — vinculados a reservas
-- CHECKED_OUT/CHECKED_IN/CONFIRMED. A reserva é identificada por (quarto,
-- check_in_date), combinação única graças ao EXCLUDE. Guarda NOT EXISTS torna
-- a inserção idempotente (payments não tem constraint única natural).
-- -----------------------------------------------------------------------------
INSERT INTO payments (tenant_id, reservation_id, amount, method, paid_at)
SELECT t.id, res.id, v.amount, v.method, v.paid_at::timestamptz
FROM tenants t
CROSS JOIN (VALUES
  ('101','2026-01-05', 450.00, 'PIX',      '2026-01-08 11:00'),
  ('102','2026-01-10', 300.00, 'DINHEIRO', '2026-01-12 11:00'),
  ('103','2026-01-15', 750.00, 'CARTAO',   '2026-01-20 11:00'),
  ('201','2026-02-01', 1400.00,'PIX',      '2026-02-05 11:00'),
  ('202','2026-02-10', 700.00, 'CARTAO',   '2026-02-12 11:00'),
  ('301','2026-02-15', 2400.00,'PIX',      '2026-02-18 11:00'),
  ('104','2026-03-01', 450.00, 'DINHEIRO', '2026-03-04 11:00'),
  ('105','2026-03-10', 750.00, 'CARTAO',   '2026-03-15 11:00'),
  ('106','2026-06-15', 750.00, 'PIX',      '2026-06-15 15:00'),
  ('107','2026-06-16', 450.00, 'CARTAO',   '2026-06-16 15:00'),
  ('203','2026-06-14', 1400.00,'PIX',      '2026-06-14 15:00'),
  ('302','2026-06-17', 3200.00,'CARTAO',   '2026-06-17 15:00'),
  ('108','2026-07-01', 600.00, 'PIX',      '2026-06-20 10:00'),
  ('204','2026-07-10', 700.00, 'PIX',      '2026-06-25 10:00'),
  ('204','2026-07-10', 700.00, 'DINHEIRO', '2026-07-10 14:00'),
  ('205','2026-08-01', 700.00, 'CARTAO',   '2026-07-15 10:00'),
  ('101','2026-08-10', 600.00, 'PIX',      '2026-07-20 10:00'),
  ('301','2026-09-01', 3200.00,'CARTAO',   '2026-08-01 10:00')
) AS v(room_number, check_in, amount, method, paid_at)
JOIN rooms rm ON rm.tenant_id = t.id AND rm.number = v.room_number
JOIN reservations res ON res.tenant_id = t.id AND res.room_id = rm.id AND res.check_in_date = v.check_in::date
WHERE t.subdomain = 'aurora'
  AND NOT EXISTS (
    SELECT 1 FROM payments p
    WHERE p.reservation_id = res.id
      AND p.amount  = v.amount
      AND p.paid_at = v.paid_at::timestamptz
  )
ON CONFLICT DO NOTHING;


-- #############################################################################
-- TENANT 2 — POUSADA SOL
-- #############################################################################

-- -----------------------------------------------------------------------------
-- Categorias da Pousada Sol (2)
-- -----------------------------------------------------------------------------
INSERT INTO room_categories (tenant_id, name, capacity, price_per_night)
SELECT t.id, v.name, v.capacity, v.price
FROM tenants t
CROSS JOIN (VALUES
  ('Basico',   2, 120.00),
  ('Conforto', 3, 220.00)
) AS v(name, capacity, price)
WHERE t.subdomain = 'sol'
ON CONFLICT (tenant_id, name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Quartos Básico da Pousada Sol (7: 1-7, andar 1)
-- -----------------------------------------------------------------------------
INSERT INTO rooms (tenant_id, category_id, number, floor, status)
SELECT t.id, rc.id, v.number, v.floor, v.status
FROM tenants t
JOIN room_categories rc ON rc.tenant_id = t.id AND rc.name = 'Basico'
CROSS JOIN (VALUES
  ('1', 1, 'AVAILABLE'),
  ('2', 1, 'AVAILABLE'),
  ('3', 1, 'AVAILABLE'),
  ('4', 1, 'AVAILABLE'),
  ('5', 1, 'AVAILABLE'),
  ('6', 1, 'AVAILABLE'),
  ('7', 1, 'AVAILABLE')
) AS v(number, floor, status)
WHERE t.subdomain = 'sol'
ON CONFLICT (tenant_id, number) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Quartos Conforto da Pousada Sol (3: 8-10, andar 2)
-- -----------------------------------------------------------------------------
INSERT INTO rooms (tenant_id, category_id, number, floor, status)
SELECT t.id, rc.id, v.number, v.floor, v.status
FROM tenants t
JOIN room_categories rc ON rc.tenant_id = t.id AND rc.name = 'Conforto'
CROSS JOIN (VALUES
  ('8',  2, 'AVAILABLE'),
  ('9',  2, 'AVAILABLE'),
  ('10', 2, 'AVAILABLE')
) AS v(number, floor, status)
WHERE t.subdomain = 'sol'
ON CONFLICT (tenant_id, number) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Usuários da Pousada Sol (2: 1 ADMIN + 1 RECEPTIONIST)
-- Senha: senha123 (hash bcrypt 10 rounds)
-- -----------------------------------------------------------------------------
INSERT INTO users (tenant_id, name, email, password_hash, role)
SELECT t.id, v.name, v.email, '$2a$10$dU7xkr/NZyY00/rPNy6kcu2IiP1FVGg1IXjk/YqzJEmjZsWDwL5jS', v.role
FROM tenants t
CROSS JOIN (VALUES
  ('Admin Sol',      'admin@sol.example',  'ADMIN'),
  ('Recepcao Sol 1', 'recep1@sol.example', 'RECEPTIONIST')
) AS v(name, email, role)
WHERE t.subdomain = 'sol'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Hóspedes da Pousada Sol (20: CPFs 40000000001..20)
-- -----------------------------------------------------------------------------
INSERT INTO guests (tenant_id, full_name, cpf, phone, email)
SELECT t.id, v.full_name, v.cpf, v.phone, v.email
FROM tenants t
CROSS JOIN (VALUES
  ('Otavio Guerra',         '40000000001', '+55-21-92000-0001', 'hospede01@sol.example'),
  ('Patricia Nobrega',      '40000000002', '+55-21-92000-0002', 'hospede02@sol.example'),
  ('Renato Aguiar',         '40000000003', '+55-21-92000-0003', 'hospede03@sol.example'),
  ('Simone Bastos',         '40000000004', '+55-21-92000-0004', 'hospede04@sol.example'),
  ('Tadeu Vasconcelos',     '40000000005', '+55-21-92000-0005', 'hospede05@sol.example'),
  ('Ulisses Prado',         '40000000006', '+55-21-92000-0006', 'hospede06@sol.example'),
  ('Vanessa Quintana',      '40000000007', '+55-21-92000-0007', 'hospede07@sol.example'),
  ('Wagner Cordeiro',       '40000000008', '+55-21-92000-0008', 'hospede08@sol.example'),
  ('Yasmin Galvao',         '40000000009', '+55-21-92000-0009', 'hospede09@sol.example'),
  ('Zelia Maia',            '40000000010', '+55-21-92000-0010', 'hospede10@sol.example'),
  ('Andre Brito',           '40000000011', '+55-21-92000-0011', 'hospede11@sol.example'),
  ('Bianca Resende',        '40000000012', '+55-21-92000-0012', 'hospede12@sol.example'),
  ('Cesar Lemos',           '40000000013', '+55-21-92000-0013', 'hospede13@sol.example'),
  ('Debora Peixoto',        '40000000014', '+55-21-92000-0014', 'hospede14@sol.example'),
  ('Elias Furtado',         '40000000015', '+55-21-92000-0015', 'hospede15@sol.example'),
  ('Flavia Coelho',         '40000000016', '+55-21-92000-0016', 'hospede16@sol.example'),
  ('Geraldo Sa',            '40000000017', '+55-21-92000-0017', 'hospede17@sol.example'),
  ('Heloisa Regis',         '40000000018', '+55-21-92000-0018', 'hospede18@sol.example'),
  ('Iuri Bezerra',          '40000000019', '+55-21-92000-0019', 'hospede19@sol.example'),
  ('Junia Valente',         '40000000020', '+55-21-92000-0020', 'hospede20@sol.example')
) AS v(full_name, cpf, phone, email)
WHERE t.subdomain = 'sol'
ON CONFLICT (tenant_id, cpf) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Reservas da Pousada Sol (15)
-- Distribuição: 5 CHECKED_OUT, 2 CHECKED_IN, 3 CONFIRMED, 3 PENDING, 2 CANCELLED.
-- -----------------------------------------------------------------------------
INSERT INTO reservations (tenant_id, guest_id, room_id, user_id, check_in_date, check_out_date, status, total_amount)
SELECT t.id, g.id, rm.id, u.id, v.check_in::date, v.check_out::date, v.status, v.total
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'admin@sol.example'
CROSS JOIN (VALUES
  -- CHECKED_OUT (5)
  ('40000000001','1', '2026-01-05','2026-01-08','CHECKED_OUT', 360.00),
  ('40000000001','2', '2026-01-10','2026-01-13','CHECKED_OUT', 360.00),
  ('40000000002','8', '2026-02-01','2026-02-04','CHECKED_OUT', 660.00),
  ('40000000003','3', '2026-02-10','2026-02-12','CHECKED_OUT', 240.00),
  ('40000000004','9', '2026-03-01','2026-03-05','CHECKED_OUT', 880.00),
  -- CHECKED_IN (2)
  ('40000000005','4', '2026-06-15','2026-06-18','CHECKED_IN', 360.00),
  ('40000000006','10','2026-06-16','2026-06-20','CHECKED_IN', 880.00),
  -- CONFIRMED (3)
  ('40000000001','5', '2026-07-01','2026-07-04','CONFIRMED', 360.00),
  ('40000000007','6', '2026-07-10','2026-07-13','CONFIRMED', 360.00),
  ('40000000008','8', '2026-08-01','2026-08-05','CONFIRMED', 880.00),
  -- PENDING (3)
  ('40000000009','7', '2026-09-01','2026-09-03','PENDING', 240.00),
  ('40000000010','1', '2026-09-10','2026-09-13','PENDING', 360.00),
  ('40000000011','9', '2026-10-01','2026-10-04','PENDING', 660.00),
  -- CANCELLED (2)
  ('40000000012','2', '2027-01-05','2027-01-08','CANCELLED', 360.00),
  ('40000000013','10','2027-02-01','2027-02-04','CANCELLED', 660.00)
) AS v(guest_cpf, room_number, check_in, check_out, status, total)
JOIN guests g ON g.tenant_id = t.id AND g.cpf = v.guest_cpf
JOIN rooms  rm ON rm.tenant_id = t.id AND rm.number = v.room_number
WHERE t.subdomain = 'sol'
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Pagamentos da Pousada Sol (10)
-- -----------------------------------------------------------------------------
INSERT INTO payments (tenant_id, reservation_id, amount, method, paid_at)
SELECT t.id, res.id, v.amount, v.method, v.paid_at::timestamptz
FROM tenants t
CROSS JOIN (VALUES
  ('1', '2026-01-05', 360.00, 'PIX',      '2026-01-08 11:00'),
  ('2', '2026-01-10', 360.00, 'DINHEIRO', '2026-01-13 11:00'),
  ('8', '2026-02-01', 660.00, 'CARTAO',   '2026-02-04 11:00'),
  ('3', '2026-02-10', 240.00, 'PIX',      '2026-02-12 11:00'),
  ('9', '2026-03-01', 880.00, 'CARTAO',   '2026-03-05 11:00'),
  ('4', '2026-06-15', 360.00, 'PIX',      '2026-06-15 15:00'),
  ('10','2026-06-16', 880.00, 'CARTAO',   '2026-06-16 15:00'),
  ('5', '2026-07-01', 360.00, 'PIX',      '2026-06-20 10:00'),
  ('6', '2026-07-10', 360.00, 'DINHEIRO', '2026-06-25 10:00'),
  ('8', '2026-08-01', 880.00, 'PIX',      '2026-07-15 10:00')
) AS v(room_number, check_in, amount, method, paid_at)
JOIN rooms rm ON rm.tenant_id = t.id AND rm.number = v.room_number
JOIN reservations res ON res.tenant_id = t.id AND res.room_id = rm.id AND res.check_in_date = v.check_in::date
WHERE t.subdomain = 'sol'
  AND NOT EXISTS (
    SELECT 1 FROM payments p
    WHERE p.reservation_id = res.id
      AND p.amount  = v.amount
      AND p.paid_at = v.paid_at::timestamptz
  )
ON CONFLICT DO NOTHING;

COMMIT;

-- =============================================================================
-- RESUMO DO SEED
-- tenants: 2 | room_categories: 5 | rooms: 25 | users: 5
-- guests: 60 | reservations: 40 | payments: 28
-- TOTAL: 165 registros
-- =============================================================================
