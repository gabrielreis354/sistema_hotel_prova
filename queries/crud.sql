-- =============================================================================
-- CRUD — Operações básicas do sistema
-- Sistema de Gestão de Hotel (SaaS Multi-Tenant)
-- Parâmetro padrão: $1 = tenant_id (obrigatório em todas as queries)
-- =============================================================================


-- =============================================================================
-- GUESTS (Hóspedes)
-- =============================================================================

-- Criar hóspede
INSERT INTO guests (tenant_id, full_name, cpf, phone, email)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- Listar hóspedes do tenant (excluindo soft-deleted)
SELECT id, full_name, cpf, phone, email, created_at
FROM guests
WHERE tenant_id = $1
  AND deleted_at IS NULL
ORDER BY full_name;

-- Buscar hóspede por ID
SELECT *
FROM guests
WHERE id = $2
  AND tenant_id = $1
  AND deleted_at IS NULL;

-- Buscar hóspede por CPF
SELECT *
FROM guests
WHERE tenant_id = $1
  AND cpf = $2
  AND deleted_at IS NULL;

-- Atualizar hóspede
UPDATE guests
SET    full_name  = COALESCE($3, full_name),
       phone      = COALESCE($4, phone),
       email      = COALESCE($5, email)
WHERE  id = $2
  AND  tenant_id = $1
  AND  deleted_at IS NULL;

-- Soft delete de hóspede
UPDATE guests
SET    deleted_at = now()
WHERE  id = $2
  AND  tenant_id = $1
  AND  deleted_at IS NULL;


-- =============================================================================
-- ROOMS (Quartos)
-- =============================================================================

-- Criar quarto
INSERT INTO rooms (tenant_id, category_id, number, floor, status)
VALUES ($1, $2, $3, $4, 'AVAILABLE')
RETURNING *;

-- Listar quartos do tenant
SELECT r.*, rc.name AS category_name, rc.price_per_night
FROM rooms r
JOIN room_categories rc ON rc.id = r.category_id
WHERE r.tenant_id = $1
  AND r.deleted_at IS NULL
ORDER BY r.number;

-- Buscar quarto por ID
SELECT r.*, rc.name AS category_name, rc.price_per_night, rc.capacity
FROM rooms r
JOIN room_categories rc ON rc.id = r.category_id
WHERE r.id = $2
  AND r.tenant_id = $1
  AND r.deleted_at IS NULL;

-- Atualizar status do quarto
UPDATE rooms
SET    status = $3
WHERE  id = $2
  AND  tenant_id = $1;

-- Soft delete de quarto
UPDATE rooms
SET    deleted_at = now()
WHERE  id = $2
  AND  tenant_id = $1
  AND  deleted_at IS NULL;


-- =============================================================================
-- RESERVATIONS (Reservas)
-- =============================================================================

-- Criar reserva
INSERT INTO reservations (tenant_id, guest_id, room_id, user_id, check_in_date, check_out_date, total_amount, status)
VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
RETURNING *;

-- Listar reservas do tenant
SELECT r.*, g.full_name AS guest_name, rm.number AS room_number
FROM reservations r
JOIN guests g ON g.id = r.guest_id
JOIN rooms  rm ON rm.id = r.room_id
WHERE r.tenant_id = $1
  AND r.deleted_at IS NULL
ORDER BY r.check_in_date;

-- Buscar reserva por ID
SELECT r.*, g.full_name AS guest_name, rm.number AS room_number
FROM reservations r
JOIN guests g  ON g.id = r.guest_id
JOIN rooms  rm ON rm.id = r.room_id
WHERE r.id = $2
  AND r.tenant_id = $1
  AND r.deleted_at IS NULL;

-- Confirmar reserva (PENDING → CONFIRMED)
UPDATE reservations
SET    status = 'CONFIRMED'
WHERE  id = $2
  AND  tenant_id = $1
  AND  status = 'PENDING';

-- Check-in (CONFIRMED → CHECKED_IN)
UPDATE reservations
SET    status = 'CHECKED_IN'
WHERE  id = $2
  AND  tenant_id = $1
  AND  status = 'CONFIRMED';

-- Check-out (CHECKED_IN → CHECKED_OUT)
UPDATE reservations
SET    status = 'CHECKED_OUT'
WHERE  id = $2
  AND  tenant_id = $1
  AND  status = 'CHECKED_IN';

-- Cancelar reserva
UPDATE reservations
SET    status = 'CANCELLED'
WHERE  id = $2
  AND  tenant_id = $1
  AND  status IN ('PENDING', 'CONFIRMED');


-- =============================================================================
-- PAYMENTS (Pagamentos)
-- =============================================================================

-- Registrar pagamento
INSERT INTO payments (tenant_id, reservation_id, amount, method)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- Listar pagamentos de uma reserva
SELECT *
FROM payments
WHERE reservation_id = $2
  AND tenant_id = $1
  AND deleted_at IS NULL
ORDER BY paid_at;

-- Buscar pagamento por ID
SELECT *
FROM payments
WHERE id = $2
  AND tenant_id = $1
  AND deleted_at IS NULL;

-- Soft delete de pagamento
UPDATE payments
SET    deleted_at = now()
WHERE  id = $2
  AND  tenant_id = $1
  AND  deleted_at IS NULL;


-- =============================================================================
-- ROOM CATEGORIES (Categorias)
-- =============================================================================

-- Criar categoria
INSERT INTO room_categories (tenant_id, name, capacity, price_per_night)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- Listar categorias do tenant
SELECT *
FROM room_categories
WHERE tenant_id = $1
  AND deleted_at IS NULL
ORDER BY name;

-- Atualizar preço de categoria
UPDATE room_categories
SET    price_per_night = $3
WHERE  id = $2
  AND  tenant_id = $1
  AND  deleted_at IS NULL;

-- Soft delete de categoria
UPDATE room_categories
SET    deleted_at = now()
WHERE  id = $2
  AND  tenant_id = $1
  AND  deleted_at IS NULL;
