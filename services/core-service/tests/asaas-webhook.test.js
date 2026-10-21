import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom } from './helpers/factories.js';
import PaymentModel from '../app/Models/PaymentModel.js';
import ReservationModel from '../app/Models/ReservationModel.js';
import { resetPixProviderForTests } from '../app/services/pix/index.js';

// Fluxo ponta a ponta com PIX_PROVIDER=asaas: reserva pública → cobrança → webhook → banco.
// A API do Asaas é MOCKADA (sem rede, sem conta): estes testes provam o comportamento do
// sistema diante das respostas documentadas do Asaas, não que o sandbox real responde assim.

const BASE = 'https://api-sandbox.asaas.com/v3';
const API_KEY = '$aact_hmlg_chave_de_teste_integracao';
const WEBHOOK_TOKEN = 'token-webhook-teste-integracao';
const CPF = '52998224725';

const app = createApp();
const hotelA = {};
const hotelB = {};
let chargeSeq = 1;

// Estado "real" de cada cobrança no Asaas simulado — cada teste ajusta antes do webhook.
const asaasCharges = new Map();
let asaasDown = false;
let statusGate = null; // (chargeId) => Promise<corpo da cobrança> | undefined

const fetchMock = vi.fn(async (url, options = {}) => {
    const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
    if (asaasDown) throw new Error('ECONNREFUSED');

    if (url === `${BASE}/customers` && options.method === 'POST') return json({ id: `cus_${chargeSeq}` });
    if (url === `${BASE}/payments` && options.method === 'POST') {
        const id = `pay_${String(chargeSeq++).padStart(6, '0')}`;
        const body = JSON.parse(options.body);
        asaasCharges.set(id, { id, status: 'PENDING', value: body.value, externalReference: body.externalReference });
        return json({ id, status: 'PENDING' });
    }
    const qrMatch = url.match(/\/payments\/(pay_\d+)\/pixQrCode$/);
    if (qrMatch) return json({ payload: `00020126-copia-e-cola-${qrMatch[1]}`, encodedImage: 'iVBOR', expirationDate: '2027-12-31 23:59:59' });
    const getMatch = url.match(/\/payments\/(pay_\d+)$/);
    // Consulta controlada pelo teste (corrida entre notificações): devolve a resposta no tempo dele.
    const gated = getMatch && statusGate?.(getMatch[1]);
    if (gated) return json(await gated);
    if (getMatch && asaasCharges.has(getMatch[1])) return json(asaasCharges.get(getMatch[1]));
    return json({ errors: [{ code: 'not_found' }] }, 404);
});

async function setupHotel(target, name) {
    const auth = await registerAndLogin(app, { tenantName: name });
    const cat = await createCategory(app, auth.jwt, { name: 'Standard', capacity: 2, price_per_night: 150 });
    await createRoom(app, auth.jwt, cat.id, { number: '101' });
    await createRoom(app, auth.jwt, cat.id, { number: '102' });
    Object.assign(target, { subdomain: auth.subdomain, categoryId: cat.id });
}

beforeAll(async () => {
    await truncateAll();
    await setupHotel(hotelA, 'Hotel Asaas A');
    await setupHotel(hotelB, 'Hotel Asaas B');
});

function useAsaas() {
    vi.stubEnv('PIX_PROVIDER', 'asaas');
    vi.stubEnv('ASAAS_API_KEY', API_KEY);
    vi.stubEnv('ASAAS_BASE_URL', BASE);
    vi.stubEnv('ASAAS_WEBHOOK_TOKEN', WEBHOOK_TOKEN);
    resetPixProviderForTests();
    vi.stubGlobal('fetch', fetchMock);
}

