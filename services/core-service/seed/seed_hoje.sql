-- =============================================================================
-- Seed do dia — M8 (pedido do Weslley de 31/10, §3.1; plano de fechamento de 15/11)
-- Roda DEPOIS de seed_hotels.sql e seed_consumo.sql (node command.js seed roda os três,
-- nesta ordem).
--
-- Por que existe: o seed_hotels.sql tem datas fixas (janeiro a setembro de 2026). No dia da
-- banca, o painel Hoje e os 4 cartões do gerente apareceriam zerados, e as 6 estadias
-- CHECKED_IN de junho ficavam em quartos AVAILABLE ("Livres 15 · Ocupação 0%" com hóspedes na
-- casa — achado 1 da revisão de 15/11). Este arquivo ancora o cenário no dia em que roda.
--
-- O QUE MONTA, NOS DOIS HOTÉIS (hoje = H, no fuso do hotel):
--   Hotel Aurora                              Pousada Sol
--   - 4 estadias na casa (106, 107, 203, 302) - 2 estadias na casa (4, 10)
--   - saída hoje: 107 (só o sinal pago:       - saída hoje: 10
--     o check-out cobra R$ 300,00)
--   - chegada hoje com sinal pago hoje: 201   - chegada hoje com sinal pago hoje: 5
--   - chegada hoje sem sinal (no-show): 102
--   - saída de hoje já feita, pagamento no    - saída de hoje já feita, pagamento no
--     check-out e quarto em limpeza: 105        check-out e quarto em limpeza: 3
--   As estadias na casa são as 6 CHECKED_IN do seed_hotels.sql, com as mesmas noites e o mesmo
--   valor. A conta da suíte e os consumos delas (seed_consumo.sql) andam junto; a Mesa 3 e o
--   day-use abertos passam para o dia.
--
-- "HOJE" É O DIA DO HOTEL (D-68): o banco roda em UTC, e um seed das 22h em Brasília gravaria
-- o cenário de amanhã com CURRENT_DATE. Os testes fixam o relógio com `SET seed.agora = ...`;
-- sem ela, vale o now().
--
-- RODAR DE NOVO:
--   - no mesmo dia: não muda nada;
--   - em outro dia: leva o cenário para o novo dia, sem criar linhas;
--   - nunca desfaz a demonstração: reserva do cenário que mudou de situação (check-in feito,
--     cancelada) fica como está, e conta fechada não se mexe — a mesma regra do seed_consumo.
--   - quarto do cenário tomado por outra reserva no novo período: a linha é pulada com aviso
--     (NOTICE), em vez de a EXCLUDE de double-booking derrubar o arquivo inteiro.
--   A identidade de cada reserva do cenário é (hotel, CPF do hóspede, quarto): os hóspedes
--   novos (30000002240 a 24, 40000001449 e 15) não têm outra reserva no seed.
--
-- DEPOIS DE UM ENSAIO, RECRIE O BANCO antes da banca. No compose: docker compose down -v; up; migrate;
-- seed com ALLOW_SEED=1 (o compose sobe com NODE_ENV=production). No k8s: ./start.sh down;
-- ./start.sh up; ./start.sh migrate; ALLOW_SEED=1 ./start.sh seed.
-- Rodar por cima de um banco usado não desfaz o ensaio: o check-in feito ontem continua feito, e
-- o painel de hoje sai incompleto. O resumo no fim do arquivo avisa (WARNING) quando isso acontece.
--
-- Os triggers do outbox (applyDbConstraints.js) publicam cada INSERT e UPDATE: o analytics
-- recebe o cenário pelo mesmo caminho da API, sem carga inicial.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  tz    constant text := 'America/Sao_Paulo';
  agora timestamptz   := COALESCE(NULLIF(current_setting('seed.agora', true), '')::timestamptz, now());
  hoje  date          := (agora AT TIME ZONE tz)::date;
  s     record;
  r     record;
  a     record;
  v_tenant uuid; v_guest uuid; v_room uuid; v_user uuid; v_price numeric; v_res uuid;
  v_ci date; v_co date; v_paid timestamptz; v_ultimo timestamptz;
  v_delta int;
  movida boolean;
  v_existe boolean;
  v_kind text;
  v_conflito record;
