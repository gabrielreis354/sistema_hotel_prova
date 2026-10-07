import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';
import { isRouteAllowedForRole } from '../app/utils/roles.js';

const app = createApp();

// SPEC-04 §6 / CA-04.1.n — least privilege do WAITER.
//
// O garçom lança consumo pelo celular: precisa do cardápio (GET /products) e das
// comandas (/accounts). Tudo o mais — reservas com dados do hóspede, cadastro de
// hóspedes, pagamentos, B2B, configuração do hotel — é 403.
//
// A regra é ALLOWLIST: o que não está liberado é negado. Por isso o teste cobre um
// endpoint de CADA router autenticado, inclusive os que o CA não cita: um router
// novo que esqueça de se proteger tem que nascer fechado para o garçom.

async function createUserToken(adminJwt, role) {
    const email = `${role.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.com`;
    const password = 'senha123';
    const created = await request(app)
        .post('/users')
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ name: role, email, password, role });
    expect(created.status).toBe(201);

    const login = await request(app).post('/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    return login.body.token;
}

describe('WAITER — least privilege (CA-04.1.n)', () => {
    let adminJwt;
    let waiterJwt;
    let receptionistJwt;
    let reservationId;
    let guestId;
    let productId;

    beforeAll(async () => {
        await truncateAll();
        ({ jwt: adminJwt } = await registerAndLogin(app, { tenantName: 'Hotel Least Privilege' }));
        waiterJwt = await createUserToken(adminJwt, 'WAITER');
        receptionistJwt = await createUserToken(adminJwt, 'RECEPTIONIST');

        // IDs REAIS: o 403 precisa vir antes de qualquer busca. Com ID inexistente
        // um 404 passaria por "bloqueado" e esconderia o vazamento.
        const category = await createCategory(app, adminJwt);
        const room = await createRoom(app, adminJwt, category.id);
        const guest = await createGuest(app, adminJwt);
        guestId = guest.id;
        const reservation = await createReservation(app, adminJwt, guest.id, room.id);
        reservationId = reservation.id;

        const product = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${adminJwt}`)
            .send({ name: 'Água 500ml', price: 5, category: 'DRINK' });
        expect(product.status).toBe(201);
        productId = product.body.id;
    });

    // ─── CA-04.1.n.2 / n.3 — o que o CA cita, um 403 por rota ──────────────────
    const bloqueadasDoCa = [
        ['GET',  '/reservations'],
        ['GET',  '/reservations/:reservation'],
        ['PUT',  '/reservations/:reservation/check-in'],
        ['PUT',  '/reservations/:reservation/check-out'],
        ['GET',  '/reservations/:reservation/bill'],
        ['GET',  '/guests'],
        ['GET',  '/guests/:guest'],
        ['GET',  '/payments'],
        ['POST', '/payments']
    ];

    // ─── Allowlist: os demais routers autenticados também fecham ───────────────
    const bloqueadasPorAllowlist = [
        ['POST', '/reservations'],
        ['GET',  '/reservations/:reservation/consumptions'],
        ['POST', '/guests'],
        ['GET',  '/tenants/me'],
        ['GET',  '/room-categories'],
        ['GET',  '/corporate-clients'],
        ['GET',  '/event-quotes'],
        ['GET',  '/contracts'],
        ['GET',  '/address/01310100'],
        ['GET',  '/rooms'],
        ['GET',  '/users'],
        ['GET',  '/analytics/revenue']
    ];

    // `:reservation` e `:guest` viram os IDs reais criados no beforeAll.
    const resolve = (url) => url.replace(':reservation', reservationId).replace(':guest', guestId);

    it.each([...bloqueadasDoCa, ...bloqueadasPorAllowlist])('%s %s → 403 para WAITER', async (method, url) => {
        const res = await request(app)[method.toLowerCase()](resolve(url))
            .set('Authorization', `Bearer ${waiterJwt}`)
            .send({});
        expect(res.status).toBe(403);
    });

    it('o 403 não vaza dado nenhum no corpo', async () => {
        const res = await request(app)
            .get(`/reservations/${reservationId}`)
            .set('Authorization', `Bearer ${waiterJwt}`);
        expect(res.status).toBe(403);
        expect(Object.keys(res.body)).toEqual(['error']);
    });

    // ─── CA-04.1.n.1 — o que o garçom PODE ─────────────────────────────────────
    it('GET /products → 200 (cardápio)', async () => {
        const res = await request(app).get('/products').set('Authorization', `Bearer ${waiterJwt}`);
        expect(res.status).toBe(200);
    });

    it('GET /products/:id → 200', async () => {
        const res = await request(app).get(`/products/${productId}`).set('Authorization', `Bearer ${waiterJwt}`);
        expect(res.status).toBe(200);
    });

    it('GET /products?query → a query string não fura nem quebra a allowlist', async () => {
        const res = await request(app).get('/products?category=DRINK').set('Authorization', `Bearer ${waiterJwt}`);
        expect(res.status).toBe(200);
    });

    it('escrita no cardápio continua 403 (requireRole ADMIN de antes)', async () => {
        const res = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${waiterJwt}`)
            .send({ name: 'Cortesia do garçom', price: 0 });
        expect(res.status).toBe(403);
    });

    // ─── Regressão: os outros papéis não perdem acesso ─────────────────────────
    it('RECEPTIONIST continua lendo reservas, hóspedes e pagamentos', async () => {
        for (const url of ['/reservations', `/reservations/${reservationId}/bill`, '/guests', '/payments']) {
            const res = await request(app).get(url).set('Authorization', `Bearer ${receptionistJwt}`);
            expect(res.status, url).toBe(200);
        }
    });

    it('ADMIN continua lendo B2B e configuração do hotel', async () => {
        for (const url of ['/corporate-clients', '/tenants/me', '/room-categories']) {
            const res = await request(app).get(url).set('Authorization', `Bearer ${adminJwt}`);
            expect(res.status, url).toBe(200);
        }
    });
});

