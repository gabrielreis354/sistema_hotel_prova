import crypto from 'crypto';
import { describe, it, expect, afterEach, vi } from 'vitest';
import MercadoPagoPixProvider from '../app/services/pix/MercadoPagoPixProvider.js';
import { PixProviderUnavailableError, InvalidWebhookSignatureError } from '../app/services/pix/errors.js';

function mockFetchOnce(implementation) {
    const fetchMock = vi.fn(implementation);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function signWebhook({ dataId, requestId = 'req-123', secret, ts = String(Math.floor(Date.now() / 1000)) }) {
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    return {
        headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
        query: { 'data.id': dataId },
        body: {}
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('MercadoPagoPixProvider.createCharge', () => {
    it('lança PixProviderUnavailableError sem MERCADOPAGO_ACCESS_TOKEN', async () => {
        vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', '');
        const provider = new MercadoPagoPixProvider();

        await expect(
            provider.createCharge({ amount: 100, description: 'Sinal', externalId: 'res-1' })
        ).rejects.toBeInstanceOf(PixProviderUnavailableError);
    });

    it('cria cobrança e retorna providerChargeId/qrCode/expiration', async () => {
        vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'TEST-token');
        const fetchMock = mockFetchOnce(async (url, options) => {
            expect(url).toBe('https://api.mercadopago.com/v1/payments');
            expect(options.headers.Authorization).toBe('Bearer TEST-token');
            expect(options.headers['X-Idempotency-Key']).toBe('res-1');
            const body = JSON.parse(options.body);
            expect(body.payment_method_id).toBe('pix');
            expect(body.transaction_amount).toBe(100);

            return {
                ok: true,
                status: 201,
                json: async () => ({
                    id: 123456789,
                    point_of_interaction: { transaction_data: { qr_code: '00020126...copia-e-cola' } }
                })
            };
        });

        const provider = new MercadoPagoPixProvider();
        const charge = await provider.createCharge({
            amount: 100,
            description: 'Sinal',
            externalId: 'res-1',
            payerEmail: 'hospede@example.com'
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(charge.providerChargeId).toBe('123456789');
        expect(charge.qrCode).toBe('00020126...copia-e-cola');
        expect(charge.expiration).toBeInstanceOf(Date);
    });

    it('lança PixProviderUnavailableError quando o fetch rejeita (timeout/rede)', async () => {
        vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'TEST-token');
        mockFetchOnce(async () => { throw new Error('network error'); });

        const provider = new MercadoPagoPixProvider();
        await expect(
            provider.createCharge({ amount: 100, description: 'Sinal', externalId: 'res-1' })
        ).rejects.toBeInstanceOf(PixProviderUnavailableError);
    });

    it('lança PixProviderUnavailableError quando o Mercado Pago responde status não-2xx', async () => {
        vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'TEST-token');
        mockFetchOnce(async () => ({ ok: false, status: 401, json: async () => ({}) }));

        const provider = new MercadoPagoPixProvider();
        await expect(
            provider.createCharge({ amount: 100, description: 'Sinal', externalId: 'res-1' })
        ).rejects.toBeInstanceOf(PixProviderUnavailableError);
    });

    it('lança PixProviderUnavailableError quando a resposta não tem QR Code', async () => {
        vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'TEST-token');
        mockFetchOnce(async () => ({ ok: true, status: 201, json: async () => ({ id: 1 }) }));

        const provider = new MercadoPagoPixProvider();
        await expect(
            provider.createCharge({ amount: 100, description: 'Sinal', externalId: 'res-1' })
        ).rejects.toBeInstanceOf(PixProviderUnavailableError);
    });
});

describe('MercadoPagoPixProvider.verifyWebhook', () => {
    it('lança InvalidWebhookSignatureError sem MERCADOPAGO_WEBHOOK_SECRET', () => {
        vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', '');
        const provider = new MercadoPagoPixProvider();
        const request = { headers: { 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'r1' }, query: { 'data.id': '1' }, body: {} };

        expect(() => provider.verifyWebhook(request)).toThrow(InvalidWebhookSignatureError);
    });

    it('aceita notificação com assinatura válida e devolve providerChargeId', () => {
        vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', 'segredo-webhook');
        const request = signWebhook({ dataId: '987654321', secret: 'segredo-webhook' });

        const provider = new MercadoPagoPixProvider();
        const result = provider.verifyWebhook(request);

        expect(result).toEqual({ providerChargeId: '987654321' });
    });

    it('rejeita notificação com assinatura adulterada', () => {
        vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', 'segredo-webhook');
        const request = signWebhook({ dataId: '987654321', secret: 'segredo-errado' });

        const provider = new MercadoPagoPixProvider();
        expect(() => provider.verifyWebhook(request)).toThrow(InvalidWebhookSignatureError);
    });

    it('rejeita notificação sem data.id', () => {
        vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', 'segredo-webhook');
        const provider = new MercadoPagoPixProvider();
        const request = { headers: { 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'r1' }, query: {}, body: {} };

        expect(() => provider.verifyWebhook(request)).toThrow(InvalidWebhookSignatureError);
    });
});
