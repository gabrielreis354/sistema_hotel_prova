import { describe, it, expect } from 'vitest';
import request from 'supertest';
import createApp from '../bootstrap/createApp.js';

// 🟢-3 do qa-redteam da H.2: /health reflete o consumidor e o banco — degradado → 503, para a probe de
// prontidão (k8s, H.3) e o healthcheck do contêiner não dizerem "saudável" com a projeção parada.

const saude = (opcoes) => request(createApp(opcoes)).get('/health');

describe('GET /health', () => {
    it('banco no ar e consumidor consumindo → 200', async () => {
        const res = await saude({ consumerStatus: () => 'consuming' });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 'OK', database: 'up', consumer: 'consuming' });
    });

    it('consumidor desligado de propósito (sem RABBITMQ_HOST) não é degradação → 200', async () => {
        const res = await saude();
        expect(res.status).toBe(200);
        expect(res.body.consumer).toBe('disabled');
    });

    it.each(['connecting', 'stopped'])('consumidor %s (broker fora, banco fora, topologia ausente) → 503', async (estado) => {
        const res = await saude({ consumerStatus: () => estado });
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ status: 'DEGRADED', consumer: estado });
    });

    it('banco do analytics fora → 503, sem expor a mensagem do erro', async () => {
        const res = await saude({ consumerStatus: () => 'consuming', checkDatabase: async () => { throw new Error('ECONNREFUSED 10.0.0.5:5432 senha=x'); } });
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ status: 'DEGRADED', database: 'down' });
        expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|senha/);
    });
});
