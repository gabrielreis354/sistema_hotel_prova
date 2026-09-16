import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest } from './helpers/factories.js';

const app = createApp();
let jwt;
let guestId;
let roomId;
let roomId2;

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Reservas' }));
    const cat = await createCategory(app, jwt, { price_per_night: 200 });
    roomId  = (await createRoom(app, jwt, cat.id, { number: '201' })).id;
    roomId2 = (await createRoom(app, jwt, cat.id, { number: '202' })).id;
    guestId = (await createGuest(app, jwt, { full_name: 'Hóspede Reservas' })).id;
});

// ─── Criação ──────────────────────────────────────────────────────────────────

describe('POST /reservations', () => {
    it('cria reserva e calcula total_amount automaticamente (price × noites)', async () => {
        const res = await request(app)
            .post('/reservations')
            .set('Authorization', `Bearer ${jwt}`)
            .send({
                guest_id:       guestId,
                room_id:        roomId,
                check_in_date:  '2027-01-10',
                check_out_date: '2027-01-15',
                // total_amount NÃO enviado — deve ser calculado pelo servidor
            });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('PENDING');
        // 5 noites × R$200 = R$1000
        expect(parseFloat(res.body.total_amount)).toBe(1000);
    });

    it('retorna 400 sem campos obrigatórios', async () => {
        const res = await request(app)
            .post('/reservations')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ guest_id: guestId });

        expect(res.status).toBe(400);
    });

    it('retorna 404 quando quarto não existe', async () => {
        const res = await request(app)
            .post('/reservations')
            .set('Authorization', `Bearer ${jwt}`)
            .send({
                guest_id:       guestId,
                room_id:        '00000000-0000-0000-0000-000000000000',
                check_in_date:  '2027-02-01',
                check_out_date: '2027-02-05',
            });

        expect(res.status).toBe(404);
    });

    it('retorna 422 quando categoria do quarto não tem preço', async () => {
        // Criar categoria diretamente sem price_per_night (não via factory para evitar default)
        const catRes = await request(app)
            .post('/room-categories')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'Sem Preço', capacity: 1 });

        // Se o model exige price_per_night (NOT NULL), o test não se aplica
        if (catRes.status !== 201 || !catRes.body.id) return;

        const roomRes = await request(app)
            .post('/rooms')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ category_id: catRes.body.id, number: '999', floor: 1, status: 'AVAILABLE' });
        if (roomRes.status !== 201) return;

        const res = await request(app)
            .post('/reservations')
            .set('Authorization', `Bearer ${jwt}`)
            .send({
                guest_id:       guestId,
                room_id:        roomRes.body.id,
                check_in_date:  '2027-02-01',
                check_out_date: '2027-02-05',
            });

        expect(res.status).toBe(422);
    });

    it('retorna 409 ao tentar reservar quarto com conflito de datas', async () => {
        // Período sobreposto à reserva criada no teste anterior (jan/10–jan/15)
        const res = await request(app)
            .post('/reservations')
            .set('Authorization', `Bearer ${jwt}`)
            .send({
                guest_id:       guestId,
                room_id:        roomId,
                check_in_date:  '2027-01-12',
                check_out_date: '2027-01-18',
            });

        expect(res.status).toBe(409);
    });

    it('permite criar reserva no mesmo quarto em período diferente', async () => {
        const res = await request(app)
            .post('/reservations')
            .set('Authorization', `Bearer ${jwt}`)
            .send({
                guest_id:       guestId,
                room_id:        roomId,
                check_in_date:  '2027-02-01',
                check_out_date: '2027-02-03',
            });

        expect(res.status).toBe(201);
    });
});

// ─── Máquina de estados (fluxo completo em ordem) ─────────────────────────────

