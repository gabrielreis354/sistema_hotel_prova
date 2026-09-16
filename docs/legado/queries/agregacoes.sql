-- =============================================================================
-- Consultas de Agregação — Relatórios e KPIs gerenciais
-- Sistema de Gestão de Hotel (SaaS Multi-Tenant)
--
-- Todas as consultas são parametrizadas por $1 = tenant_id (isolamento
-- multi-tenant obrigatório) e respeitam o soft delete (deleted_at IS NULL).
-- Cada consulta documenta o índice que torna o filtro inicial eficiente.
-- =============================================================================


-- =============================================================================
-- CONSULTA 1: Receita total por mês/ano
-- Importância: relatório financeiro mensal — base para o gestor acompanhar o
--   faturamento do hotel ao longo do tempo e identificar sazonalidade.
-- Índice utilizado: payments(tenant_id) — filtro inicial por tenant; o
--   agrupamento por mês usa date_trunc sobre paid_at.
-- Parâmetros: $1 = tenant_id
-- =============================================================================
SELECT
    date_trunc('month', p.paid_at)::date AS mes_referencia,
    TO_CHAR(date_trunc('month', p.paid_at), 'MM/YYYY') AS mes_ano,
    COUNT(p.id)        AS qtd_pagamentos,
    SUM(p.amount)      AS receita_total,
    ROUND(AVG(p.amount), 2) AS ticket_medio
FROM payments p
WHERE p.tenant_id  = $1
  AND p.deleted_at IS NULL
GROUP BY date_trunc('month', p.paid_at)
ORDER BY mes_referencia DESC;


-- =============================================================================
-- CONSULTA 2: Taxa de ocupação em uma data específica
-- Importância: KPI operacional central — mede o percentual de quartos ocupados
--   em um dia, indicando a eficiência comercial e operacional do hotel.
-- Índice utilizado: idx_reservations_tenant_checkin (tenant_id, check_in_date)
--   acelera a junção das reservas ativas no período consultado.
-- Cálculo: (quartos ocupados / quartos totais) * 100, com NULLIF para evitar
--   divisão por zero quando o hotel ainda não tem quartos cadastrados.
-- Parâmetros: $1 = tenant_id, $2 = data de referência (ex: CURRENT_DATE)
-- =============================================================================
SELECT
    $2::date AS data_referencia,
    COUNT(DISTINCT rm.id) AS quartos_totais,
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
    -- A reserva cobre a data consultada: check_in <= data < check_out
    AND $2::date >= res.check_in_date
    AND $2::date <  res.check_out_date
WHERE rm.tenant_id  = $1
  AND rm.deleted_at IS NULL;


-- =============================================================================
-- CONSULTA 3: Ranking de quartos mais reservados
-- Importância: identifica os quartos de maior demanda, subsidiando decisões de
--   precificação dinâmica e de manutenção preventiva dos itens mais usados.
-- Índice utilizado: payments/reservations filtrados por tenant_id; o GROUP BY
--   por room_id agrega o volume de reservas por quarto.
-- Parâmetros: $1 = tenant_id, $2 = limite de linhas (ex: 10)
-- =============================================================================
SELECT
    rm.id            AS room_id,
    rm.number        AS numero_quarto,
    rc.name          AS categoria,
    rc.price_per_night,
    COUNT(r.id)      AS total_reservas,
    SUM(r.total_amount) AS receita_gerada
FROM rooms rm
JOIN room_categories rc ON rc.id = rm.category_id
LEFT JOIN reservations r
    ON  r.room_id   = rm.id
    AND r.tenant_id = rm.tenant_id
    AND r.status    <> 'CANCELLED'
    AND r.deleted_at IS NULL
WHERE rm.tenant_id  = $1
  AND rm.deleted_at IS NULL
GROUP BY rm.id, rm.number, rc.name, rc.price_per_night
ORDER BY total_reservas DESC, receita_gerada DESC
LIMIT $2;


-- =============================================================================
-- CONSULTA 4: Ticket médio por categoria de quarto
-- Importância: análise de receita por segmento — mostra quanto cada categoria
--   gera em média por reserva, orientando reajustes de preço e mix de quartos.
-- Índice utilizado: reservations(tenant_id, ...) para o filtro; JOIN com rooms
--   e room_categories para agrupar por categoria.
-- Parâmetros: $1 = tenant_id
-- =============================================================================
SELECT
    rc.id            AS category_id,
    rc.name          AS categoria,
    rc.price_per_night,
    COUNT(r.id)      AS total_reservas,
    ROUND(AVG(r.total_amount), 2) AS ticket_medio,
    SUM(r.total_amount) AS receita_total
FROM room_categories rc
LEFT JOIN rooms rm
    ON  rm.category_id = rc.id
    AND rm.deleted_at  IS NULL
LEFT JOIN reservations r
    ON  r.room_id   = rm.id
    AND r.tenant_id = rc.tenant_id
    AND r.status    <> 'CANCELLED'
    AND r.deleted_at IS NULL
WHERE rc.tenant_id  = $1
  AND rc.deleted_at IS NULL
GROUP BY rc.id, rc.name, rc.price_per_night
ORDER BY ticket_medio DESC NULLS LAST;


-- =============================================================================
-- CONSULTA 5: Top 10 hóspedes com maior número de estadias
-- Importância: identifica clientes recorrentes — base para um programa de
--   fidelidade, ofertas direcionadas e atendimento VIP.
-- Índice utilizado: reservations(tenant_id, ...) para o filtro; GROUP BY por
--   guest_id agrega o histórico de estadias de cada hóspede.
-- Parâmetros: $1 = tenant_id
-- =============================================================================
SELECT
    g.id             AS guest_id,
    g.full_name      AS hospede,
    g.cpf,
    g.email,
    COUNT(r.id)      AS total_estadias,
    SUM(r.total_amount) AS valor_total_gasto,
    MIN(r.check_in_date) AS primeira_estadia,
    MAX(r.check_out_date) AS ultima_estadia
FROM guests g
JOIN reservations r
    ON  r.guest_id  = g.id
    AND r.tenant_id = g.tenant_id
    AND r.status    IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT')
    AND r.deleted_at IS NULL
WHERE g.tenant_id  = $1
  AND g.deleted_at IS NULL
GROUP BY g.id, g.full_name, g.cpf, g.email
ORDER BY total_estadias DESC, valor_total_gasto DESC
LIMIT 10;
