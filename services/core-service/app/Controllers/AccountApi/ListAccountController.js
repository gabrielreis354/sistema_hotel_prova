import AccountModel from '../../Models/AccountModel.js';
import { ACCOUNT_TYPES, ACCOUNT_STATUSES } from '../../utils/accountEnums.js';

/**
 * GET /accounts?status=OPEN&type=TABLE
 * Lista as contas do hotel. O garçom usa ?status=OPEN para ver as comandas abertas.
 *
 * Sem include de hóspede nem de reserva: o garçom também lista, e não pode ver dados
 * pessoais (SPEC-04 §6, LGPD). O `label` é o que identifica a conta na tela.
 */
export default async function ListAccountController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { status, type } = request.query;

        const where = { tenant_id: tenantId };

        // Filtro inválido é 400, não lista vazia: "?status=ABERTA" vazio esconderia o erro.
        if (status !== undefined) {
            if (!ACCOUNT_STATUSES.includes(status)) {
                return response.status(400).json({
                    error: `status deve ser um de: ${ACCOUNT_STATUSES.join(', ')}`
                });
            }
            where.status = status;
        }
        if (type !== undefined) {
            if (!ACCOUNT_TYPES.includes(type)) {
                return response.status(400).json({
                    error: `type deve ser um de: ${ACCOUNT_TYPES.join(', ')}`
                });
            }
            where.type = type;
        }

        const accounts = await AccountModel.findAll({
            where,
            order: [['opened_at', 'DESC']]
        });

        return response.json(accounts);
    } catch (error) {
        console.error('ListAccountController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