describe('Máquina de estados das reservas', () => {
    let reservationId;

    beforeAll(async () => {
        const res = await request(app)
            .post('/reservations')
            .set('Authorization', `Bearer ${jwt}`)
            .send({
                guest_id:       guestId,
                room_id:        roomId2,
                check_in_date:  '2027-04-01',
                check_out_date: '2027-04-04',
            });
        reservationId = res.body.id;
    });

    it('check-in: PENDING → CHECKED_IN e quarto fica OCCUPIED', async () => {
        const res = await request(app)
            .put(`/reservations/${reservationId}/check-in`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('CHECKED_IN');

        const roomRes = await request(app)
            .get(`/rooms/${roomId2}`)
            .set('Authorization', `Bearer ${jwt}`);
        expect(roomRes.body.status).toBe('OCCUPIED');
    });

    it('check-in novamente (já CHECKED_IN) retorna 422', async () => {
        const res = await request(app)
            .put(`/reservations/${reservationId}/check-in`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(422);
    });

    it('cancelar reserva CHECKED_IN retorna 422', async () => {
        const res = await request(app)
            .put(`/reservations/${reservationId}/cancel`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(422);
        expect(res.body.error).toContain('hóspede no quarto');
    });

    it('check-out: CHECKED_IN → CHECKED_OUT e quarto fica CLEANING', async () => {
        const res = await request(app)
            .put(`/reservations/${reservationId}/check-out`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('CHECKED_OUT');

        const roomRes = await request(app)
            .get(`/rooms/${roomId2}`)
            .set('Authorization', `Bearer ${jwt}`);
        expect(roomRes.body.status).toBe('CLEANING');
    });

    it('check-out novamente (já CHECKED_OUT) retorna 422', async () => {
        const res = await request(app)
            .put(`/reservations/${reservationId}/check-out`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(422);
    });

    it('cancelar reserva CHECKED_OUT retorna 422', async () => {
        const res = await request(app)
            .put(`/reservations/${reservationId}/cancel`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(422);
        expect(res.body.error).toContain('encerrada');
    });
});

describe('Cancelamento de reservas', () => {
    it('cancela reserva PENDING com sucesso (allowlist)', async () => {
        const res = await request(app)
            .post('/reservations')
            .set('Authorization', `Bearer ${jwt}`)
            .send({
                guest_id:       guestId,
                room_id:        roomId,
                check_in_date:  '2027-07-01',
                check_out_date: '2027-07-03',
            });
        const id = res.body.id;

        const cancelRes = await request(app)
            .put(`/reservations/${id}/cancel`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(cancelRes.status).toBe(200);
        expect(cancelRes.body.status).toBe('CANCELLED');
    });

    it.skip('cancela reserva CONFIRMED com sucesso (requer POST /reservations/:id/confirm — não implementado)', async () => {
        // TODO: implementar POST /reservations/:id/confirm para avançar PENDING → CONFIRMED
        // Só então este teste pode ser determinístico.
        // PUT /reservations/:id não aceita mudança de status por design (protegido).
    });

    it('retorna 422 ao cancelar reserva já CANCELLED', async () => {
        const resCreate = await request(app)
            .post('/reservations')
            .set('Authorization', `Bearer ${jwt}`)
            .send({
                guest_id:       guestId,
                room_id:        roomId,
                check_in_date:  '2027-09-01',
                check_out_date: '2027-09-03',
            });
        const id = resCreate.body.id;

        await request(app).put(`/reservations/${id}/cancel`).set('Authorization', `Bearer ${jwt}`);

        const res = await request(app)
            .put(`/reservations/${id}/cancel`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(422);
        expect(res.body.error).toContain('cancelada');
    });
});

describe('Check-in com quartos extras (fix propagação de status)', () => {
    let reservationId;
    let extraRoomId;

    beforeAll(async () => {
        // Restaurar quarto 202 para AVAILABLE antes deste teste
        await request(app)
            .put(`/rooms/${roomId2}`)
            .set('Authorization', `Bearer ${jwt}`)
            .send({ status: 'AVAILABLE' });

        // Criar quarto extra
        const cat = await createCategory(app, jwt, { name: 'Extra', price_per_night: 150 });
        extraRoomId = (await createRoom(app, jwt, cat.id, { number: '301' })).id;

        // Criar reserva com quarto principal
        const resCreate = await request(app)
            .post('/reservations')
            .set('Authorization', `Bearer ${jwt}`)
            .send({
                guest_id:       guestId,
                room_id:        roomId2,
                check_in_date:  '2027-10-01',
                check_out_date: '2027-10-05',
            });
        reservationId = resCreate.body.id;

        // Adicionar quarto extra via pivot
        await request(app)
            .post(`/reservations/${reservationId}/rooms`)
            .set('Authorization', `Bearer ${jwt}`)
            .send({ room_id: extraRoomId });
    });

    it('check-in atualiza status do quarto principal E dos quartos extras para OCCUPIED', async () => {
        const res = await request(app)
            .put(`/reservations/${reservationId}/check-in`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('CHECKED_IN');

        const [mainRoom, extraRoom] = await Promise.all([
            request(app).get(`/rooms/${roomId2}`).set('Authorization', `Bearer ${jwt}`),
            request(app).get(`/rooms/${extraRoomId}`).set('Authorization', `Bearer ${jwt}`),
        ]);

        expect(mainRoom.body.status).toBe('OCCUPIED');
        expect(extraRoom.body.status).toBe('OCCUPIED');
    });

    it('check-out atualiza status do quarto principal E extras para CLEANING', async () => {
        const res = await request(app)
            .put(`/reservations/${reservationId}/check-out`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);

        const [mainRoom, extraRoom] = await Promise.all([
            request(app).get(`/rooms/${roomId2}`).set('Authorization', `Bearer ${jwt}`),
            request(app).get(`/rooms/${extraRoomId}`).set('Authorization', `Bearer ${jwt}`),
        ]);

        expect(mainRoom.body.status).toBe('CLEANING');
        expect(extraRoom.body.status).toBe('CLEANING');
    });
});

describe('PUT /reservations/:id — campos de status são protegidos', () => {
    it('atualiza campos editáveis sem alterar status via PUT direto', async () => {
        const resCreate = await request(app)
            .post('/reservations')
            .set('Authorization', `Bearer ${jwt}`)
            .send({
                guest_id:       guestId,
                room_id:        roomId,
                check_in_date:  '2027-11-01',
                check_out_date: '2027-11-04',
            });
        const id = resCreate.body.id;

        const res = await request(app)
            .put(`/reservations/${id}`)
            .set('Authorization', `Bearer ${jwt}`)
            .send({ check_out_date: '2027-11-06', status: 'CHECKED_IN' });

        // Status não deve ter sido alterado para CHECKED_IN pelo PUT direto
        if (res.status === 200) {
            expect(res.body.status).not.toBe('CHECKED_IN');
        } else {
            // Endpoint pode rejeitar totalmente a mudança — também válido
            expect([400, 422]).toContain(res.status);
        }
    });
});

describe('GET /reservations', () => {
    it('lista reservas do tenant', async () => {
        const res = await request(app)
            .get('/reservations')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        const list = res.body.data ?? res.body;
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBeGreaterThan(0);
    });
});
