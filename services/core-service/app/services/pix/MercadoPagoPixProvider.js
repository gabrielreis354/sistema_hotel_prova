import crypto from 'crypto';
import PixProvider from './PixProvider.js';
import { PixProviderUnavailableError, InvalidWebhookSignatureError } from './errors.js';

const MP_API_URL = 'https://api.mercadopago.com/v1/payments';
const TIMEOUT_MS = 10000;

/**
 * MercadoPagoPixProvider — cobrança PIX real via Mercado Pago (checkout API).
 *
 * createCharge: POST /v1/payments com payment_method_id 'pix', idempotente por externalId
 * (id da reserva). verifyWebhook: valida a assinatura HMAC-SHA256 do header x-signature antes
 * de confiar no provider_charge_id — nunca aceita POST anônimo.
 *
 * Credenciais via env: MERCADOPAGO_ACCESS_TOKEN (cobrança) e MERCADOPAGO_WEBHOOK_SECRET (webhook).
 */
export default class MercadoPagoPixProvider extends PixProvider {
    async createCharge({ amount, description, externalId, expiresInMinutes = 30, payerEmail, payerCpf }) {
        const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
        if (!accessToken) {
            throw new PixProviderUnavailableError('MERCADOPAGO_ACCESS_TOKEN não configurado');
        }

        const expiration = new Date(Date.now() + expiresInMinutes * 60 * 1000);

        const payer = {
            email: payerEmail || `reserva-${externalId}@sememail.gesway.local`,
            first_name: 'Hospede',
            last_name: 'Reserva'
        };
        if (payerCpf) {
            payer.identification = { type: 'CPF', number: payerCpf };
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response;
        try {
            response = await fetch(MP_API_URL, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'X-Idempotency-Key': String(externalId)
                },
                body: JSON.stringify({
                    transaction_amount: Number(amount),
                    description,
                    payment_method_id: 'pix',
                    date_of_expiration: expiration.toISOString(),
                    payer
                })
            });
        } catch {
            throw new PixProviderUnavailableError('Mercado Pago indisponível no momento');
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            throw new PixProviderUnavailableError(`Mercado Pago respondeu ${response.status}`);
        }

        const data = await response.json();
        const qrCode = data.point_of_interaction?.transaction_data?.qr_code;

        if (!data.id || !qrCode) {
            throw new PixProviderUnavailableError('Mercado Pago não retornou cobrança PIX válida');
        }

        return {
            providerChargeId: String(data.id),
            qrCode,
            expiration
        };
    }

    verifyWebhook(request) {
        const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
        const signatureHeader = request.headers['x-signature'];
        const requestId = request.headers['x-request-id'];
        const dataId = request.query?.['data.id'] || request.body?.data?.id;

        if (!secret || !signatureHeader || !requestId || !dataId) {
            throw new InvalidWebhookSignatureError('Notificação sem os dados mínimos para validar a assinatura');
        }

        const parts = Object.fromEntries(
            String(signatureHeader).split(',').map((part) => {
                const [key, value] = part.split('=');
                return [key?.trim(), value?.trim()];
            })
        );
        const { ts, v1 } = parts;
        if (!ts || !v1) {
            throw new InvalidWebhookSignatureError('Header x-signature malformado');
        }

        const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
        const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

        const expectedBuffer = Buffer.from(expected, 'hex');
        const receivedBuffer = Buffer.from(v1, 'hex');
        const valid = expectedBuffer.length === receivedBuffer.length
            && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

        if (!valid) {
            throw new InvalidWebhookSignatureError('Assinatura do webhook inválida');
        }

        return { providerChargeId: String(dataId) };
    }

    // A assinatura do webhook só prova quem enviou a notificação, não que o pagamento foi
    // aprovado — o MP notifica em payment.created e também em cancelled/rejected/expired.
    // GET /v1/payments/{id} é a fonte de verdade do status.
    async getChargeStatus(providerChargeId) {
        const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
        if (!accessToken) {
            throw new PixProviderUnavailableError('MERCADOPAGO_ACCESS_TOKEN não configurado');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response;
        try {
            response = await fetch(`${MP_API_URL}/${providerChargeId}`, {
                signal: controller.signal,
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
        } catch {
            throw new PixProviderUnavailableError('Mercado Pago indisponível no momento');
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            throw new PixProviderUnavailableError(`Mercado Pago respondeu ${response.status} ao consultar a cobrança`);
        }

        const data = await response.json();
        return { status: data.status, amount: data.transaction_amount ?? null };
    }
}
