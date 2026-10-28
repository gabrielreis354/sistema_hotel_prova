import sequelize from '../../../database/connections/sequelize.js';
import { QueryTypes } from 'sequelize';

export default async function GetRevenueController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { start, end } = request.query;

        const dateFilter = start && end
            ? 'AND paid_at::date BETWEEN :start AND :end'
            : '';

        const realizedByMonth = await sequelize.query(`
            SELECT
                TO_CHAR(DATE_TRUNC('month', paid_at), 'YYYY-MM') AS month,
                SUM(amount)::float                                AS total
            FROM payments
            WHERE tenant_id = :tenantId
              -- Receita é a soma dos efetivados (T-06.13, CA-06.13.f): VOIDED guarda o paid_at
              -- como histórico, e o excluído antigo (D-2 do catálogo) também não conta.
              AND status = 'PAID' AND paid_at IS NOT NULL AND deleted_at IS NULL
              ${dateFilter}
            GROUP BY 1
            ORDER BY 1
        `, {
            replacements: { tenantId, start: start ?? null, end: end ?? null },
            type: QueryTypes.SELECT
        });

        const [realizedTotal] = await sequelize.query(`
            SELECT COALESCE(SUM(amount), 0)::float AS total
            FROM payments
            WHERE tenant_id = :tenantId
              -- Receita é a soma dos efetivados (T-06.13, CA-06.13.f): VOIDED guarda o paid_at
              -- como histórico, e o excluído antigo (D-2 do catálogo) também não conta.
              AND status = 'PAID' AND paid_at IS NOT NULL AND deleted_at IS NULL
              ${dateFilter}
        `, {
            replacements: { tenantId, start: start ?? null, end: end ?? null },
            type: QueryTypes.SELECT
        });

        const [expected] = await sequelize.query(`
            SELECT COALESCE(SUM(total_amount), 0)::float AS total
            FROM reservations
            WHERE tenant_id = :tenantId
              AND status IN ('CONFIRMED', 'CHECKED_IN')
              AND deleted_at IS NULL
        `, {
            replacements: { tenantId },
            type: QueryTypes.SELECT
        });

        const unpaid = await sequelize.query(`
            SELECT
                r.id              AS reservation_id,
                g.full_name       AS guest,
                r.total_amount::float AS amount,
                r.check_in_date,
                r.check_out_date
            FROM reservations r
            JOIN guests g ON g.id = r.guest_id
            -- Não paga = reserva ativa SEM NENHUM pagamento PAID: estornado, PIX PENDING/EXPIRED e
            -- excluído não contam (T-06.13). É só a 1ª parte da D-3 do catálogo: uma reserva com
            -- sinal PAID de 30% sai da lista mesmo devendo 70%. O "saldo > 0" completo fica para
            -- a projeção do analytics (T-01.4).
            LEFT JOIN payments p ON p.reservation_id = r.id AND p.tenant_id = :tenantId
                                 AND p.status = 'PAID' AND p.deleted_at IS NULL
            WHERE r.tenant_id = :tenantId
              AND r.status IN ('CONFIRMED', 'CHECKED_IN')
              AND r.deleted_at IS NULL
              AND p.id IS NULL
            ORDER BY r.check_in_date
        `, {
            replacements: { tenantId },
            type: QueryTypes.SELECT
        });

        return response.json({
            realized: {
                total: realizedTotal.total,
                by_month: realizedByMonth
            },
            expected: {
                total: expected.total
            },
            unpaid
        });
    } catch (error) {
        console.error('GetRevenueController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
