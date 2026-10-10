import sequelize from '../../../database/connections/sequelize.js';
import ContractModel from '../../Models/ContractModel.js';
import ReservationModel from '../../Models/ReservationModel.js';

// Allowlist (fail-safe, regra do CLAUDE.md): só uma reserva-bloco ainda não ocupada pode ser
// cancelada junto com o contrato. Com hóspede hospedado (CHECKED_IN) ou estadia encerrada
// (CHECKED_OUT), cancelar o contrato apagaria o registro de uma ocupação real (P-2). No
// mercado, liberam-se os quartos não ocupados e quem já está hospedado é tratado
// individualmente — isso vem com o modelo de uma reserva por quarto (ADR-007 candidata).
const BLOCK_CANCELLABLE_STATUSES = ['PENDING', 'CONFIRMED'];

const BLOCK_CANCEL_BLOCKED_MESSAGES = {
    CHECKED_IN:  'A reserva-bloco do contrato já tem hóspedes hospedados — o contrato não pode ser cancelado',
    CHECKED_OUT: 'A estadia do contrato já foi encerrada — o contrato não pode ser cancelado',
};

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

        // Contrato e reserva-bloco mudam juntos (CA-F.2.b); a reserva é lida com lock para que um
        // check-in simultâneo não passe entre a checagem de status e o cancelamento.
        const t = await sequelize.transaction();
        try {
            if (contract.reservation_id) {
                const block = await ReservationModel.findOne({
                    where: { id: contract.reservation_id, tenant_id: tenantId },
                    lock: t.LOCK.UPDATE,
                    transaction: t
                });

                if (block && block.status !== 'CANCELLED') {
                    if (!BLOCK_CANCELLABLE_STATUSES.includes(block.status)) {
                        await t.rollback();
                        const message = BLOCK_CANCEL_BLOCKED_MESSAGES[block.status]
                            ?? `Cancelamento não permitido com a reserva-bloco em '${block.status}'`;
                        return response.status(409).json({ error: message });
                    }
                    block.status = 'CANCELLED';
                    await block.save({ transaction: t });
                }
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
