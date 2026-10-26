import sequelize from '../../../database/connections/sequelize.js';
import { QueryTypes } from 'sequelize';

// Relatório de consumo interno (T-04.7, CA-04.7.a e b): "quanto o hotel deu de cortesia,
// refeição de funcionário e perda no período?" (RN-007). Decisões D-63 a D-65 em
// docs/specs/anexos/SPEC-04-decisoes-T-04.7.md.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// YYYY-MM-DD que existe no calendário: 2026-02-30 passa no regex e viraria 500 no Postgres.
// O ano 0000 também: o JS aceita, o Postgres não (no calendário dele, 1 a.C. vem antes de 1 d.C.).
function isCalendarDate(value) {
    if (typeof value !== 'string' || !DATE_RE.test(value) || value.startsWith('0000')) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Período opcional, mas com as duas pontas juntas (D-64). Devolve a mensagem de erro ou null.
function periodError(start, end) {
    if (start === undefined && end === undefined) return null;
    if (start === undefined || end === undefined) return 'Informe start e end juntos';
    if (!isCalendarDate(start) || !isCalendarDate(end)) return 'start e end devem ser datas válidas no formato YYYY-MM-DD';
    if (start > end) return 'start não pode ser depois de end';
    return null;
}

export default async function GetInternalConsumptionController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { start, end } = request.query;

        const error = periodError(start, end);
        if (error) return response.status(400).json({ error });

        // consumed_at, não created_at: o item que a fila offline do garçom entregou
        // depois pertence ao dia em que foi consumido (D-26, D-64).
        const dateFilter = start !== undefined
            ? 'AND ai.consumed_at::date BETWEEN :start AND :end'
            : '';

        // Entra (CA-04.7.b): item não faturável de qualquer conta + todo item de conta
        // INTERNAL, que nunca é receita (RN-006). Item de INTERNAL sem motivo fica no
        // grupo null — motivo desconhecido não é inventado (D-63).
        // Fica de fora (D-65): item excluído e item de conta excluída, em qualquer status.
        const rows = await sequelize.query(`
            SELECT
                ai.reason                            AS reason,
                COUNT(*)::int                        AS count,
                COALESCE(SUM(ai.total), 0)::float    AS total
            FROM account_items ai
            JOIN accounts a
              ON a.id = ai.account_id
             AND a.tenant_id = ai.tenant_id
            WHERE ai.tenant_id = :tenantId
              AND ai.deleted_at IS NULL
              AND a.deleted_at IS NULL
              AND (ai.billable = false OR a.type = 'INTERNAL')
              ${dateFilter}
            GROUP BY ai.reason
            ORDER BY total DESC, ai.reason NULLS LAST
        `, {
            replacements: { tenantId, start: start ?? null, end: end ?? null },
            type: QueryTypes.SELECT
        });

        return response.json(rows);
    } catch (error) {
        console.error('GetInternalConsumptionController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
