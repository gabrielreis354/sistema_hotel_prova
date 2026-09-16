-- =============================================================================
-- Consultas Avançadas — JOINs complexos e filtros por período
-- Sistema de Gestão de Hotel (SaaS Multi-Tenant)
-- =============================================================================


-- =============================================================================
-- CONSULTA 1: Quartos disponíveis em um período
-- Importância: operação mais crítica do sistema — executada a cada nova reserva
-- e ao exibir o calendário de disponibilidade ao recepcionista.
-- Otimização: índice idx_rooms_tenant_status + LEFT JOIN que elimina via IS NULL
-- Parâmetros: $1 = tenant_id, $2 = check_in, $3 = check_out
-- =============================================================================
SELECT
    r.id,
    r.number,
    r.floor,
    r.status,
    rc.name            AS category_name,
    rc.capacity,
    rc.price_per_night,
    (DATE($3) - DATE($2)) * rc.price_per_night AS estimated_total
FROM rooms r
JOIN room_categories rc ON rc.id = r.category_id
LEFT JOIN reservations res
    ON  res.room_id  = r.id
    AND res.tenant_id = r.tenant_id
    AND res.status   NOT IN ('CANCELLED', 'CHECKED_OUT')
    AND res.deleted_at IS NULL
    -- Lógica de sobreposição: novo período intercepta reserva existente
    AND NOT (DATE($3) <= res.check_in_date OR DATE($2) >= res.check_out_date)
WHERE r.tenant_id  = $1
  AND r.status     = 'AVAILABLE'
  AND r.deleted_at IS NULL
  AND res.id IS NULL   -- apenas quartos SEM reserva ativa no período
ORDER BY rc.price_per_night, r.number;


-- =============================================================================
-- CONSULTA 2: Painel do dia — reservas de check-in e check-out hoje
-- Importância: primeira tela do recepcionista ao iniciar o turno.
-- Exibe quem chega e quem sai no dia, com dados do hóspede e quarto.
-- Parâmetros: $1 = tenant_id, $2 = data (ex: CURRENT_DATE)
-- =============================================================================
SELECT
    r.id,
    r.status,
    r.check_in_date,
    r.check_out_date,
    r.total_amount,
    g.full_name   AS guest_name,
    g.cpf         AS guest_cpf,
    g.phone       AS guest_phone,
    rm.number     AS room_number,
    rc.name       AS category,
    CASE
        WHEN r.check_in_date  = $2 THEN 'CHECK_IN_HOJE'
        WHEN r.check_out_date = $2 THEN 'CHECK_OUT_HOJE'
    END           AS evento_do_dia
FROM reservations r
JOIN guests          g  ON g.id  = r.guest_id
JOIN rooms           rm ON rm.id = r.room_id
JOIN room_categories rc ON rc.id = rm.category_id
WHERE r.tenant_id = $1
  AND (r.check_in_date = $2 OR r.check_out_date = $2)
  AND r.status NOT IN ('CANCELLED')
  AND r.deleted_at IS NULL
ORDER BY evento_do_dia, g.full_name;


-- =============================================================================
-- CONSULTA 3: Histórico completo de um hóspede
-- Importância: recepcionista consulta histórico ao fazer nova reserva para
-- cliente recorrente. JOIN de 4 tabelas com todos os dados relevantes.
-- Parâmetros: $1 = tenant_id, $2 = guest_id
-- =============================================================================
SELECT
    r.id             AS reservation_id,
    r.check_in_date,
    r.check_out_date,
    r.status,
    r.total_amount,
    rm.number        AS room_number,
    rc.name          AS category,
    rc.price_per_night,
    COALESCE(SUM(p.amount), 0) AS total_pago,
    r.total_amount - COALESCE(SUM(p.amount), 0) AS saldo_devedor
FROM reservations r
JOIN rooms           rm ON rm.id = r.room_id
JOIN room_categories rc ON rc.id = rm.category_id
LEFT JOIN payments    p  ON p.reservation_id = r.id AND p.deleted_at IS NULL
WHERE r.tenant_id = $1
  AND r.guest_id  = $2
  AND r.deleted_at IS NULL
GROUP BY r.id, rm.number, rc.name, rc.price_per_night
ORDER BY r.check_in_date DESC;


-- =============================================================================
-- CONSULTA 4: Busca de hóspede por CPF com reservas ativas
-- Importância: identificação rápida do hóspede no balcão.
-- Mostra dados do hóspede + se tem reserva ativa no momento.
-- Parâmetros: $1 = tenant_id, $2 = cpf
-- =============================================================================
SELECT
    g.id,
    g.full_name,
    g.cpf,
    g.phone,
    g.email,
    r.id             AS reserva_ativa_id,
    r.status         AS reserva_status,
    r.check_in_date,
    r.check_out_date,
    rm.number        AS quarto
FROM guests g
LEFT JOIN reservations r
    ON  r.guest_id  = g.id
    AND r.tenant_id = g.tenant_id
    AND r.status    IN ('CONFIRMED', 'CHECKED_IN')
    AND r.deleted_at IS NULL
LEFT JOIN rooms rm ON rm.id = r.room_id
WHERE g.tenant_id = $1
  AND g.cpf       = $2
  AND g.deleted_at IS NULL;


-- =============================================================================
-- CONSULTA 5: Reservas em conflito com um período (para validação)
-- Importância: verificação de double-booking antes de criar reserva.
-- Usada pelo checkReservationConflict.js no backend.
-- Parâmetros: $1 = tenant_id, $2 = room_id, $3 = check_in, $4 = check_out
-- =============================================================================
SELECT id, status, check_in_date, check_out_date
FROM reservations
WHERE tenant_id      = $1
  AND room_id        = $2
  AND status         NOT IN ('CANCELLED', 'CHECKED_OUT')
  AND deleted_at     IS NULL
  AND check_in_date  < DATE($4)
  AND check_out_date > DATE($3);   -- lógica de sobreposição de intervalos
