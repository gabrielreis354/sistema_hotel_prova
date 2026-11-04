import AccountModel from '../../Models/AccountModel.js';
import isUuid from '../../utils/isUuid.js';
import accountBill from '../../utils/accountBill.js';
import pendingLegacyConsumption from '../../utils/pendingLegacyConsumption.js';

/**
 * GET /accounts/:id/bill
 * Conta apresentada ao cliente: diária, consumos, total, pagamentos e saldo (CA-04.3.a).
 * O cálculo vive em app/utils/accountBill.js, que o fechamento também usa.
 * O garçom não chega aqui: a allowlist de app/utils/roles.js não lista esta rota.
 */
export default async function GetAccountBillController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;

        // :id não-UUID chega ao Postgres como cast inválido e viraria 500.
        if (!isUuid(id)) return response.status(404).json({ error: 'Conta não encontrada' });

        const account = await AccountModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!account) return response.status(404).json({ error: 'Conta não encontrada' });

        // Consumo antigo ainda não migrado: o total sairia menor. Recusar, nunca mentir (D-31).
        if (account.reservation_id && await pendingLegacyConsumption(account.reservation_id)) {
            return response.status(503).json({ error: 'Consumos desta reserva em migração — conta temporariamente indisponível' });
        }

        return response.json(await accountBill(account));
    } catch (error) {
        console.error('GetAccountBillController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
