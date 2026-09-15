/**
 * Tenant Isolation Tests
 * Garante que dados de um tenant nunca vazam para outro tenant.
 * Esta é a propriedade de segurança mais crítica do sistema SaaS.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';

const app = createApp();

let jwtA; // Tenant A
let jwtB; // Tenant B
let roomIdA;
let guestIdA;
let reservationIdA;

beforeAll(async () => {
    await truncateAll();

    // Criar dois tenants independentes
    ({ jwt: jwtA } = await registerAndLogin(app, { tenantName: 'Tenant Alpha' }));
    ({ jwt: jwtB } = await registerAndLogin(app, { tenantName: 'Tenant Beta' }));

    // Criar dados no Tenant A
    const catA   = await createCategory(app, jwtA, { name: 'Suite Alpha' });
    const roomA  = await createRoom(app, jwtA, catA.id, { number: 'A01' });
    const guestA = await createGuest(app, jwtA, { full_name: 'Hóspede Alpha', cpf: '11111111111' });
    const resA   = await createReservation(app, jwtA, guestA.id, roomA.id);

    roomIdA        = roomA.id;
    guestIdA       = guestA.id;
    reservationIdA = resA.id;

    // Criar dados no Tenant B (para garantir que existem registros em ambos)
    const catB  = await createCategory(app, jwtB, { name: 'Suite Beta' });
    const roomB = await createRoom(app, jwtB, catB.id, { number: 'B01' });
    const guestB = await createGuest(app, jwtB, { full_name: 'Hóspede Beta', cpf: '22222222222' });
    await createReservation(app, jwtB, guestB.id, roomB.id, {
        check_in_date:  '2027-05-01',
        check_out_date: '2027-05-05',
    });
});

describe('Isolamento de quartos', () => {
    it('Tenant B não enxerga quartos do Tenant A na listagem', async () => {
        const res = await request(app)
            .get('/rooms')
            .set('Authorization', `Bearer ${jwtB}`);

        expect(res.status).toBe(200);
        const list = res.body.data ?? res.body;
        const ids = list.map(r => r.id);
        expect(ids).not.toContain(roomIdA);
    });

    it('Tenant B recebe 404 ao tentar buscar quarto do Tenant A por ID', async () => {
        const res = await request(app)
            .get(`/rooms/${roomIdA}`)
            .set('Authorization', `Bearer ${jwtB}`);

        expect(res.status).toBe(404);
    });

    it('Tenant B não enxerga quartos do Tenant A em /rooms/available', async () => {
        const res = await request(app)
            .get('/rooms/available?check_in=2027-03-01&check_out=2027-03-05')
            .set('Authorization', `Bearer ${jwtB}`);

        expect(res.status).toBe(200);
        const ids = res.body.map(r => r.id);
        expect(ids).not.toContain(roomIdA);
    });
});

describe('Isolamento de hóspedes', () => {
    it('Tenant B não enxerga hóspedes do Tenant A', async () => {
        const res = await request(app)
            .get('/guests')
            .set('Authorization', `Bearer ${jwtB}`);

        expect(res.status).toBe(200);
        const list = res.body.data ?? res.body;
        const ids = list.map(g => g.id);
        expect(ids).not.toContain(guestIdA);
    });

    it('Tenant B recebe 404 ao buscar hóspede do Tenant A por ID', async () => {
        const res = await request(app)
            .get(`/guests/${guestIdA}`)
            .set('Authorization', `Bearer ${jwtB}`);

        expect(res.status).toBe(404);
    });

    it('CPF usado no Tenant A pode ser cadastrado no Tenant B (unique por tenant)', async () => {
        const res = await request(app)
            .post('/guests')
            .set('Authorization', `Bearer ${jwtB}`)
            .send({ full_name: 'Hóspede CPF Compartilhado', cpf: '11111111111' });

        // CPF '11111111111' existe no Tenant A mas não no Tenant B — deve ser permitido
        expect(res.status).toBe(201);
    });
});

describe('Isolamento de reservas', () => {
    it('Tenant B não enxerga reservas do Tenant A', async () => {
        const res = await request(app)
            .get('/reservations')
            .set('Authorization', `Bearer ${jwtB}`);

        expect(res.status).toBe(200);
        const list = res.body.data ?? res.body;
        const ids = list.map(r => r.id);
        expect(ids).not.toContain(reservationIdA);
    });

    it('Tenant B recebe 404 ao tentar fazer check-in em reserva do Tenant A', async () => {
        const res = await request(app)
            .put(`/reservations/${reservationIdA}/check-in`)
            .set('Authorization', `Bearer ${jwtB}`);

        expect(res.status).toBe(404);
    });

    it('Tenant B recebe 404 ao tentar cancelar reserva do Tenant A', async () => {
        const res = await request(app)
            .put(`/reservations/${reservationIdA}/cancel`)
            .set('Authorization', `Bearer ${jwtB}`);

        expect(res.status).toBe(404);
    });
});

describe('Isolamento de pagamentos', () => {
    it('Tenant B não enxerga pagamentos do Tenant A', async () => {
        // Criar pagamento no Tenant A
        const payRes = await request(app)
            .post('/payments')
            .set('Authorization', `Bearer ${jwtA}`)
            .send({ reservation_id: reservationIdA, amount: 500, method: 'PIX' });

        const paymentIdA = payRes.body.id;

        // Tenant B tenta listar
        const listRes = await request(app)
            .get('/payments')
            .set('Authorization', `Bearer ${jwtB}`);

        const list = listRes.body.data ?? listRes.body;
        const ids = list.map(p => p.id);
        expect(ids).not.toContain(paymentIdA);
    });
});

describe('Acesso sem autenticação', () => {
    it('GET /reservations sem token retorna 401', async () => {
        const res = await request(app).get('/reservations');
        expect(res.status).toBe(401);
    });

    it('GET /rooms sem token retorna 401', async () => {
        const res = await request(app).get('/rooms');
        expect(res.status).toBe(401);
    });

    it('GET /guests sem token retorna 401', async () => {
        const res = await request(app).get('/guests');
        expect(res.status).toBe(401);
    });
});

describe('Mutação cross-tenant bloqueada', () => {
    it('Tenant B recebe 404 ao tentar atualizar quarto do Tenant A via PUT', async () => {
        const res = await request(app)
            .put(`/rooms/${roomIdA}`)
            .set('Authorization', `Bearer ${jwtB}`)
            .send({ status: 'MAINTENANCE' });

        expect(res.status).toBe(404);
    });

    it('Tenant B recebe 404 ao tentar atualizar hóspede do Tenant A via PUT', async () => {
        const res = await request(app)
            .put(`/guests/${guestIdA}`)
            .set('Authorization', `Bearer ${jwtB}`)
            .send({ phone: '00000000000' });

        expect(res.status).toBe(404);
    });
});
