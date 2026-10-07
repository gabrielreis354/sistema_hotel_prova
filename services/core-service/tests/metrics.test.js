import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';

// T-02.4 — /metrics no formato Prometheus, protegido por METRICS_TOKEN.
const app = createApp();
const METRICS_TOKEN = 'metrics_token_de_teste';
let jwt;
let tenantId;

async function scrape() {
    const res = await request(app)
        .get('/metrics')
        .set('Authorization', `Bearer ${METRICS_TOKEN}`);
    expect(res.status).toBe(200);
    return res.text;
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt, tenantId } = await registerAndLogin(app, { tenantName: 'Hotel Metricas' }));
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('GET /metrics — acesso', () => {
    it('sem METRICS_TOKEN no ambiente recusa toda requisição (fail-closed)', async () => {
        vi.stubEnv('METRICS_TOKEN', '');
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const res = await request(app).get('/metrics').set('Authorization', 'Bearer qualquer');
            expect(res.status).toBe(503);
            expect(res.text).not.toContain('http_request_duration_seconds');
        } finally {
            errorSpy.mockRestore();
        }
    });

    it('sem cabeçalho Authorization retorna 401', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        const res = await request(app).get('/metrics');
        expect(res.status).toBe(401);
    });

    it('com token errado retorna 401', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        const res = await request(app).get('/metrics').set('Authorization', 'Bearer token_errado');
        expect(res.status).toBe(401);
    });

    it('o JWT de um usuário do hotel não abre /metrics', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        const res = await request(app).get('/metrics').set('Authorization', `Bearer ${jwt}`);
        expect(res.status).toBe(401);
    });

    it('com o token certo devolve o formato de exposição do Prometheus', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        const res = await request(app).get('/metrics').set('Authorization', `Bearer ${METRICS_TOKEN}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/plain');
        expect(res.text).toContain('process_cpu_seconds_total');
        expect(res.text).toContain('service="core-service"');
    });
});

describe('GET /metrics — conteúdo', () => {
    it('mede a latência pelo PADRÃO da rota, nunca pelo id cru', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        const guestId = randomUUID();
        await request(app).get(`/guests/${guestId}`).set('Authorization', `Bearer ${jwt}`);

        const text = await scrape();
        expect(text).toMatch(/http_request_duration_seconds_count\{[^}]*route="\/guests\/:id"[^}]*\}/);
        expect(text).not.toContain(guestId);
    });

    it('registra o status, permitindo calcular taxa de erro', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        await request(app).get('/health');

        const text = await scrape();
        expect(text).toMatch(/http_request_duration_seconds_count\{[^}]*method="GET"[^}]*route="\/health"[^}]*status_code="200"/);
    });

    it('requisição barrada pelo auth fica no router montado, não em "unmatched"', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        await request(app).get('/reservations');

        const text = await scrape();
        expect(text).toMatch(/route="\/reservations\/\*"[^}]*status_code="401"/);
    });

    it('caminho que não existe vira "unmatched" — scanner não cria série nova', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        await request(app).get('/wp-admin/setup-config.php');

        const text = await scrape();
        expect(text).toContain('route="unmatched"');
        expect(text).not.toContain('wp-admin');
    });

    it('o subdomínio do motor de reserva volta ao padrão da rota', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        await request(app).get('/public/hotel-que-nao-existe-xyz/hotel');

        const text = await scrape();
        expect(text).toContain('route="/public/:subdomain/hotel"');
        expect(text).not.toContain('hotel-que-nao-existe-xyz');
    });

    it('conta requisições autenticadas por tenant', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        await request(app).get('/guests').set('Authorization', `Bearer ${jwt}`);

        const text = await scrape();
        expect(text).toMatch(new RegExp(`http_requests_by_tenant_total\\{[^}]*tenant_id="${tenantId}"[^}]*\\} [1-9]`));
    });

    it('o próprio scrape não é medido', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        await scrape();

        const text = await scrape();
        expect(text).not.toContain('route="/metrics"');
    });
});
