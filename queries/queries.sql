-- Exemplos de queries (CRUD e agregações)
-- Parâmetro padrão: $1 = tenant_id

-- 1) Buscar reservas por CPF do hóspede
-- Parâmetros: $1 = tenant_id, $2 = cpf
SELECT r.*
FROM reservations r
JOIN guests g ON g.id = r.guest_id
WHERE r.tenant_id = $1 AND g.cpf = $2;

-- 2) Listar quartos disponíveis num intervalo (sem sobreposição de datas)
-- Parâmetros: $1 = tenant_id, $2 = start_date, $3 = end_date
-- Exclui reservas já canceladas ou concluídas — elas não bloqueiam disponibilidade
SELECT r.*
FROM rooms r
LEFT JOIN reservations res ON res.room_id = r.id
  AND NOT (res.check_out_date <= $2 OR res.check_in_date >= $3)  -- overlap
  AND res.status NOT IN ('CANCELLED', 'CHECKED_OUT')             -- ignora encerradas
  AND res.deleted_at IS NULL
WHERE r.tenant_id = $1
  AND res.id IS NULL
  AND r.status = 'AVAILABLE'
  AND r.deleted_at IS NULL;

-- 3) Receita total por tenant por mês
-- Parâmetros: $1 = tenant_id, $2 = year
-- Usa tenant_id direto em payments (sem JOIN extra com reservations)
SELECT date_trunc('month', paid_at) AS month,
       SUM(p.amount)                AS total
FROM payments p
WHERE p.tenant_id = $1
  AND EXTRACT(YEAR FROM p.paid_at) = $2
GROUP BY month
ORDER BY month;

-- 4) Inserir reserva (deve ser executado em transação)
-- START TRANSACTION;
-- INSERT INTO reservations (tenant_id, guest_id, room_id, user_id, check_in_date, check_out_date, status, total_amount)
--   VALUES ($1, $2, $3, $4, $5, $6, 'CONFIRMED', $7);
-- UPDATE rooms SET status = 'OCCUPIED' WHERE id = $3 AND tenant_id = $1;
-- COMMIT;

-- 5) Atualizar status de quarto
UPDATE rooms
SET    status = $1
WHERE  tenant_id = $2
  AND  id = $3;

-- 6) Busca por usuário no login
SELECT *
FROM   users
WHERE  tenant_id = $1
  AND  email = $2
  AND  deleted_at IS NULL
LIMIT  1;

-- 7) Taxa de ocupação por data (ocupação real — não snapshot de status)
-- Calcula proporção de quartos com reserva CONFIRMED ou CHECKED_IN cobrindo a data
-- Parâmetros: $1 = tenant_id, $2 = date
SELECT
  ROUND(
    COUNT(res.id)::numeric / NULLIF(COUNT(r.id), 0) * 100, 1
  ) AS occupancy_pct
FROM rooms r
LEFT JOIN reservations res
  ON  res.room_id      = r.id
  AND res.tenant_id    = r.tenant_id
  AND res.check_in_date  <= $2
  AND res.check_out_date >  $2
  AND res.status IN ('CONFIRMED', 'CHECKED_IN')
  AND res.deleted_at IS NULL
WHERE r.tenant_id  = $1
  AND r.deleted_at IS NULL;
