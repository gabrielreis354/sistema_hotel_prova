import sequelize from '../../../database/connections/sequelize.js';
import ContractModel from '../../Models/ContractModel.js';
import ReservationModel from '../../Models/ReservationModel.js';

/**
 * PUT /contracts/:id/cancel
 * Cancela o contrato e libera os quartos bloqueados na assinatura (se houver
 * reserva-bloco vinculada), voltando-os a ficar disponíveis para o período.
 */
export default async function CancelContractController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const contract = await ContractModel.findOne({ where: { id: request.params.id, tenant_id: tenantId } });
        if (!contract) return response.status(404).json({ error: 'Contrato não encontrado' });
        if (contract.status === 'CANCELLED') {
            return response.status(409).json({ error: 'Contrato já está cancelado' });
        }

        const t = await sequelize.transaction();
        try {
            if (contract.reservation_id) {
                await ReservationModel.update(
                    { status: 'CANCELLED' },
                    { where: { id: contract.reservation_id, tenant_id: tenantId }, transaction: t }
                );
            }

            contract.status = 'CANCELLED';
            await contract.save({ transaction: t });

            await t.commit();
            return response.status(200).json(contract);
        } catch (err) {
            await t.rollback();
            throw err;
        }
    } catch (error) {
        console.error('CancelContractController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
