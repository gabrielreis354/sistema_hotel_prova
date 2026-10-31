// OpenAPI das rotas de indicadores do analytics-service (T-01.4/H.3). Até a H.3 elas estavam no
// swagger do core (services/core-service/config/swagger.js); saíram de lá junto com as rotas.
//
// O frontend continua com UM cliente tipado: frontend/packages/api-client/scripts/dump-openapi.mjs
// junta os paths deste arquivo aos do core — o nginx serve os dois na mesma origem, então para o
// navegador é uma API só. Caminho que aparecer nos dois specs é erro no dump.
//
// Dinheiro é string decimal com duas casas (NUMERIC até a resposta — catálogo de eventos §2 e §9.1).
// Percentual, contagem e noites médias são número.
//
// Objeto puro, sem dependência: o dump importa este arquivo sem os node_modules do analytics.

const MONEY = (example, description) => ({
    type: 'string', pattern: '^-?\\d+\\.\\d{2}$', example, ...(description ? { description } : {})
});
const DATE = { type: 'string', format: 'date' };
const UUID = { type: 'string', format: 'uuid' };

const PERIOD_PARAMS = (campo) => [
    { in: 'query', name: 'start', required: false, schema: { type: 'string', format: 'date', example: '2026-01-01' }, description: `Data inicial (YYYY-MM-DD), inclusiva, sobre ${campo}. Só filtra junto com end.` },
    { in: 'query', name: 'end',   required: false, schema: { type: 'string', format: 'date', example: '2026-06-30' }, description: `Data final (YYYY-MM-DD), inclusiva, sobre ${campo}. Só filtra junto com start.` }
];

const ERRORS = {
    400: { description: 'Parâmetro inválido (data inexistente ou fora do formato, start depois de end, número fora do intervalo)' },
    401: { description: 'Token ausente ou inválido, ou hotel ainda não conhecido pelo analytics' },
    403: { description: 'Papel sem permissão (WAITER) ou hotel suspenso' },
    500: { description: 'Erro interno' }
};

const ok = (description, schema) => ({ description, content: { 'application/json': { schema } } });
const op = (summary, description, response, parameters = [], extra = {}) => ({
    get: {
        tags: ['Analytics'],
        summary,
        description,
        security: [{ bearerAuth: [] }],
        parameters,
        responses: { 200: response, ...ERRORS, ...extra }
    }
});

