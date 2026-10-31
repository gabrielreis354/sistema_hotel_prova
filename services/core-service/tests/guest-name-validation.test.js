import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createGuest } from './helpers/factories.js';

// Raiz do 🟡-4 do qa-redteam da H.2 (repasse para_indefinido_23102026): hóspede sem nome deixava a ficha
// e o rack em branco e publicava guest.updated com nome vazio. Fail Fast: nome é texto não vazio.

const app = createApp();
let jwt;
let guestId;
const auth = () => ({ Authorization: `Bearer ${jwt}` });

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Nome Obrigatório' }));
    guestId = (await createGuest(app, jwt, { full_name: 'Nome Original' })).id;
});

describe('full_name em branco é recusado com 400', () => {
    it.each(['', '   ', '\t\n'])('POST /guests com full_name %j → 400', async (nome) => {
        const res = await request(app).post('/guests').set(auth()).send({ full_name: nome });
        expect(res.status).toBe(400);
    });

    it('POST /guests com full_name que não é texto → 400', async () => {
        expect((await request(app).post('/guests').set(auth()).send({ full_name: 123 })).status).toBe(400);
    });

    it.each(['', '   ', null, 42])('PUT /guests/:id com full_name %j → 400 e o nome não muda', async (nome) => {
        const res = await request(app).put(`/guests/${guestId}`).set(auth()).send({ full_name: nome });
        expect(res.status).toBe(400);
        const atual = await request(app).get(`/guests/${guestId}`).set(auth());
        expect(atual.body.full_name).toBe('Nome Original');
    });

    it('PUT sem full_name continua editando os outros campos', async () => {
        const res = await request(app).put(`/guests/${guestId}`).set(auth()).send({ phone: '11988887777' });
        expect(res.status).toBe(200);
        expect(res.body.full_name).toBe('Nome Original');
    });
});
