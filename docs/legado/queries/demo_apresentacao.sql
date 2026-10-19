-- =============================================================================
-- DEMO DE APRESENTAÇÃO — Banco de Dados (roteiro do vídeo)
-- Sistema de Gestão de Hotel (SaaS Multi-Tenant)
--
-- COMO USAR (no terminal Ubuntu/WSL — NÃO no PowerShell):
--   kubectl exec -it -n hotel-system statefulset/postgres -- \
--     psql -U hotel_user -d gestao_hotel -f - < queries/demo_apresentacao.sql
--
--   OU abra o psql e cole bloco a bloco durante a gravação:
--   kubectl exec -it -n hotel-system statefulset/postgres -- psql -U hotel_user -d gestao_hotel
--
-- Todas as consultas usam CHAVES NATURAIS (subdomain, cpf, número do quarto),
-- não UUIDs — então funcionam em QUALQUER banco recém-semeado (idempotente).
-- Tenant usado na demo: Hotel Aurora (subdomain 'aurora').
-- =============================================================================


-- =============================================================================
-- [06:00] CONSULTA 1 — Quartos disponíveis em um período
-- Operação mais crítica do sistema: executada a cada nova reserva.
-- LEFT JOIN + IS NULL (anti-semi-join) lista só os quartos SEM reserva ativa.
-- =============================================================================
SELECT
    r.number,
    rc.name            AS categoria,
    rc.capacity,
    rc.price_per_night,
    (DATE '2027-03-04' - DATE '2027-03-01') * rc.price_per_night AS total_estimado
FROM rooms r
JOIN room_categories rc ON rc.id = r.category_id
LEFT JOIN reservations res
    ON  res.room_id   = r.id
    AND res.tenant_id = r.tenant_id
    AND res.status    NOT IN ('CANCELLED', 'CHECKED_OUT')
    AND res.deleted_at IS NULL
    AND NOT (DATE '2027-03-04' <= res.check_in_date OR DATE '2027-03-01' >= res.check_out_date)
WHERE r.tenant_id = (SELECT id FROM tenants WHERE subdomain = 'aurora')
  AND r.status = 'AVAILABLE'
  AND r.deleted_at IS NULL
  AND res.id IS NULL
ORDER BY rc.price_per_night, r.number;


-- =============================================================================
-- [06:00] CONSULTA 2 — Painel do dia (check-ins e check-outs de uma data)
-- Primeira tela do recepcionista no turno. JOIN de 4 tabelas.
-- Data 2026-08-10: Ana Souza faz check-in no quarto 101.
-- =============================================================================
SELECT
    g.full_name   AS hospede,
    g.cpf,
    rm.number     AS quarto,
    rc.name       AS categoria,
    r.check_in_date,
    r.check_out_date,
    CASE
        WHEN r.check_in_date  = DATE '2026-08-10' THEN 'CHECK_IN_HOJE'
        WHEN r.check_out_date = DATE '2026-08-10' THEN 'CHECK_OUT_HOJE'
    END           AS evento_do_dia
FROM reservations r
JOIN guests          g  ON g.id  = r.guest_id
JOIN rooms           rm ON rm.id = r.room_id
JOIN room_categories rc ON rc.id = rm.category_id
WHERE r.tenant_id = (SELECT id FROM tenants WHERE subdomain = 'aurora')
  AND (r.check_in_date = DATE '2026-08-10' OR r.check_out_date = DATE '2026-08-10')
  AND r.status NOT IN ('CANCELLED')
  AND r.deleted_at IS NULL
ORDER BY evento_do_dia, g.full_name;


-- =============================================================================
-- [06:00] CONSULTA 3 — Receita total por mês (AGREGAÇÃO)
-- Relatório financeiro mensal. date_trunc + SUM + AVG (ticket médio).
-- =============================================================================
SELECT
    TO_CHAR(date_trunc('month', p.paid_at), 'MM/YYYY') AS mes_ano,
    COUNT(p.id)             AS qtd_pagamentos,
    SUM(p.amount)           AS receita_total,
    ROUND(AVG(p.amount), 2) AS ticket_medio
