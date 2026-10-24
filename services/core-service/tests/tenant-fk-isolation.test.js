/**
 * Isolamento por chave estrangeira vinda do corpo da requisição.
 *
 * A FK do banco só confere que o id EXISTE, não que é do mesmo hotel. Todo id de outra
 * entidade que chega no corpo (category_id, guest_id, room_id...) precisa ser buscado com
 * o tenant do JWT — senão o hotel A passa a apontar para um registro do hotel B.
 *
 * Origem: R-1 do repasse do qa-redteam de 21/10/2026 (docs/qa/repasses/para_sirlande_21102026.md).
 * Outro hotel responde 404, como em todo o sistema: não confirma que o id existe.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';

const app = createApp();
const auth = (jwt) => ({ Authorization: `Bearer ${jwt}` });
const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

let A; // hotel A — quem ataca
let B; // hotel B — dono dos ids
let catA;
let catB;
let roomA;
let roomB;
let guestA;
let guestB;

beforeAll(async () => {
    await truncateAll();
    A = await registerAndLogin(app, { tenantName: 'Hotel FK Alpha' });
    B = await registerAndLogin(app, { tenantName: 'Hotel FK Beta' });

    catA = await createCategory(app, A.jwt, { name: 'Standard A', price_per_night: '150.00' });
    catB = await createCategory(app, B.jwt, { name: 'Luxo B secreta', price_per_night: '999.00' });
    roomA = await createRoom(app, A.jwt, catA.id, { number: 'A-101' });
    roomB = await createRoom(app, B.jwt, catB.id, { number: 'B-101' });
    guestA = await createGuest(app, A.jwt, { full_name: 'Hóspede Alpha', email: 'alpha@fk.test' });
    guestB = await createGuest(app, B.jwt, { full_name: 'Hóspede Beta', email: 'beta@fk.test' });
});

describe('R-1 — category_id de outro hotel no quarto', () => {
    it('PUT /rooms/:id com category_id do hotel B → 404, e o quarto continua na categoria de A', async () => {
        const res = await request(app).put(`/rooms/${roomA.id}`).set(auth(A.jwt)).send({ category_id: catB.id });
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('CATEGORY_NOT_FOUND');

        const get = await request(app).get(`/rooms/${roomA.id}`).set(auth(A.jwt));
        expect(get.body.category_id).toBe(catA.id);
        expect(get.body.category.name).toBe('Standard A');
        expect(get.body.category.tenant_id).toBe(A.tenantId);
    });

    it('GET /rooms do hotel A nunca devolve nome nem diária da categoria do hotel B', async () => {
        await request(app).put(`/rooms/${roomA.id}`).set(auth(A.jwt)).send({ category_id: catB.id });

        const res = await request(app).get('/rooms').set(auth(A.jwt));
        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).not.toContain('Luxo B secreta');
        expect(JSON.stringify(res.body)).not.toContain('999.00');
    });

    it('a reserva do hotel A é cobrada pela diária de A, não pela do hotel B', async () => {
        await request(app).put(`/rooms/${roomA.id}`).set(auth(A.jwt)).send({ category_id: catB.id });

        const reservation = await createReservation(app, A.jwt, guestA.id, roomA.id, {
            check_in_date: '2027-08-01',
            check_out_date: '2027-08-03'
        });
        expect(reservation.total_amount).toBe('300.00');
    });

    it('PUT /rooms/:id com category_id inexistente → 404 (antes: 500 da FK)', async () => {
        const res = await request(app).put(`/rooms/${roomA.id}`).set(auth(A.jwt)).send({ category_id: UUID_INEXISTENTE });
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('PUT /rooms/:id com category_id que não é UUID → 404, nunca 500', async () => {
        const res = await request(app).put(`/rooms/${roomA.id}`).set(auth(A.jwt)).send({ category_id: 'abc' });
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('PUT /rooms/:id com categoria excluída do próprio hotel → 404', async () => {
        const morta = await createCategory(app, A.jwt, { name: 'Excluída A', price_per_night: '10.00' });
        await request(app).delete(`/room-categories/${morta.id}`).set(auth(A.jwt));

        const res = await request(app).put(`/rooms/${roomA.id}`).set(auth(A.jwt)).send({ category_id: morta.id });
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('PUT /rooms/:id com categoria do próprio hotel continua funcionando (200)', async () => {
        const outra = await createCategory(app, A.jwt, { name: 'Superior A', price_per_night: '220.00' });
        const res = await request(app).put(`/rooms/${roomA.id}`).set(auth(A.jwt)).send({ category_id: outra.id });
        expect(res.status).toBe(200);
        expect(res.body.category_id).toBe(outra.id);

        await request(app).put(`/rooms/${roomA.id}`).set(auth(A.jwt)).send({ category_id: catA.id });
    });

    it('POST /rooms com category_id do hotel B → 404', async () => {
        const res = await request(app).post('/rooms').set(auth(A.jwt)).send({ category_id: catB.id, number: 'A-X1' });
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('POST /rooms com category_id que não é UUID → 404, nunca 500', async () => {
        const res = await request(app).post('/rooms').set(auth(A.jwt)).send({ category_id: 'abc', number: 'A-X2' });
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('CATEGORY_NOT_FOUND');
    });
});

/**
 * Varredura de 24/10: os endpoints abaixo já validavam o tenant da FK do corpo, mas não tinham
 * teste que travasse a regra. Os que já tinham ficam onde estão (accounts, account-items,
 * account-payments, quote-pdf, reservation-multiroom).
 */
