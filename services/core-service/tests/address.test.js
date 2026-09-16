import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';

const app = createApp();
let jwt;

function mockFetchOnce(implementation) {
    const fetchMock = vi.fn(implementation);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Endereco' }));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('GET /address/:cep', () => {
    it('retorna 401 sem token', async () => {
        const res = await request(app).get('/address/01310100');
        expect(res.status).toBe(401);
    });

    it('retorna 400 para CEP mal formado, sem chamar a ViaCEP', async () => {
        const fetchMock = mockFetchOnce(() => { throw new Error('não deveria ser chamado'); });

        const res = await request(app)
            .get('/address/123')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('retorna 200 com endereço estruturado para CEP válido', async () => {
        mockFetchOnce(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                cep: '01310-100',
                logradouro: 'Avenida Paulista',
                bairro: 'Bela Vista',
                localidade: 'São Paulo',
                uf: 'SP',
                complemento: 'até 610 - lado par'
            })
        }));

        const res = await request(app)
            .get('/address/01310-100')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            street: 'Avenida Paulista',
            neighborhood: 'Bela Vista',
            city: 'São Paulo',
            state: 'SP'
        });
    });

    it('retorna 404 quando a ViaCEP responde { erro: true }', async () => {
        mockFetchOnce(async () => ({
            ok: true,
            status: 200,
            json: async () => ({ erro: true })
        }));

        const res = await request(app)
            .get('/address/00000000')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(404);
    });

    it('retorna 503 quando a ViaCEP está indisponível (fetch rejeita)', async () => {
        mockFetchOnce(async () => { throw new Error('network error'); });

        const res = await request(app)
            .get('/address/01310100')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(503);
    });

    it('retorna 503 quando a ViaCEP responde status não-2xx', async () => {
        mockFetchOnce(async () => ({ ok: false, status: 500 }));

        const res = await request(app)
            .get('/address/01310100')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(503);
    });
});
