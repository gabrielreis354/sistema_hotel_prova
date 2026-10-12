import crypto from 'crypto';
import PixProvider from './PixProvider.js';
import { InvalidWebhookSignatureError } from './errors.js';
import { computePixSignature, verifyPixSignature } from '../../utils/pixWebhookSignature.js';

/**
 * FakePixProvider — provedor PIX simulado.
 *
 * Gera um txid e um payload "copia-e-cola" fictícios, sem chamar PSP real,
 * sem dinheiro e sem HTTPS público. Demonstra o fluxo de ponta a ponta:
 * a confirmação é disparada no webhook (/webhooks/pix) com o txid, assinada via signNotification().
 *
 * Para produção, basta criar um RealPixProvider implementando o mesmo contrato
 * e selecioná-lo via env PIX_PROVIDER — nenhum controller muda.
 */
export default class FakePixProvider extends PixProvider {
    async createCharge({ amount, description, externalId, expiresInMinutes = 30 }) {
        const providerChargeId = `fake_${crypto.randomUUID()}`;
        const expiration = new Date(Date.now() + expiresInMinutes * 60 * 1000);

        // String pseudo-EMV apenas para exibição/demonstração — NÃO é um BR Code válido.
        const payload = [
            '00020126',
            `br.gov.bcb.pix-SIMULADO`,
            `txid=${providerChargeId}`,
            `valor=${Number(amount).toFixed(2)}`,
            `desc=${description}`,
            `ref=${externalId}`
        ].join('|');
        const qrCode = Buffer.from(payload).toString('base64');

        return { providerChargeId, qrCode, expiration };
    }

    /**
     * Valida a notificação como um PSP genérico faria: HMAC-SHA256 sobre os bytes crus do
     * corpo, no cabeçalho `x-pix-signature` (T-06.9). Fail-closed: sem PIX_WEBHOOK_SECRET
     * configurado, toda notificação é recusada — nunca "aceita por padrão".
     */
    verifyWebhook(request) {
        const secret = process.env.PIX_WEBHOOK_SECRET;
        if (!secret) {
            throw new InvalidWebhookSignatureError('PIX_WEBHOOK_SECRET não configurado — recusando webhook (fail-closed)');
        }
        if (!verifyPixSignature(request.rawBody, request.get('x-pix-signature'), secret)) {
            throw new InvalidWebhookSignatureError('assinatura inválida — requisição recusada');
        }
        return { providerChargeId: request.body?.provider_charge_id };
    }

    // Sem PSP real para consultar — quem disparou o webhook assinado já está simulando a
    // aprovação. amountVerifiable: false declara, de forma explícita, que este provider não
    // tem como conferir valor; um provider real nunca devolve false.
    async getChargeStatus() {
        return { status: 'approved', amount: null, amountVerifiable: false };
    }

    /**
     * Assina uma notificação de webhook como um PSP real assinaria — mesmo
     * HMAC-SHA256 que verifyWebhook confere. Existe só para os testes
     * e a demonstração exercitarem o mesmo caminho de assinatura que um PSP
     * verdadeiro usaria; não faz parte do contrato PixProvider (cobrar não é
     * assinar callback) porque só o simulador precisa "fingir" ser o PSP.
     *
     * @param {string|Buffer} rawBody — os bytes exatos que serão enviados ao webhook
     * @param {string} [secret] — default: process.env.PIX_WEBHOOK_SECRET
     * @returns {string} `sha256=<hex>`, pronto para o cabeçalho x-pix-signature
     */
    signNotification(rawBody, secret = process.env.PIX_WEBHOOK_SECRET) {
        if (!secret) {
            throw new Error('PIX_WEBHOOK_SECRET não configurado — não é possível assinar a notificação');
        }
        return computePixSignature(rawBody, secret);
    }
}
