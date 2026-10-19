import { describe, it, expect, afterEach, afterAll, vi } from 'vitest';
import AsaasPixProvider from '../app/services/pix/AsaasPixProvider.js';
import FakePixProvider from '../app/services/pix/FakePixProvider.js';
import MercadoPagoPixProvider from '../app/services/pix/MercadoPagoPixProvider.js';
import getPixProvider, { resetPixProviderForTests } from '../app/services/pix/index.js';
import { PixProviderUnavailableError, InvalidWebhookSignatureError } from '../app/services/pix/errors.js';
import { CHARGE_STATUS } from '../app/services/pix/chargeStatus.js';

// Testes unitários do AsaasPixProvider — SEM rede e SEM conta Asaas: o fetch é mockado.
// Nada aqui prova que a API real do Asaas responde assim; prova que o provider chama as
// rotas e campos da documentação oficial e reage certo a cada resposta.

const SANDBOX_KEY = '$aact_hmlg_chave_de_teste_unitario';
const WEBHOOK_TOKEN = 'token-webhook-teste-unitario';
const BASE = 'https://api-sandbox.asaas.com/v3';

function stubSandboxEnv() {
    vi.stubEnv('ASAAS_API_KEY', SANDBOX_KEY);
    vi.stubEnv('ASAAS_BASE_URL', BASE);
    vi.stubEnv('ASAAS_WEBHOOK_TOKEN', WEBHOOK_TOKEN);
}

