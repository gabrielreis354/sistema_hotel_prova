import crypto from 'crypto';
import PixProvider from './PixProvider.js';

/**
 * FakePixProvider — provedor PIX simulado.
 *
 * Gera um txid e um payload "copia-e-cola" fictícios, sem chamar PSP real,
 * sem dinheiro e sem HTTPS público. Demonstra o fluxo de ponta a ponta:
 * a confirmação é disparada manualmente no webhook (/webhooks/pix) com o txid.
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
}
