import { describe, it, expect } from 'vitest';
import request from 'supertest';
import createApp from '../bootstrap/createApp.js';

// /health é a probe de prontidão do k8s e o healthcheck do contêiner. Duas perguntas separadas
// (🟡-4 do qa-redteam da H.3):
// - "consigo responder HTTP?" → banco do analytics no ar. Banco fora → 503: o pod sai do Service.
// - "a projeção está andando?" → estado do consumidor. Parado → 200 com status DEGRADED e o campo
//   `consumer`: as 7 consultas continuam respondendo com a projeção um pouco defasada, em vez de o
//   pod sair do Service e a tela /indicadores dar 502 em tudo enquanto o broker reinicia.
// (Na H.2, 🟢-3, consumidor parado dava 503; fazia sentido antes de o serviço receber tráfego.)

const saude = (opcoes) => request(createApp(opcoes)).get('/health');

describe('GET /health', () => {
    it('banco no ar e consumidor consumindo → 200 OK', async () => {
        const res = await saude({ consumerStatus: () => 'consuming' });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 'OK', database: 'up', consumer: 'consuming' });
    });

    it('consumidor desligado de propósito (sem RABBITMQ_HOST) não é degradação → 200 OK', async () => {
        const res = await saude();
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 'OK', consumer: 'disabled' });
    });

    it.each(['connecting', 'stopped'])('consumidor %s (broker fora, topologia ausente) → 200 DEGRADED: o pod segue pronto', async (estado) => {
        const res = await saude({ consumerStatus: () => estado });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 'DEGRADED', database: 'up', consumer: estado });
    });

    it('banco do analytics fora → 503 DOWN, sem expor a mensagem do erro', async () => {
        const res = await saude({ consumerStatus: () => 'consuming', checkDatabase: async () => { throw new Error('ECONNREFUSED 10.0.0.5:5432 senha=x'); } });
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ status: 'DOWN', database: 'down' });
        expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|senha/);
    });

    it('banco fora e consumidor parado → 503 DOWN (o banco decide a prontidão)', async () => {
        const res = await saude({ consumerStatus: () => 'connecting', checkDatabase: async () => { throw new Error('x'); } });
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ status: 'DOWN', database: 'down', consumer: 'connecting' });
    });
});
