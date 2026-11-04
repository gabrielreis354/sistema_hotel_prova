import request from 'supertest';
import { Op } from 'sequelize';
import AccountModel from '../../app/Models/AccountModel.js';

/**
 * Check-in no estado de antes da T-04.6: a estadia fica sem a conta da suíte que o check-in
 * passou a abrir (D-58), e as contas são abertas à mão pela recepção.
 *
 * É o estado real das estadias com check-in anterior ao deploy da T-04.6, e o que os testes
 * da mecânica de contas (T-04.1 a T-04.5) montam: eles abrem as próprias contas, na ordem
 * e com os rótulos que cada regra precisa. Só remove a conta que o check-in criou; contas
 * abertas antes (pela rota antiga de consumo, por exemplo) ficam.
 *
 * O fluxo novo — o check-in abrindo a conta — é testado em tests/checkin-account.test.js.
 *
 * @returns {Promise<import('supertest').Response>} a resposta do check-in
 */
export async function checkInWithoutAccount(app, token, reservationId) {
    const before = (await AccountModel.findAll({
        where: { reservation_id: reservationId }, attributes: ['id'], paranoid: false
    })).map((a) => a.id);
    const res = await request(app).put(`/reservations/${reservationId}/check-in`).set({ Authorization: `Bearer ${token}` });
    if (res.status === 200) {
        await AccountModel.destroy({ where: { reservation_id: reservationId, id: { [Op.notIn]: before } }, force: true });
    }
    return res;
}