FROM payments p
WHERE p.tenant_id = (SELECT id FROM tenants WHERE subdomain = 'aurora')
  AND p.deleted_at IS NULL
GROUP BY date_trunc('month', p.paid_at)
ORDER BY date_trunc('month', p.paid_at) DESC;


-- =============================================================================
-- [06:00] CONSULTA 4 — Taxa de ocupação em uma data (KPI)
-- (quartos ocupados / quartos totais) * 100, com NULLIF anti-divisão-por-zero.
-- Alimenta o endpoint GET /analytics/occupancy.
-- =============================================================================
SELECT
    DATE '2026-08-10'           AS data_referencia,
    COUNT(DISTINCT rm.id)       AS quartos_totais,
    COUNT(DISTINCT res.room_id) AS quartos_ocupados,
    ROUND(
        COUNT(DISTINCT res.room_id)::numeric
        / NULLIF(COUNT(DISTINCT rm.id), 0) * 100
    , 2) AS taxa_ocupacao_pct
FROM rooms rm
LEFT JOIN reservations res
    ON  res.room_id   = rm.id
    AND res.tenant_id = rm.tenant_id
    AND res.status    IN ('CONFIRMED', 'CHECKED_IN')
    AND res.deleted_at IS NULL
    AND DATE '2026-08-10' >= res.check_in_date
    AND DATE '2026-08-10' <  res.check_out_date
WHERE rm.tenant_id = (SELECT id FROM tenants WHERE subdomain = 'aurora')
  AND rm.deleted_at IS NULL;


-- =============================================================================
-- [06:00] CONSULTA 5 — Top hóspedes por número de estadias
-- Base para programa de fidelidade. GROUP BY guest_id com SUM do gasto.
-- Alimenta o endpoint GET /analytics/top-guests.
-- =============================================================================
SELECT
    g.full_name           AS hospede,
    g.cpf,
    COUNT(r.id)           AS total_estadias,
    SUM(r.total_amount)   AS valor_total_gasto,
    MIN(r.check_in_date)  AS primeira_estadia,
    MAX(r.check_out_date) AS ultima_estadia
FROM guests g
JOIN reservations r
    ON  r.guest_id  = g.id
    AND r.tenant_id = g.tenant_id
    AND r.status    IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT')
    AND r.deleted_at IS NULL
WHERE g.tenant_id = (SELECT id FROM tenants WHERE subdomain = 'aurora')
  AND g.deleted_at IS NULL
GROUP BY g.id, g.full_name, g.cpf
ORDER BY total_estadias DESC, valor_total_gasto DESC
LIMIT 10;


-- =============================================================================
-- [EXTRA] DEMONSTRAÇÃO AO VIVO — Exclusion Constraint (anti-double-booking)
-- Tenta criar uma reserva conflitante no quarto 101 (já tem CONFIRMED de
-- 2026-08-10 a 2026-08-14). O PostgreSQL DEVE REJEITAR em nível de banco.
--
-- SAÍDA ESPERADA:
--   ERROR:  conflicting key value violates exclusion constraint
--           "reservations_room_id_daterange_excl"
-- =============================================================================
-- created_at/updated_at são preenchidos explicitamente: no banco vivo (criado pelo
-- Sequelize) esses campos são NOT NULL sem DEFAULT — sem eles o INSERT falharia por
-- NOT NULL ANTES de chegar na exclusion constraint que queremos demonstrar.
INSERT INTO reservations (tenant_id, guest_id, room_id, check_in_date, check_out_date, status, total_amount, created_at, updated_at)
VALUES (
    (SELECT id FROM tenants WHERE subdomain = 'aurora'),
    (SELECT id FROM guests  WHERE cpf = '30000000001'
        AND tenant_id = (SELECT id FROM tenants WHERE subdomain = 'aurora')),
    (SELECT id FROM rooms   WHERE number = '101'
        AND tenant_id = (SELECT id FROM tenants WHERE subdomain = 'aurora')),
    DATE '2026-08-11',   -- sobrepõe a reserva CONFIRMED existente (10 a 14)
    DATE '2026-08-13',
    'PENDING',
    300.00,
    now(),
    now()
);