BEGIN
  FOR s IN
    SELECT * FROM (VALUES
      -- hotel,   CPF,          quarto, entrada, saída, situação,      pagamento, método,     quando
      -- Estadias na casa: as CHECKED_IN do seed_hotels.sql (pagas na entrada)
      ('aurora', '30000000620', '106',  -2,  3, 'CHECKED_IN',  750.00, 'PIX',      'entrada'),
      ('aurora', '30000000701', '107',  -3,  0, 'CHECKED_IN',  150.00, 'PIX',      'entrada'),  -- só o sinal: o check-out cobra 300
      ('aurora', '30000000892', '203',  -1,  3, 'CHECKED_IN', 1400.00, 'PIX',      'entrada'),
      ('aurora', '30000000973', '302',  -2,  2, 'CHECKED_IN', 3200.00, 'CARTAO',   'entrada'),
      ('sol',    '40000000558', '4',    -1,  2, 'CHECKED_IN',  360.00, 'PIX',      'entrada'),
      ('sol',    '40000000639', '10',   -4,  0, 'CHECKED_IN',  880.00, 'CARTAO',   'entrada'),
      -- Chegadas de hoje: sinal pago hoje (Aurora 30%, Sol 50%) e uma sem sinal (no-show, D-3)
      ('aurora', '30000002240', '201',   0,  2, 'CONFIRMED',   210.00, 'PIX',      'hoje'),
      ('aurora', '30000002321', '102',   0,  3, 'CONFIRMED',   NULL,   NULL,       NULL),
      ('sol',    '40000001449', '5',     0,  2, 'CONFIRMED',   120.00, 'PIX',      'hoje'),
      -- Saída de hoje já feita: pagamento no check-out, quarto fica em limpeza
      ('aurora', '30000002402', '105',  -2,  0, 'CHECKED_OUT', 300.00, 'CARTAO_CREDITO', 'hoje'),
      ('sol',    '40000001520', '3',    -3,  0, 'CHECKED_OUT', 360.00, 'DINHEIRO', 'hoje')
    ) AS v(subdomain, cpf, room, ci_off, co_off, status, pay_amount, pay_method, pay_when)
  LOOP
    SELECT t.id INTO v_tenant FROM tenants t WHERE t.subdomain = s.subdomain;
    SELECT g.id INTO v_guest FROM guests g
     WHERE g.tenant_id = v_tenant AND g.cpf = s.cpf AND g.deleted_at IS NULL;
    SELECT rm.id, rc.price_per_night INTO v_room, v_price
      FROM rooms rm JOIN room_categories rc ON rc.id = rm.category_id
     WHERE rm.tenant_id = v_tenant AND rm.number = s.room AND rm.deleted_at IS NULL;
    SELECT u.id INTO v_user FROM users u
     WHERE u.tenant_id = v_tenant AND u.email = 'admin@' || s.subdomain || '.example' AND u.deleted_at IS NULL;
    IF v_tenant IS NULL OR v_guest IS NULL OR v_room IS NULL OR v_user IS NULL THEN
      RAISE EXCEPTION 'seed_hoje: % / CPF % / quarto % não encontrado — rode seed_hotels.sql antes',
        s.subdomain, s.cpf, s.room;
    END IF;

    v_res := NULL;
    movida := false;
    v_ci := hoje + s.ci_off;
    v_co := hoje + s.co_off;

    SELECT * INTO r FROM reservations
     WHERE tenant_id = v_tenant AND guest_id = v_guest AND room_id = v_room AND deleted_at IS NULL
     ORDER BY created_at LIMIT 1;
    v_existe := FOUND;

    IF v_existe AND r.status <> s.status THEN
      CONTINUE;                                   -- a demonstração mexeu nela: fica como está
    END IF;

    -- Outra reserva bloqueando o quarto no novo período (a demo vendeu o quarto): pula a linha e
    -- diz qual, em vez de deixar a EXCLUDE de double-booking abortar o arquivo inteiro.
    IF NOT (v_existe AND r.check_in_date = v_ci AND r.check_out_date = v_co) THEN
      SELECT re.check_in_date, re.check_out_date INTO v_conflito
        FROM reservation_rooms rr JOIN reservations re ON re.id = rr.reservation_id
       WHERE rr.room_id = v_room AND rr.blocks_room
         AND rr.reservation_id IS DISTINCT FROM (CASE WHEN v_existe THEN r.id END)
         AND daterange(rr.check_in_date, rr.check_out_date, '[)') && daterange(v_ci, v_co, '[)')
       LIMIT 1;
      IF FOUND THEN
        RAISE NOTICE 'seed_hoje: % quarto % já reservado de % a % por outra reserva — linha do cenário pulada',
          s.subdomain, s.room, v_conflito.check_in_date, v_conflito.check_out_date;
        CONTINUE;
      END IF;
    END IF;

    IF NOT v_existe THEN
      INSERT INTO reservations (tenant_id, guest_id, room_id, user_id, check_in_date, check_out_date, status, total_amount)
      VALUES (v_tenant, v_guest, v_room, v_user, v_ci, v_co, s.status, v_price * (s.co_off - s.ci_off))
      RETURNING id INTO v_res;
      -- Criada uma semana antes da entrada, como uma reserva de verdade (não depois do próprio sinal).
      UPDATE reservations SET created_at = ((v_ci - 7) + time '10:00') AT TIME ZONE tz WHERE id = v_res;
      movida := true;
    ELSIF r.check_in_date = v_ci AND r.check_out_date = v_co THEN
      v_res := r.id;
      movida := false;                            -- já está no dia: nada a fazer
    ELSE
      v_res := r.id;
      v_delta := v_ci - r.check_in_date;
      UPDATE reservations SET check_in_date = v_ci, check_out_date = v_co WHERE id = v_res;
      -- A conta da suíte e os consumos andam com a estadia (só conta aberta, D-58).
      UPDATE account_items ai SET consumed_at = ai.consumed_at + v_delta * interval '1 day'
        FROM accounts ac
       WHERE ac.id = ai.account_id AND ac.reservation_id = v_res AND ac.status = 'OPEN';
      UPDATE accounts SET opened_at = opened_at + v_delta * interval '1 day'
       WHERE reservation_id = v_res AND status = 'OPEN';
      movida := true;
    END IF;

    IF movida AND s.pay_when IS NOT NULL THEN
      -- Na entrada: 15h do dia de entrada. Hoje: 11h, ou agora se o seed roda antes das 11h —
      -- pagamento nunca fica no futuro.
      v_paid := CASE s.pay_when
                  WHEN 'entrada' THEN (v_ci + time '15:00') AT TIME ZONE tz
                  ELSE LEAST(agora, (hoje + time '11:00') AT TIME ZONE tz)
                END;
      -- Pagamento menor que a estadia é sinal (DEPOSIT): a linha do tempo mostra "Sinal · PIX".
      v_kind := CASE WHEN s.pay_amount < v_price * (s.co_off - s.ci_off) THEN 'DEPOSIT' ELSE 'FULL' END;
      UPDATE payments SET paid_at = v_paid, kind = v_kind
       WHERE reservation_id = v_res AND amount = s.pay_amount AND status = 'PAID' AND deleted_at IS NULL;
      IF NOT FOUND THEN
        INSERT INTO payments (tenant_id, reservation_id, amount, method, status, paid_at, kind)
        VALUES (v_tenant, v_res, s.pay_amount, s.pay_method, 'PAID', v_paid, v_kind);
      END IF;
    END IF;

    -- Saída feita hoje deixa o quarto para a limpeza (OCCUPIED → CLEANING no check-out).
    IF movida AND s.status = 'CHECKED_OUT' THEN
      -- Allowlist da máquina de quartos: MAINTENANCE (bloqueio do admin) e OCCUPIED ficam.
      UPDATE rooms SET status = 'CLEANING' WHERE id = v_room AND status IN ('AVAILABLE', 'CLEANING');
    END IF;
  END LOOP;

  -- Quarto x estadia nos hotéis do seed: todo quarto de estadia CHECKED_IN fica ocupado, e
  -- quarto ocupado sem estadia volta a livre. Pelo pivô reservation_rooms, e não só pelo quarto
  -- principal: a reserva de vários quartos ocupa todos eles no check-in.
  UPDATE rooms rm SET status = 'OCCUPIED'
    FROM tenants t
   WHERE t.id = rm.tenant_id AND t.subdomain IN ('aurora', 'sol')
     AND rm.deleted_at IS NULL AND rm.status <> 'OCCUPIED'
     AND EXISTS (SELECT 1 FROM reservation_rooms rr JOIN reservations re ON re.id = rr.reservation_id
                  WHERE rr.room_id = rm.id AND re.status = 'CHECKED_IN' AND re.deleted_at IS NULL);
  UPDATE rooms rm SET status = 'AVAILABLE'
    FROM tenants t
   WHERE t.id = rm.tenant_id AND t.subdomain IN ('aurora', 'sol')
     AND rm.deleted_at IS NULL AND rm.status = 'OCCUPIED'
     AND NOT EXISTS (SELECT 1 FROM reservation_rooms rr JOIN reservations re ON re.id = rr.reservation_id
                      WHERE rr.room_id = rm.id AND re.status = 'CHECKED_IN' AND re.deleted_at IS NULL);

  -- Mesa e day-use abertos vão para o dia, no mesmo horário; para ontem se algum lançamento
  -- ainda estaria no futuro (seed rodado de manhã cedo). Conta de ontem já serve.
  FOR a IN
    SELECT ac.id, ac.opened_at
      FROM accounts ac JOIN tenants t ON t.id = ac.tenant_id AND t.subdomain IN ('aurora', 'sol')
     WHERE ac.status = 'OPEN' AND ac.type IN ('TABLE', 'DAY_USE') AND ac.deleted_at IS NULL
       AND ac.label IN ('Mesa 3', 'Day-use — piscina')        -- só as do seed_consumo, nunca as da demo
       AND (ac.opened_at AT TIME ZONE tz)::date < hoje - 1
  LOOP
    SELECT GREATEST(a.opened_at, COALESCE(MAX(ai.consumed_at), a.opened_at)) INTO v_ultimo
      FROM account_items ai WHERE ai.account_id = a.id;
    v_delta := hoje - (a.opened_at AT TIME ZONE tz)::date;
    IF v_ultimo + v_delta * interval '1 day' > agora THEN
      v_delta := v_delta - 1;
    END IF;
    UPDATE account_items SET consumed_at = consumed_at + v_delta * interval '1 day' WHERE account_id = a.id;
    UPDATE accounts SET opened_at = opened_at + v_delta * interval '1 day' WHERE id = a.id;
  END LOOP;

  -- Resumo do dia por hotel. Se não bate com o cenário (banco usado em ensaio, quarto vendido na
  -- demo), avisa em WARNING: o seed termina, mas o painel de hoje vai sair incompleto.
  FOR a IN
    SELECT t.subdomain,
           COUNT(*) FILTER (WHERE re.status IN ('PENDING','CONFIRMED') AND re.check_in_date = hoje)  AS chegadas,
           COUNT(*) FILTER (WHERE re.status = 'CHECKED_IN')                                           AS na_casa,
           COUNT(*) FILTER (WHERE re.status = 'CHECKED_IN' AND re.check_out_date = hoje)              AS saidas,
           COUNT(*) FILTER (WHERE re.status = 'CHECKED_IN' AND NOT (re.check_in_date <= hoje AND re.check_out_date >= hoje)) AS fora_da_janela
      FROM tenants t LEFT JOIN reservations re ON re.tenant_id = t.id AND re.deleted_at IS NULL
     WHERE t.subdomain IN ('aurora', 'sol')
     GROUP BY t.subdomain ORDER BY t.subdomain
  LOOP
    RAISE NOTICE 'seed_hoje: % em %: % chegada(s), % na casa, % saída(s)', a.subdomain, hoje, a.chegadas, a.na_casa, a.saidas;
    IF (a.subdomain = 'aurora' AND (a.chegadas, a.na_casa, a.saidas) <> (2::bigint, 4::bigint, 1::bigint))
       OR (a.subdomain = 'sol' AND (a.chegadas, a.na_casa, a.saidas) <> (1::bigint, 2::bigint, 1::bigint))
       OR a.fora_da_janela > 0 THEN
      RAISE WARNING 'seed_hoje: o cenário de % não ficou completo (banco já usado em ensaio?). Para a banca, recrie o banco. Compose: docker compose down -v, up, migrate e seed com ALLOW_SEED=1. K8s: ./start.sh down, ./start.sh up, ./start.sh migrate e ALLOW_SEED=1 ./start.sh seed.', a.subdomain;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- RESUMO DO SEED DO DIA (H = hoje no fuso do hotel)
-- Aurora: 2 chegadas (1 com sinal, 1 no-show) · 4 na casa · 1 saída · 1 em limpeza
--         recebido hoje R$ 510,00 (sinal 210 + check-out 300)
-- Sol:    1 chegada com sinal · 2 na casa · 1 saída · 1 em limpeza
--         recebido hoje R$ 480,00 (sinal 120 + check-out 360)
-- Linhas novas na primeira execução: 5 reservas e 4 pagamentos.
-- =============================================================================
