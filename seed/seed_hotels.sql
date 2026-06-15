-- Seed de exemplo — Sistema de Gestão de Hotel
-- Sincronizado com db/schema.sql em 2026-06-08
-- ATENÇÃO: Requer que o schema já tenha sido criado (npm run setup:db ou node command.js migrate)

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Tenants (SaaS)
INSERT INTO tenants (name, subdomain, legal_id, status) VALUES
  ('Hotel Aurora', 'aurora', '00.000.000/0001-01', 'ACTIVE'),
  ('Pousada Sol',  'sol',    '00.000.000/0001-02', 'ACTIVE')
ON CONFLICT (subdomain) DO UPDATE SET
  name     = EXCLUDED.name,
  legal_id = EXCLUDED.legal_id;

-- Categorias de quarto (Hotel Aurora)
INSERT INTO room_categories (tenant_id, name, capacity, price_per_night)
SELECT h.id, 'Standard', 2, 120.00
FROM tenants h WHERE h.subdomain = 'aurora'
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO room_categories (tenant_id, name, capacity, price_per_night)
SELECT h.id, 'Suite', 4, 320.00
FROM tenants h WHERE h.subdomain = 'aurora'
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Quartos (Hotel Aurora)
INSERT INTO rooms (tenant_id, category_id, number, floor, status)
SELECT h.id, rc.id, '101', 1, 'AVAILABLE'
FROM tenants h
JOIN room_categories rc ON rc.tenant_id = h.id
WHERE h.subdomain = 'aurora' AND rc.name = 'Standard'
ON CONFLICT (tenant_id, number) DO NOTHING;

INSERT INTO rooms (tenant_id, category_id, number, floor, status)
SELECT h.id, rc.id, '201', 2, 'AVAILABLE'
FROM tenants h
JOIN room_categories rc ON rc.tenant_id = h.id
WHERE h.subdomain = 'aurora' AND rc.name = 'Suite'
ON CONFLICT (tenant_id, number) DO NOTHING;

-- Usuário ADMIN (Hotel Aurora)
-- ATENÇÃO: substitua 'HASHED_PASSWORD_PLACEHOLDER' por um hash bcrypt real.
-- Exemplo: node -e "const b=require('bcryptjs'); b.hash('senha123',10).then(console.log)"
INSERT INTO users (tenant_id, name, email, password_hash, role)
SELECT h.id, 'Admin Aurora', 'admin@aurora.example', 'HASHED_PASSWORD_PLACEHOLDER', 'ADMIN'
FROM tenants h WHERE h.subdomain = 'aurora'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- Hóspede de exemplo (Hotel Aurora)
INSERT INTO guests (tenant_id, full_name, cpf, phone, email)
SELECT h.id, 'João Silva', '11122233344', '+55-11-90000-0000', 'joao@example.com'
FROM tenants h WHERE h.subdomain = 'aurora'
ON CONFLICT DO NOTHING;

COMMIT;
