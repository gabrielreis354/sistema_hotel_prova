-- Exemplos de queries (CRUD e agregações)

-- 1) Buscar reserva por CPF do hóspede
-- Parâmetro: $1 = hotel_id, $2 = cpf
SELECT r.*
FROM reservations r
JOIN guests g ON g.id = r.guest_id
WHERE r.hotel_id = $1 AND g.cpf = $2;

-- 2) Listar quartos disponíveis num intervalo (não existe reserva que se sobreponha)
-- Parâmetros: $1 = hotel_id, $2 = start_date, $3 = end_date
SELECT r.*
FROM rooms r
LEFT JOIN reservations res ON res.room_id = r.id
  AND NOT (res.check_out_date <= $2 OR res.check_in_date >= $3) -- overlap detection
WHERE r.hotel_id = $1 AND res.id IS NULL AND r.status = 'AVAILABLE';

-- 3) Receita total por hotel por mês (agregação)
-- Parâmetros: $1 = hotel_id, $2 = year
SELECT date_trunc('month', paid_at) AS month, SUM(p.amount) AS total
FROM payments p
JOIN reservations r ON r.id = p.reservation_id
WHERE r.hotel_id = $1 AND EXTRACT(YEAR FROM p.paid_at) = $2
GROUP BY month
ORDER BY month;

-- 4) Inserir reserva (exemplo em transação pseudocódigo)
-- START TRANSACTION;
-- INSERT INTO reservations (hotel_id, guest_id, room_id, user_id, check_in_date, check_out_date, status, total_amount) VALUES (...);
-- UPDATE rooms SET status='OCCUPIED' WHERE id = <room_id>;
-- COMMIT;

-- 5) Atualizar status de quarto
UPDATE rooms SET status = $1 WHERE hotel_id = $2 AND id = $3;

-- 6) Busca por usuário (login)
SELECT * FROM users WHERE hotel_id = $1 AND email = $2 LIMIT 1;

-- 7) Exemplo de agregação: média de ocupação (simples)
-- Calcula proporção de quartos ocupados num dia
-- Param: $1 = hotel_id, $2 = date
SELECT (COUNT(r.id) FILTER (WHERE r.status = 'OCCUPIED')::float / NULLIF(COUNT(r.id),0)) AS occupancy_rate
FROM rooms r
WHERE r.hotel_id = $1;