afterEach(() => {
    asaasDown = false;
    statusGate = null;
    fetchMock.mockClear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

afterAll(() => {
    resetPixProviderForTests();
});

async function book(hotel, checkIn, checkOut, guestOverrides = {}) {
    useAsaas();
    return request(app)
        .post(`/public/${hotel.subdomain}/bookings`)
        .send({
            category_id: hotel.categoryId,
            check_in: checkIn,
            check_out: checkOut,
            guests: 1,
            guest: { full_name: 'Hospede Asaas', email: `asaas_${Date.now()}_${Math.random()}@example.com`, cpf: CPF, ...guestOverrides }
        });
}

function notify(chargeId, { token = WEBHOOK_TOKEN, event = 'PAYMENT_RECEIVED', bodyStatus = 'RECEIVED' } = {}) {
    const req = request(app).post('/webhooks/pix');
    if (token !== null) req.set('asaas-access-token', token);
    // O corpo imita o formato documentado; o backend NÃO deve confiar em payment.status daqui.
    return req.send({ id: `evt_${chargeId}_${Date.now()}`, event, payment: { id: chargeId, status: bodyStatus } });
}

async function stateOf(booking) {
    const payment = await PaymentModel.unscoped().findOne({ where: { reservation_id: booking.body.reservation.id } });
    const reservation = await ReservationModel.findByPk(booking.body.reservation.id);
    return { payment, reservation };
}

describe('POST /public/:subdomain/bookings — provider Asaas', () => {
    it('sem CPF do hóspede devolve 400 e não chama o Asaas', async () => {
        const res = await book(hotelA, '2027-08-01', '2027-08-02', { cpf: undefined });
        expect(res.status).toBe(400);
        expect(res.body.errors).toContain('guest.cpf obrigatório para pagamento PIX');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('cria a reserva PENDING e a cobrança PIX no Asaas, devolvendo só o necessário', async () => {
        const res = await book(hotelA, '2027-08-03', '2027-08-05');
        expect(res.status).toBe(201);
        expect(res.body.reservation.status).toBe('PENDING');
        expect(res.body.payment).toMatchObject({ kind: 'DEPOSIT', status: 'PENDING', amount: 90 });
        expect(res.body.pix.provider_charge_id).toMatch(/^pay_/);
        expect(res.body.pix.qr_code).toContain('copia-e-cola');
        // Credencial nunca vai para o cliente.
        expect(JSON.stringify(res.body)).not.toContain(API_KEY);

        const { payment } = await stateOf(res);
        expect(payment.provider).toBe('asaas');
        expect(payment.provider_charge_id).toBe(res.body.pix.provider_charge_id);
        expect(payment.status).toBe('PENDING');

        // A cobrança no Asaas aponta para a reserva certa.
        expect(asaasCharges.get(payment.provider_charge_id).externalReference).toBe(res.body.reservation.id);
    });

    it('Asaas fora do ar na criação devolve 503 e não grava reserva', async () => {
        useAsaas();
        asaasDown = true;
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const before = await ReservationModel.count();
        const res = await request(app).post(`/public/${hotelA.subdomain}/bookings`).send({
            category_id: hotelA.categoryId, check_in: '2027-08-07', check_out: '2027-08-08', guests: 1,
            guest: { full_name: 'Hospede', email: 'down@example.com', cpf: CPF }
        });
        expect(res.status).toBe(503);
        expect(await ReservationModel.count()).toBe(before);
    });
});

describe('POST /webhooks/pix — provider Asaas', () => {
    it('token inválido: 401, sem consultar o Asaas e sem alterar nada', async () => {
        const booking = await book(hotelA, '2027-08-10', '2027-08-11');
        const chargeId = booking.body.pix.provider_charge_id;
        asaasCharges.get(chargeId).status = 'RECEIVED';
        fetchMock.mockClear();
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const res = await notify(chargeId, { token: 'token-falso' });
        expect(res.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();

        const { payment, reservation } = await stateOf(booking);
        expect(payment.status).toBe('PENDING');
        expect(reservation.status).toBe('PENDING');
    });

    it('sem o cabeçalho de token: 401', async () => {
        const booking = await book(hotelA, '2027-08-12', '2027-08-13');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await notify(booking.body.pix.provider_charge_id, { token: null });
        expect(res.status).toBe(401);
        expect((await stateOf(booking)).payment.status).toBe('PENDING');
    });

    it('corpo diz RECEIVED mas o Asaas ainda diz PENDING: não confirma (não confia no corpo)', async () => {
        const booking = await book(hotelA, '2027-08-14', '2027-08-15');
        const res = await notify(booking.body.pix.provider_charge_id, { bodyStatus: 'RECEIVED' });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('pending');
        const { payment, reservation } = await stateOf(booking);
        expect(payment.status).toBe('PENDING');
        expect(reservation.status).toBe('PENDING');
    });

    it('PIX vencido (OVERDUE) não encerra: continua PENDING e ainda pode ser pago', async () => {
        const booking = await book(hotelA, '2027-08-16', '2027-08-17');
        const chargeId = booking.body.pix.provider_charge_id;
        asaasCharges.get(chargeId).status = 'OVERDUE';

        const res = await notify(chargeId, { event: 'PAYMENT_OVERDUE', bodyStatus: 'OVERDUE' });
        expect(res.body.status).toBe('pending');
        expect((await stateOf(booking)).payment.status).toBe('PENDING');

        asaasCharges.get(chargeId).status = 'RECEIVED';
        const paid = await notify(chargeId);
        expect(paid.body.status).toBe('confirmed');
    });

    it('pagamento recebido com valor certo: pagamento PAID e reserva CONFIRMED', async () => {
        const booking = await book(hotelA, '2027-08-18', '2027-08-20');
        const chargeId = booking.body.pix.provider_charge_id;
        asaasCharges.get(chargeId).status = 'RECEIVED';

        const res = await notify(chargeId);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('confirmed');
        expect(res.body.reservation_status).toBe('CONFIRMED');

        const { payment, reservation } = await stateOf(booking);
        expect(payment.status).toBe('PAID');
        expect(payment.paid_at).not.toBeNull();
        expect(reservation.status).toBe('CONFIRMED');

        const status = await request(app).get(`/public/${hotelA.subdomain}/bookings/${booking.body.reservation.id}/status`);
        expect(status.body).toMatchObject({ status: 'CONFIRMED', confirmed: true, deposit: { status: 'PAID' } });
    });

    it('webhook duplicado não repete efeito nem consulta o Asaas de novo', async () => {
        const booking = await book(hotelA, '2027-08-21', '2027-08-22');
        const chargeId = booking.body.pix.provider_charge_id;
        asaasCharges.get(chargeId).status = 'RECEIVED';

        await notify(chargeId);
        const { payment: first } = await stateOf(booking);
        fetchMock.mockClear();

        const again = await notify(chargeId);
        expect(again.status).toBe(200);
        expect(again.body.status).toBe('already_processed');
        expect(fetchMock).not.toHaveBeenCalled();

        const { payment: second } = await stateOf(booking);
        expect(second.paid_at.getTime()).toBe(first.paid_at.getTime());
    });

    it('valor pago diferente do cobrado: FAILED, reserva não confirma', async () => {
        const booking = await book(hotelA, '2027-08-23', '2027-08-24');
        const chargeId = booking.body.pix.provider_charge_id;
        Object.assign(asaasCharges.get(chargeId), { status: 'RECEIVED', value: 0.01 });

        const res = await notify(chargeId);
        expect(res.body.status).toBe('not_approved');
        const { payment, reservation } = await stateOf(booking);
        expect(payment.status).toBe('FAILED');
        expect(reservation.status).toBe('PENDING');
    });

    it('cobrança estornada (REFUNDED): FAILED, reserva intocada', async () => {
        const booking = await book(hotelA, '2027-08-25', '2027-08-26');
        const chargeId = booking.body.pix.provider_charge_id;
        asaasCharges.get(chargeId).status = 'REFUNDED';

        const res = await notify(chargeId, { event: 'PAYMENT_REFUNDED', bodyStatus: 'REFUNDED' });
        expect(res.body.status).toBe('not_approved');
        const { payment, reservation } = await stateOf(booking);
        expect(payment.status).toBe('FAILED');
        expect(reservation.status).toBe('PENDING');
    });

    it('cobrança removida no Asaas (deleted): FAILED', async () => {
        const booking = await book(hotelA, '2027-08-27', '2027-08-28');
        const chargeId = booking.body.pix.provider_charge_id;
        asaasCharges.get(chargeId).deleted = true;

        const res = await notify(chargeId, { event: 'PAYMENT_DELETED' });
        expect(res.body.status).toBe('not_approved');
        expect((await stateOf(booking)).payment.status).toBe('FAILED');
    });

    it('Asaas fora do ar na consulta: 503 (o Asaas reenvia) e nada muda', async () => {
        const booking = await book(hotelA, '2027-08-29', '2027-08-30');
        const chargeId = booking.body.pix.provider_charge_id;
        asaasCharges.get(chargeId).status = 'RECEIVED';
        asaasDown = true;
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const res = await notify(chargeId);
        expect(res.status).toBe(503);
        expect((await stateOf(booking)).payment.status).toBe('PENDING');
    });

    it('cobrança desconhecida: 404 sem efeito', async () => {
        useAsaas();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const res = await notify('pay_999999');
        expect(res.status).toBe(404);
    });

    it('isolamento: pagar a cobrança do hotel A não confirma nada do hotel B', async () => {
        const bookingA = await book(hotelA, '2027-09-01', '2027-09-02');
        const bookingB = await book(hotelB, '2027-09-01', '2027-09-02');
        const chargeA = bookingA.body.pix.provider_charge_id;
        asaasCharges.get(chargeA).status = 'RECEIVED';

        const res = await notify(chargeA);
        expect(res.body.status).toBe('confirmed');
        expect(res.body.reservation_id).toBe(bookingA.body.reservation.id);

        const b = await stateOf(bookingB);
        expect(b.payment.status).toBe('PENDING');
        expect(b.reservation.status).toBe('PENDING');

        // O status público do hotel B não enxerga a reserva do hotel A.
        const crossTenant = await request(app).get(`/public/${hotelB.subdomain}/bookings/${bookingA.body.reservation.id}/status`);
        expect(crossTenant.status).toBe(404);
    });
});

// Repasse do qa-redteam de 17/10 (docs/qa/repasses/para_gabriel_17102026.md): duas notificações
// da mesma cobrança em paralelo, e o status no Asaas muda entre as duas consultas. As duas leem
// o pagamento PENDING antes de qualquer trava; a consulta ao Asaas é segurada até as duas
// chegarem nela, e a segunda resposta sai depois, para a ordem das gravações ser a do teste.
describe('POST /webhooks/pix — PAID e FAILED simultâneos (repasse 17/10)', () => {
    function race(chargeId, firstStatus, laterStatus) {
        let arrived = 0;
        let releaseFirst;
        const bothArrived = new Promise((resolve) => { releaseFirst = resolve; });
        statusGate = (id) => {
            if (id !== chargeId) return undefined;
            arrived += 1;
            const charge = asaasCharges.get(chargeId);
            if (arrived === 1) return bothArrived.then(() => ({ ...charge, status: firstStatus }));
            releaseFirst();
            // A segunda resposta só sai depois que a primeira notificação gravou.
            return new Promise((resolve) => setTimeout(() => resolve({ ...charge, status: laterStatus }), 400));
        };
        return Promise.all([
            notify(chargeId),
            notify(chargeId, { event: 'PAYMENT_REFUNDED', bodyStatus: 'REFUNDED' })
        ]);
    }

    it('PAID grava primeiro: o FAILED atrasado não sobrescreve — reserva CONFIRMED com sinal PAID', async () => {
        const booking = await book(hotelA, '2027-09-10', '2027-09-11');
        const chargeId = booking.body.pix.provider_charge_id;

        const responses = await race(chargeId, 'RECEIVED', 'REFUNDED');

        expect(responses.map((r) => r.status)).toEqual([200, 200]);
        expect(responses.map((r) => r.body.status).sort()).toEqual(['already_processed', 'confirmed']);
        const { payment, reservation } = await stateOf(booking);
        expect(payment.status).toBe('PAID');
        expect(reservation.status).toBe('CONFIRMED');
    });

    it('FAILED grava primeiro: o PAID atrasado não confirma — reserva PENDING com sinal FAILED', async () => {
        const booking = await book(hotelA, '2027-09-12', '2027-09-13');
        const chargeId = booking.body.pix.provider_charge_id;

        const responses = await race(chargeId, 'REFUNDED', 'RECEIVED');

        expect(responses.map((r) => r.body.status).sort()).toEqual(['already_processed', 'not_approved']);
        const { payment, reservation } = await stateOf(booking);
        expect(payment.status).toBe('FAILED');
        expect(reservation.status).toBe('PENDING');
    });
});
