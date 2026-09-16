import { Op } from 'sequelize';
import sequelize from '../../../database/connections/sequelize.js';
import { resolveTenantBySubdomain } from '../../utils/resolveTenantBySubdomain.js';
import { checkReservationConflict } from '../../utils/checkReservationConflict.js';
import getPixProvider from '../../services/pix/index.js';
import RoomModel from '../../Models/RoomModel.js';
import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import GuestModel from '../../Models/GuestModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import PaymentModel from '../../Models/PaymentModel.js';

/**
 * POST /public/:subdomain/bookings
 *
 * Reserva direta feita pelo próprio hóspede (sem login). Fluxo:
 *   1. resolve o hotel pelo subdomínio
 *   2. acha um quarto livre na categoria escolhida
 *   3. find-or-create do hóspede (por e-mail dentro do tenant)
 *   4. cria reserva PENDING (source=DIRECT, sem recepcionista)
 *   5. cobra o SINAL (deposit_percent do hotel) via provider PIX → payment PENDING
 *   6. devolve o QR/copia-e-cola para o hóspede pagar
 *
 * Reserva vira CONFIRMED só quando o webhook do PIX confirmar o pagamento.
 */
export default async function CreateBookingController(request, response) {
    try {
        const { subdomain } = request.params;
        const { category_id, check_in, check_out, guests, guest } = request.body;

        const { tenant, error } = await resolveTenantBySubdomain(subdomain);
        if (error) return response.status(error.status).json({ error: error.message });

        // 1. Validação de entrada
        const errors = [];
        if (!category_id) errors.push('category_id obrigatório');
        if (!check_in)    errors.push('check_in obrigatório (YYYY-MM-DD)');
        if (!check_out)   errors.push('check_out obrigatório (YYYY-MM-DD)');
        if (!guest?.full_name) errors.push('guest.full_name obrigatório');
        if (!guest?.email && !guest?.phone) errors.push('informe ao menos guest.email ou guest.phone');
        if (errors.length) return response.status(400).json({ errors });
        if (check_in >= check_out) {
            return response.status(400).json({ error: 'check_out deve ser posterior a check_in' });
        }

        // 2. Categoria válida e pertencente ao tenant
        const category = await RoomCategoryModel.findOne({
            where: { id: category_id, tenant_id: tenant.id }
        });
        if (!category) return response.status(404).json({ error: 'Categoria não encontrada' });

        const numGuests = guests ? parseInt(guests, 10) : 1;
        if (category.capacity < numGuests) {
            return response.status(422).json({ error: 'Categoria não comporta o número de hóspedes' });
        }
        if (!category.price_per_night || Number(category.price_per_night) <= 0) {
            return response.status(422).json({ error: 'Categoria sem preço definido' });
        }

        // 3. Encontrar um quarto livre na categoria para o período
        const rooms = await RoomModel.findAll({
            where: { tenant_id: tenant.id, category_id, status: { [Op.ne]: 'MAINTENANCE' } }
        });
        let availableRoom = null;
        for (const room of rooms) {
            const conflict = await checkReservationConflict(room.id, check_in, check_out, null, tenant.id);
            if (!conflict) { availableRoom = room; break; }
        }
        if (!availableRoom) {
            return response.status(409).json({ error: 'Sem disponibilidade na categoria para o período' });
        }

        // 4. Cálculo financeiro
        const nights = Math.ceil((new Date(check_out) - new Date(check_in)) / (1000 * 60 * 60 * 24));
        const totalAmount = Number((Number(category.price_per_night) * nights).toFixed(2));
        const depositAmount = Number((totalAmount * (tenant.deposit_percent / 100)).toFixed(2));

        // 5. Persistência atômica: hóspede + reserva + pivô + cobrança PIX
        const transaction = await sequelize.transaction();
        try {
            // find-or-create do hóspede (por e-mail dentro do tenant)
            let guestRecord = null;
            if (guest.email) {
                guestRecord = await GuestModel.findOne({
                    where: { email: guest.email, tenant_id: tenant.id },
                    transaction
                });
            }
            if (!guestRecord) {
                guestRecord = await GuestModel.create({
                    tenant_id: tenant.id,
                    full_name: guest.full_name,
                    email: guest.email ?? null,
                    phone: guest.phone ?? null,
                    cpf: guest.cpf ?? null
                }, { transaction });
            }

            const reservation = await ReservationModel.create({
                tenant_id: tenant.id,
                guest_id: guestRecord.id,
                room_id: availableRoom.id,
                user_id: null,            // reserva online não tem recepcionista
                source: 'DIRECT',
                check_in_date: check_in,
                check_out_date: check_out,
                status: 'PENDING',
                total_amount: totalAmount
            }, { transaction });

            await ReservationRoomModel.create(
                { reservation_id: reservation.id, room_id: availableRoom.id },
                { transaction }
            );

            // Cobrança PIX do sinal via provider (simulado por padrão)
            const pix = getPixProvider();
            const charge = await pix.createCharge({
                amount: depositAmount,
                description: `Sinal reserva ${tenant.name}`,
                externalId: reservation.id
            });

            const payment = await PaymentModel.create({
                tenant_id: tenant.id,
                reservation_id: reservation.id,
                amount: depositAmount,
                method: 'PIX',
                status: 'PENDING',
                kind: 'DEPOSIT',
                provider: process.env.PIX_PROVIDER || 'fake',
                provider_charge_id: charge.providerChargeId,
                pix_qr_code: charge.qrCode,
                pix_expiration: charge.expiration,
                paid_at: null
            }, { transaction });

            await transaction.commit();

            return response.status(201).json({
                reservation: {
                    id: reservation.id,
                    status: reservation.status,
                    check_in: check_in,
                    check_out: check_out,
                    nights,
                    category: category.name,
                    total_amount: totalAmount
                },
                payment: {
                    id: payment.id,
                    kind: payment.kind,
                    status: payment.status,
                    amount: depositAmount,
                    deposit_percent: tenant.deposit_percent,
                    balance_due_on_checkin: Number((totalAmount - depositAmount).toFixed(2))
                },
                pix: {
                    provider_charge_id: charge.providerChargeId,
                    qr_code: charge.qrCode,
                    expiration: charge.expiration
                }
            });
        } catch (txError) {
            await transaction.rollback();
            throw txError;
        }
    } catch (error) {
        console.error('CreateBookingController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
