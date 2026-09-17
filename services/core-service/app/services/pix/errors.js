/**
 * Erros tipados do domínio PIX — permitem ao controller mapear status HTTP sem depender
 * da implementação concreta do provedor (mesmo padrão de app/services/address/errors.js).
 */
export class PixProviderUnavailableError extends Error {}

export class InvalidWebhookSignatureError extends Error {}