function jsonResponse(body, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Mock das 3 chamadas de createCharge: cliente → cobrança → QR Code.
function mockCreateChargeFlow({ qr = { payload: '00020126580014br.gov.bcb.pix-copia-e-cola', expirationDate: '2026-10-16 23:59:59' } } = {}) {
    const fetchMock = vi.fn(async (url, options = {}) => {
        if (url === `${BASE}/customers` && options.method === 'POST') return jsonResponse({ id: 'cus_000001' });
        if (url === `${BASE}/payments` && options.method === 'POST') return jsonResponse({ id: 'pay_000001', status: 'PENDING' });
        if (url === `${BASE}/payments/pay_000001/pixQrCode`) return jsonResponse(qr);
        throw new Error(`URL inesperada no mock do Asaas: ${options.method ?? 'GET'} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

const chargeParams = {
    amount: 90,
    description: 'Sinal reserva Hotel Teste',
    externalId: 'res-uuid-1',
    payerName: 'Hóspede Teste',
    payerEmail: 'hospede@example.com',
    payerCpf: '52998224725'
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

afterAll(() => {
    resetPixProviderForTests();
});

describe('Seleção do provider por PIX_PROVIDER', () => {
    it('PIX_PROVIDER=asaas seleciona o AsaasPixProvider', () => {
        vi.stubEnv('PIX_PROVIDER', 'asaas');
        resetPixProviderForTests();
        expect(getPixProvider()).toBeInstanceOf(AsaasPixProvider);
    });

    it('sem PIX_PROVIDER o padrão continua sendo o FakePixProvider', () => {
        vi.stubEnv('PIX_PROVIDER', '');
        resetPixProviderForTests();
        expect(getPixProvider()).toBeInstanceOf(FakePixProvider);
    });

    it('só o Asaas exige CPF do pagador', () => {
        expect(new AsaasPixProvider().requiresPayerCpf).toBe(true);
        expect(new FakePixProvider().requiresPayerCpf).toBe(false);
        expect(new MercadoPagoPixProvider().requiresPayerCpf).toBe(false);
    });
});

describe('Status normalizado (CHARGE_STATUS) — compatibilidade dos providers existentes', () => {
    it('FakePixProvider devolve PAID normalizado sem conferência de valor', async () => {
        await expect(new FakePixProvider().getChargeStatus('fake_1'))
            .resolves.toEqual({ status: CHARGE_STATUS.PAID, amount: null, amountVerifiable: false });
    });

    it.each([
        ['approved', CHARGE_STATUS.PAID],
        ['rejected', CHARGE_STATUS.FAILED],
        ['cancelled', CHARGE_STATUS.FAILED],
        ['in_process', CHARGE_STATUS.PENDING],
        ['pending', CHARGE_STATUS.PENDING]
    ])('Mercado Pago "%s" vira %s', async (mpStatus, expected) => {
        vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'TEST-token');
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ status: mpStatus, transaction_amount: 90 })));
        const result = await new MercadoPagoPixProvider().getChargeStatus('123');
        expect(result.status).toBe(expected);
    });
});

describe('AsaasPixProvider — trava de sandbox', () => {
    it('sem ASAAS_API_KEY recusa sem chamar a rede', async () => {
        vi.stubEnv('ASAAS_API_KEY', '');
        const fetchMock = mockCreateChargeFlow();
        await expect(new AsaasPixProvider().createCharge(chargeParams)).rejects.toBeInstanceOf(PixProviderUnavailableError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('URL de produção (api.asaas.com) é recusada sem chamar a rede', async () => {
        stubSandboxEnv();
        vi.stubEnv('ASAAS_BASE_URL', 'https://api.asaas.com/v3');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const fetchMock = mockCreateChargeFlow();
        await expect(new AsaasPixProvider().createCharge(chargeParams)).rejects.toBeInstanceOf(PixProviderUnavailableError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('URL do sandbox sem HTTPS é recusada', async () => {
        stubSandboxEnv();
        vi.stubEnv('ASAAS_BASE_URL', 'http://api-sandbox.asaas.com/v3');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const fetchMock = mockCreateChargeFlow();
        await expect(new AsaasPixProvider().createCharge(chargeParams)).rejects.toBeInstanceOf(PixProviderUnavailableError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('chave de produção ($aact_prod_) é recusada e nunca aparece no log', async () => {
        stubSandboxEnv();
        const prodKey = '$aact_prod_chave_que_nunca_pode_ser_usada';
        vi.stubEnv('ASAAS_API_KEY', prodKey);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const fetchMock = mockCreateChargeFlow();

        await expect(new AsaasPixProvider().createCharge(chargeParams)).rejects.toBeInstanceOf(PixProviderUnavailableError);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(prodKey);
    });
});

describe('AsaasPixProvider.createCharge', () => {
    it('cria cliente → cobrança PIX → QR Code e devolve o copia-e-cola', async () => {
        stubSandboxEnv();
        const fetchMock = mockCreateChargeFlow();

        const charge = await new AsaasPixProvider().createCharge(chargeParams);

        expect(charge.providerChargeId).toBe('pay_000001');
        expect(charge.qrCode).toBe('00020126580014br.gov.bcb.pix-copia-e-cola');
        // "2026-10-16 23:59:59" é horário de Brasília (-03:00) → 02:59:59Z do dia seguinte.
        expect(charge.expiration.toISOString()).toBe('2026-10-17T02:59:59.000Z');

        expect(fetchMock).toHaveBeenCalledTimes(3);
        const [customerCall, paymentCall] = fetchMock.mock.calls;

        // Autenticação documentada: header access_token + User-Agent obrigatório.
        expect(customerCall[1].headers.access_token).toBe(SANDBOX_KEY);
        expect(customerCall[1].headers['User-Agent']).toBeTruthy();

        const customerBody = JSON.parse(customerCall[1].body);
        expect(customerBody).toMatchObject({ name: 'Hóspede Teste', cpfCnpj: '52998224725', notificationDisabled: true });

        const paymentBody = JSON.parse(paymentCall[1].body);
        expect(paymentBody).toMatchObject({
            customer: 'cus_000001',
            billingType: 'PIX',
            value: 90,
            externalReference: 'res-uuid-1'
        });
        expect(paymentBody.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('sem CPF do pagador recusa sem chamar a rede', async () => {
        stubSandboxEnv();
        const fetchMock = mockCreateChargeFlow();
        await expect(new AsaasPixProvider().createCharge({ ...chargeParams, payerCpf: undefined }))
            .rejects.toBeInstanceOf(PixProviderUnavailableError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('falha de rede vira PixProviderUnavailableError', async () => {
        stubSandboxEnv();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));
        await expect(new AsaasPixProvider().createCharge(chargeParams)).rejects.toBeInstanceOf(PixProviderUnavailableError);
    });

    it('resposta não-2xx vira PixProviderUnavailableError e não loga o corpo nem a chave', async () => {
        stubSandboxEnv();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ errors: [{ description: 'CPF 529.982.247-25 inválido' }] }, 400)));

        await expect(new AsaasPixProvider().createCharge(chargeParams)).rejects.toBeInstanceOf(PixProviderUnavailableError);
        const logged = JSON.stringify(errorSpy.mock.calls);
        expect(logged).not.toContain('529.982.247-25');
        expect(logged).not.toContain(SANDBOX_KEY);
    });

    it('cobrança sem payload de QR Code é recusada (e o id órfão vai para o log)', async () => {
        stubSandboxEnv();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockCreateChargeFlow({ qr: { encodedImage: 'iVBOR...' } });

        await expect(new AsaasPixProvider().createCharge(chargeParams)).rejects.toBeInstanceOf(PixProviderUnavailableError);
        expect(JSON.stringify(errorSpy.mock.calls)).toContain('pay_000001');
    });
});

describe('AsaasPixProvider.verifyWebhook', () => {
    const notification = (token) => ({
        headers: token === undefined ? {} : { 'asaas-access-token': token },
        body: { id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_000001', status: 'RECEIVED' } }
    });

    it('sem ASAAS_WEBHOOK_TOKEN configurado recusa tudo (fail-closed)', () => {
        stubSandboxEnv();
        vi.stubEnv('ASAAS_WEBHOOK_TOKEN', '');
        expect(() => new AsaasPixProvider().verifyWebhook(notification(WEBHOOK_TOKEN))).toThrow(InvalidWebhookSignatureError);
    });

    it('sem o cabeçalho asaas-access-token é recusada', () => {
        stubSandboxEnv();
        expect(() => new AsaasPixProvider().verifyWebhook(notification(undefined))).toThrow(InvalidWebhookSignatureError);
    });

    it('token errado é recusado', () => {
        stubSandboxEnv();
        expect(() => new AsaasPixProvider().verifyWebhook(notification('token-errado'))).toThrow(InvalidWebhookSignatureError);
    });

    it('token igual à API Key é recusado (a doc do Asaas proíbe)', () => {
        stubSandboxEnv();
        vi.stubEnv('ASAAS_WEBHOOK_TOKEN', SANDBOX_KEY);
        expect(() => new AsaasPixProvider().verifyWebhook(notification(SANDBOX_KEY))).toThrow(InvalidWebhookSignatureError);
    });

    it('token certo devolve o id da cobrança', () => {
        stubSandboxEnv();
        expect(new AsaasPixProvider().verifyWebhook(notification(WEBHOOK_TOKEN))).toEqual({ providerChargeId: 'pay_000001' });
    });
});

describe('AsaasPixProvider.getChargeStatus — tradução do status do Asaas', () => {
    it.each([
        ['RECEIVED', CHARGE_STATUS.PAID],
        ['CONFIRMED', CHARGE_STATUS.PAID],
        ['PENDING', CHARGE_STATUS.PENDING],
        ['OVERDUE', CHARGE_STATUS.PENDING],          // PIX vencido ainda pode ser pago com atraso
        ['RECEIVED_IN_CASH', CHARGE_STATUS.PENDING], // baixa manual não é PIX
        ['AWAITING_RISK_ANALYSIS', CHARGE_STATUS.PENDING],
        ['REFUNDED', CHARGE_STATUS.FAILED],
        ['CHARGEBACK_REQUESTED', CHARGE_STATUS.FAILED],
        ['STATUS_QUE_NAO_EXISTE', CHARGE_STATUS.PENDING]
    ])('Asaas "%s" vira %s', async (asaasStatus, expected) => {
        stubSandboxEnv();
        const fetchMock = vi.fn(async () => jsonResponse({ id: 'pay_000001', status: asaasStatus, value: 90 }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await new AsaasPixProvider().getChargeStatus('pay_000001');
        expect(result).toEqual({ status: expected, amount: 90, amountVerifiable: true });
        expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/payments/pay_000001`);
    });

    it('cobrança removida (deleted: true) vira FAILED', async () => {
        stubSandboxEnv();
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: 'pay_000001', status: 'PENDING', deleted: true, value: 90 })));
        const result = await new AsaasPixProvider().getChargeStatus('pay_000001');
        expect(result.status).toBe(CHARGE_STATUS.FAILED);
    });

    it('"pago" sem value é indisponibilidade, nunca confirmação no escuro', async () => {
        stubSandboxEnv();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: 'pay_000001', status: 'RECEIVED' })));
        await expect(new AsaasPixProvider().getChargeStatus('pay_000001')).rejects.toBeInstanceOf(PixProviderUnavailableError);
    });
});