const paths = {
    '/analytics/revenue': op(
        'Caixa realizado vs esperado vs valores em aberto',
        'Receita realizada (só pagamentos PAID: estornados VOIDED e excluídos não contam — T-06.13, D-2) por mês, receita esperada (reservas CONFIRMED e CHECKED_IN) e valores em aberto: reservas ativas com saldo > 0, isto é, total_amount − soma dos PAID (D-3). O período filtra a receita realizada pelo dia do pagamento. ADMIN e RECEPTIONIST.',
        ok('Resumo financeiro do hotel', {
            type: 'object',
            properties: {
                realized: {
                    type: 'object',
                    properties: {
                        total:    MONEY('18500.00'),
                        by_month: { type: 'array', items: { type: 'object', properties: {
                            month: { type: 'string', example: '2026-01' },
                            total: MONEY('4200.00')
                        } } }
                    }
                },
                expected: { type: 'object', properties: { total: MONEY('6200.00') } },
                unpaid: { type: 'array', items: { type: 'object', properties: {
                    reservation_id: UUID,
                    guest_id:       UUID,
                    guest:          { type: 'string', nullable: true, example: 'Maria Oliveira', description: 'null enquanto o evento do hóspede não chegou' },
                    amount:         MONEY('1000.00', 'total_amount da reserva'),
                    paid:           MONEY('300.00', 'Soma dos pagamentos PAID'),
                    balance:        MONEY('700.00', 'amount − paid, sempre > 0'),
                    check_in_date:  DATE,
                    check_out_date: DATE
                } } }
            }
        }),
        PERIOD_PARAMS('o dia do pagamento (paid_at)')
    ),
    '/analytics/occupancy': op(
        'Taxa de ocupação + ADR + RevPAR',
        'Quartos por status, taxa de ocupação, ADR (diária média das estadias CHECKED_IN/CHECKED_OUT que passam pela data) e RevPAR (ADR × ocupados / total de quartos). ADMIN e RECEPTIONIST.',
        ok('Indicadores de ocupação do dia', {
            type: 'object',
            properties: {
                date:           DATE,
                total_rooms:    { type: 'integer', example: 15 },
                occupied:       { type: 'integer', example: 9 },
                available:      { type: 'integer', example: 4 },
                cleaning:       { type: 'integer', example: 2 },
                occupancy_rate: { type: 'number', example: 60, description: 'Percentual de ocupação (0–100)' },
                adr:            MONEY('312.50', 'Average Daily Rate — diária média'),
                revpar:         MONEY('187.50', 'Revenue Per Available Room — ADR × ocupados / total')
            }
        }),
        [{ in: 'query', name: 'date', required: false, schema: { type: 'string', format: 'date', example: '2026-06-27' }, description: 'Data de referência (YYYY-MM-DD). Padrão: hoje em UTC.' }]
    ),
    '/analytics/alerts': op(
        'Alertas operacionais do dia',
        'Risco de no-show (CONFIRMED com check-in hoje sem nenhum pagamento PAID — D-3), quartos em limpeza e reservas PENDING há mais de 48 h. Sem telefone do hóspede (D-1): a tela abre a ficha no core pelo guest_id. ADMIN e RECEPTIONIST.',
        ok('Alertas agrupados', {
            type: 'object',
            properties: {
                no_show_risk: { type: 'array', items: { type: 'object', properties: {
                    reservation_id: UUID,
                    guest_id:       UUID,
                    guest:          { type: 'string', nullable: true, example: 'João Silva' },
                    check_in_date:  DATE,
                    amount:         MONEY('450.00')
                } } },
                cleaning_pending: { type: 'array', items: { type: 'object', properties: {
                    room_id:        UUID,
                    room_number:    { type: 'string', example: '204' },
                    category:       { type: 'string', nullable: true, example: 'Standard' },
                    cleaning_since: { type: 'string', format: 'date-time' }
                } } },
                pending_too_long: { type: 'array', items: { type: 'object', properties: {
                    reservation_id: UUID,
                    guest_id:       UUID,
                    guest:          { type: 'string', nullable: true, example: 'Ana Costa' },
                    check_in_date:  DATE,
                    amount:         MONEY('300.00'),
                    created_at:     { type: 'string', format: 'date-time' },
                    hours_pending:  { type: 'number', example: 72.5 }
                } } }
            }
        })
    ),
    '/analytics/seasonality': op(
        'Histórico mensal de reservas e receita',
        'Por mês de check-in: reservas não canceladas, receita e noites médias. ADMIN e RECEPTIONIST.',
        ok('Meses com indicadores', {
            type: 'array',
            items: { type: 'object', properties: {
                month:        { type: 'string', example: '2026-01' },
                reservations: { type: 'integer', example: 8 },
                revenue:      MONEY('5200.00'),
                avg_nights:   { type: 'number', example: 3.2 }
            } }
        }),
        [{ in: 'query', name: 'months', required: false, schema: { type: 'integer', minimum: 1, maximum: 60, example: 12 }, description: 'Meses de histórico (1–60). Padrão: 12.' }]
    ),
    '/analytics/revenue-by-category': op(
        'Receita e ticket médio por categoria de quarto',
        'Categorias do quarto principal ordenadas pela receita das reservas não canceladas. ADMIN e RECEPTIONIST.',
        ok('Ranking de categorias', {
            type: 'array',
            items: { type: 'object', properties: {
                category:     { type: 'string', example: 'Suíte' },
                reservations: { type: 'integer', example: 2 },
                revenue:      MONEY('5600.00'),
                avg_ticket:   MONEY('2800.00')
            } }
        }),
        PERIOD_PARAMS('a data de check-in')
    ),
    '/analytics/payment-mix': op(
        'Mix de meios de pagamento com percentual',
        'Pagamentos PAID por meio (estornados VOIDED e excluídos não contam), com total e percentual sobre o período. ADMIN e RECEPTIONIST.',
        ok('Mix ordenado por total', {
            type: 'array',
            items: { type: 'object', properties: {
                method: { type: 'string', example: 'PIX' },
                count:  { type: 'integer', example: 9 },
                total:  MONEY('11200.00'),
                pct:    { type: 'number', example: 60.54, description: 'Percentual sobre o total do período' }
            } }
        }),
        PERIOD_PARAMS('o dia do pagamento (paid_at)')
    ),
    '/analytics/top-guests': op(
        'Hóspedes mais valiosos por valor acumulado',
        'Soma das reservas não canceladas por hóspede, com estadias e última saída. Só ADMIN: é dado pessoal (RT-51). Sem e-mail (D-1).',
        ok('Ranking de hóspedes', {
            type: 'array',
            items: { type: 'object', properties: {
                guest_id:           UUID,
                full_name:          { type: 'string', example: 'Carlos Eduardo' },
                total_reservations: { type: 'integer', example: 3 },
                lifetime_value:     MONEY('4200.00'),
                last_stay:          DATE
            } }
        }),
        [{ in: 'query', name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, example: 10 }, description: 'Quantos hóspedes (1–100). Padrão: 10.' }],
        { 403: { description: 'Requer papel ADMIN' } }
    )
};

export default {
    openapi: '3.0.0',
    info: {
        title: 'Gesway analytics-service — indicadores',
        version: '1.0.0',
        description: 'Indicadores calculados sobre as projeções alimentadas pelos eventos do core (T-01.4).'
    },
    components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
    },
    paths
};