describe('Varredura — FKs do corpo já corretas, agora com teste de regressão', () => {
    let reservationA;
    let clientA;
    let clientB;
    let quoteB;

    const corporateClient = (jwt, sufixo) => request(app).post('/corporate-clients').set(auth(jwt)).send({
        razao_social: `Empresa FK ${sufixo} LTDA`,
        representante_nome: `Representante ${sufixo}`
    });

    const contractBody = (overrides) => ({
        corporate_client_id: clientA.id,
        objeto: 'Hospedagem de evento',
        check_in: '2027-11-01',
        check_out: '2027-11-03',
        pessoas: 4,
        total: 1000,
        testemunha_1: 'Testemunha Um',
        testemunha_2: 'Testemunha Dois',
        ...overrides
    });

    beforeAll(async () => {
        reservationA = await createReservation(app, A.jwt, guestA.id, roomA.id, {
            check_in_date: '2027-09-01',
            check_out_date: '2027-09-03'
        });
        clientA = (await corporateClient(A.jwt, 'A')).body;
        clientB = (await corporateClient(B.jwt, 'B')).body;
        quoteB = (await request(app).post('/event-quotes').set(auth(B.jwt)).send({
            corporate_client_id: clientB.id, check_in: '2027-11-01', check_out: '2027-11-03',
            pessoas: 4, valor_diaria_sem_refeicao: 125
        })).body;
    });

    const reserva = (overrides) => ({
        guest_id: guestA.id, room_id: roomA.id, check_in_date: '2027-12-01', check_out_date: '2027-12-03', ...overrides
    });

    it('POST /reservations com guest_id do hotel B → 404', async () => {
        const res = await request(app).post('/reservations').set(auth(A.jwt)).send(reserva({ guest_id: guestB.id }));
        expect(res.status).toBe(404);
    });

    it('POST /reservations com room_id do hotel B → 404', async () => {
        const res = await request(app).post('/reservations').set(auth(A.jwt)).send(reserva({ room_id: roomB.id }));
        expect(res.status).toBe(404);
    });

    it('POST /reservations com extra_room_ids contendo quarto do hotel B → 404', async () => {
        const res = await request(app).post('/reservations').set(auth(A.jwt)).send(reserva({ extra_room_ids: [roomB.id] }));
        expect(res.status).toBe(404);
    });

    it('PUT /reservations/:id com room_id do hotel B → 404, e o quarto não muda', async () => {
        const res = await request(app).put(`/reservations/${reservationA.id}`).set(auth(A.jwt)).send({ room_id: roomB.id });
        expect(res.status).toBe(404);
        const get = await request(app).get(`/reservations/${reservationA.id}`).set(auth(A.jwt));
        expect(get.body.room_id).toBe(roomA.id);
    });

    it('POST /reservations/:id/rooms com room_id do hotel B → 404', async () => {
        const res = await request(app).post(`/reservations/${reservationA.id}/rooms`).set(auth(A.jwt)).send({ room_id: roomB.id });
        expect(res.status).toBe(404);
    });

    it('POST /payments com reservation_id do hotel B → 404', async () => {
        const reservationB = await createReservation(app, B.jwt, guestB.id, roomB.id, {
            check_in_date: '2027-09-01',
            check_out_date: '2027-09-03'
        });
        const res = await request(app).post('/payments').set(auth(A.jwt))
            .send({ reservation_id: reservationB.id, amount: '10.00', method: 'CASH' });
        expect(res.status).toBe(404);
    });

    it('POST /contracts com corporate_client_id do hotel B → 404', async () => {
        const res = await request(app).post('/contracts').set(auth(A.jwt)).send(contractBody({ corporate_client_id: clientB.id }));
        expect(res.status).toBe(404);
    });

    it('POST /contracts com quote_id do hotel B → 404', async () => {
        const res = await request(app).post('/contracts').set(auth(A.jwt)).send(contractBody({ quote_id: quoteB.id }));
        expect(res.status).toBe(404);
    });

    it('PUT /contracts/:id/sign com room_ids contendo quarto do hotel B → 404, e o contrato não é assinado', async () => {
        const contract = (await request(app).post('/contracts').set(auth(A.jwt)).send(contractBody())).body;
        const res = await request(app).put(`/contracts/${contract.id}/sign`).set(auth(A.jwt)).send({ room_ids: [roomB.id] });
        expect(res.status).toBe(404);
        const get = await request(app).get(`/contracts/${contract.id}`).set(auth(A.jwt));
        expect(get.body.status).toBe('GENERATED');
    });
});
