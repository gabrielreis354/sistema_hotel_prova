import { Op } from 'sequelize';
import PaymentModel from '../../Models/PaymentModel.js';
import getPixProvider, { getPixProviderKey } from './index.js';

/**
 * Cancela no PSP as cobranças PIX ainda PENDING de uma reserva que acabou de ser cancelada
 * (🟡-1 do qa-redteam de 16/10). Sem isto, o QR do Asaas continuava pagável e o hóspede
 * pagava uma reserva cancelada: dinheiro entrando sem quarto.
 *
 * Roda DEPOIS do commit do cancelamento e nunca lança: PSP fora do ar não pode impedir a
 * recepção de cancelar. O que não deu para cancelar fica PENDING, com o id no log para o hotel
 * conciliar; se o hóspede pagar mesmo assim, o webhook já avisa o dinheiro a devolver.
 */
export default async function cancelPendingCharges(reservation) {
    try {
        const payments = await PaymentModel.unscoped().findAll({
            where: {
                tenant_id: reservation.tenant_id,
                reservation_id: reservation.id,
                method: 'PIX',
                status: 'PENDING',
                provider_charge_id: { [Op.ne]: null }
            }
        });
        if (payments.length === 0) return;

        const provider = getPixProvider();
        const activeKey = getPixProviderKey();

        for (const payment of payments) {
            // Cobrança de outro PSP (ex.: fake antes da troca para o Asaas): o PSP ativo não a conhece.
            if (payment.provider !== activeKey) {
                console.warn('cancelPendingCharges: cobrança de outro provider, não cancelada', payment.provider, payment.provider_charge_id);
                continue;
            }
            try {
                const { cancelled } = await provider.cancelCharge(payment.provider_charge_id);
                if (!cancelled) continue;
                // Condicional: um webhook PAID gravado enquanto o PSP respondia não é sobrescrito.
                await PaymentModel.unscoped().update(
                    { status: 'FAILED' },
                    { where: { id: payment.id, tenant_id: reservation.tenant_id, status: 'PENDING' } }
                );
            } catch (error) {
                console.error('cancelPendingCharges: cobrança não cancelada no PSP — conciliar', payment.provider_charge_id, error.message);
            }
        }
    } catch (error) {
        console.error('cancelPendingCharges: falha ao cancelar cobranças da reserva', reservation.id, error.message);
    }
}