// Regra pura, sem banco: pega o que o teste HTTP não alcança — rotas que ainda não
// existem (o 404 mascararia um "liberado") e a âncora das regex.
describe('isRouteAllowedForRole — allowlist do WAITER', () => {
    it.each([
        ['GET',  '/products'],
        ['GET',  '/products/'],
        ['GET',  '/products/abc'],
        ['GET',  '/accounts'],
        ['GET',  '/accounts/abc'],
        ['POST', '/accounts'],
        ['POST', '/accounts/abc/items']
    ])('WAITER pode %s %s', (method, path) => {
        expect(isRouteAllowedForRole('WAITER', method, path)).toBe(true);
    });

    it.each([
        ['GET',    '/productsX'],              // prefixo parecido — âncora da regex
        ['GET',    '/products/abc/extra'],
        ['POST',   '/products'],
        ['GET',    '/accountsX'],
        ['GET',    '/accounts/abc/bill'],      // saldo e pagamentos (T-04.3) — CA-04.1.n.2
        ['PUT',    '/accounts/abc/close'],
        ['DELETE', '/accounts/abc'],           // só ADMIN (D-8)
        ['DELETE', '/accounts/abc/items/xyz'], // só ADMIN (D-8)
        ['GET',    '/reservations'],
        ['GET',    '/guests']
    ])('WAITER NÃO pode %s %s', (method, path) => {
        expect(isRouteAllowedForRole('WAITER', method, path)).toBe(false);
    });

    it('ADMIN e RECEPTIONIST seguem para o requireRole de cada rota', () => {
        expect(isRouteAllowedForRole('ADMIN', 'GET', '/guests')).toBe(true);
        expect(isRouteAllowedForRole('RECEPTIONIST', 'DELETE', '/accounts/abc')).toBe(true);
    });

    it('papel desconhecido ou ausente é negado (o próximo papel nasce sem acesso)', () => {
        expect(isRouteAllowedForRole('HOUSEKEEPER', 'GET', '/products')).toBe(false);
        expect(isRouteAllowedForRole(undefined, 'GET', '/products')).toBe(false);
    });
});
