-- Seed de exemplo para popular o banco com dados fictícios
-- ATENÇÃO: Este seed é apenas para desenvolvimento e demonstração

INSERT INTO tenants (name, subdomain, legal_id) VALUES ('Hotel Aurora', 'aurora', '00.000.000/0001-01');
INSERT INTO tenants (name, subdomain, legal_id) VALUES ('Pousada Sol',  'sol',    '00.000.000/0001-02');

-- Exemplo de categorias e quartos para o tenant 'aurora'
INSERT INTO room_categories (tenant_id, name, capacity, price_per_night)
SELECT id, 'Standard', 2, 120.00 FROM tenants WHERE subdomain = 'aurora' LIMIT 1;

INSERT INTO room_categories (tenant_id, name, capacity, price_per_night)
SELECT id, 'Suite', 4, 320.00 FROM tenants WHERE subdomain = 'aurora' LIMIT 1;

INSERT INTO rooms (tenant_id, category_id, number, floor, status)
SELECT h.id, rc.id, '101', 1, 'AVAILABLE'
FROM tenants h
JOIN room_categories rc ON h.id = rc.tenant_id
WHERE h.subdomain = 'aurora' AND rc.name = 'Standard'
LIMIT 1;

-- ATENÇÃO: password_hash deve ser gerado com bcrypt antes de executar este seed
-- Exemplo Node.js: const hash = await bcrypt.hash('senha123', 10);
-- NÃO use esta senha em produção.
INSERT INTO users (tenant_id, name, email, password_hash, role)
SELECT id,
       'Admin Local',
       'admin@aurora.example',
       '$2b$10$REPLACE_WITH_REAL_BCRYPT_HASH', -- bcrypt.hashSync('senha123', 10)
       'ADMIN'
FROM tenants WHERE subdomain = 'aurora' LIMIT 1;

-- Hóspede e reserva de exemplo
INSERT INTO guests (tenant_id, full_name, cpf, phone, email)
SELECT id, 'João Silva', '11122233344', '+55-11-90000-0000', 'joao@example.com'
FROM tenants WHERE subdomain = 'aurora' LIMIT 1;

-- Observação: para reservas e pagamentos, use transações na aplicação para garantir consistência.
