import crypto from 'crypto';
import PixProvider from './PixProvider.js';
import { PixProviderUnavailableError, InvalidWebhookSignatureError } from './errors.js';
import { CHARGE_STATUS } from './chargeStatus.js';

const SANDBOX_BASE_URL = 'https://api-sandbox.asaas.com/v3';
const SANDBOX_HOST = 'api-sandbox.asaas.com';
const SANDBOX_KEY_PREFIX = '$aact_hmlg_';
const TIMEOUT_MS = 10000;
// Contas raiz criadas a partir de 13/06/2024 têm requisições sem User-Agent recusadas.
const USER_AGENT = 'gesway-core-service';

// Vocabulário do Asaas (status de GET /v3/payments/{id}) → status normalizado. Allowlist
// (fail-safe): só RECEIVED/CONFIRMED contam como pago. OVERDUE NÃO encerra — PIX vencido
// ainda pode ser pago com atraso (OVERDUE → RECEIVED). RECEIVED_IN_CASH (baixa manual no
// painel, sem PIX) também não confirma a reserva: o sinal online é por PIX.
const PAID_STATUSES = ['RECEIVED', 'CONFIRMED'];
// Dinheiro que entrou e saiu (estorno/chargeback): não pode confirmar reserva.
const FAILED_STATUSES = ['REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS',
    'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'];

function toChargeStatus(data) {
    if (data.deleted === true) return CHARGE_STATUS.FAILED;   // cobrança removida no Asaas
    if (PAID_STATUSES.includes(data.status)) return CHARGE_STATUS.PAID;
    if (FAILED_STATUSES.includes(data.status)) return CHARGE_STATUS.FAILED;
    return CHARGE_STATUS.PENDING;
}

/**
 * Lê e valida a configuração. NESTA FASE o provider só fala com o SANDBOX: URL fora de
 * api-sandbox.asaas.com ou chave que não seja de sandbox ($aact_hmlg_) é recusada antes de
 * qualquer requisição — uma chave de produção colada por engano no .env nunca movimenta
 * dinheiro real. A chave nunca vai para log.
 */
export function getAsaasConfig() {
    const apiKey = process.env.ASAAS_API_KEY;
    const baseUrl = (process.env.ASAAS_BASE_URL || SANDBOX_BASE_URL).replace(/\/+$/, '');

    if (!apiKey) {
        throw new PixProviderUnavailableError('ASAAS_API_KEY não configurado');
    }

    let host;
    try {
        const url = new URL(baseUrl);
        host = url.protocol === 'https:' ? url.hostname : null;
    } catch {
        host = null;
    }
    if (host !== SANDBOX_HOST) {
        console.error('AsaasPixProvider: ASAAS_BASE_URL fora do sandbox — recusado (só sandbox é permitido)');
        throw new PixProviderUnavailableError('ASAAS_BASE_URL precisa ser o sandbox do Asaas');
    }
    if (!apiKey.startsWith(SANDBOX_KEY_PREFIX)) {
        console.error('AsaasPixProvider: ASAAS_API_KEY não é chave de sandbox — recusada');
        throw new PixProviderUnavailableError('ASAAS_API_KEY precisa ser uma chave de sandbox');
    }

    return { apiKey, baseUrl };
}

// Data de hoje no fuso do Brasil (YYYY-MM-DD) — o dueDate do Asaas é uma data, não um instante.
function todayInBrazil() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// expirationDate do QR vem como "YYYY-MM-DD HH:mm:ss" (horário de Brasília, sem fuso).
// Sem isto, new Date() interpretaria no fuso do servidor.
function parseAsaasDate(value) {
    if (!value) return null;
    const text = String(value);
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}-03:00` : text;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * AsaasPixProvider — cobrança PIX via Asaas (SANDBOX).
 *
 * createCharge: POST /customers (o Asaas exige cliente com nome e CPF) → POST /payments com
 * billingType PIX e externalReference = id da reserva → GET /payments/{id}/pixQrCode
 * (copia-e-cola). verifyWebhook: o Asaas NÃO assina o corpo — ele envia o token cadastrado
 * no webhook no cabeçalho `asaas-access-token`, comparado aqui em tempo constante.
 * getChargeStatus: GET /payments/{id} é a fonte de verdade; o corpo do webhook nunca é.
 *
 * Credenciais via env: ASAAS_API_KEY (sandbox), ASAAS_WEBHOOK_TOKEN, ASAAS_BASE_URL (opcional).
 */
export default class AsaasPixProvider extends PixProvider {
    get requiresPayerCpf() {
        return true;
    }

    async #request(path, { method = 'GET', body } = {}) {
        const { apiKey, baseUrl } = getAsaasConfig();

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response;
        try {
            response = await fetch(`${baseUrl}${path}`, {
                method,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': USER_AGENT,
                    'access_token': apiKey
                },
                body: body ? JSON.stringify(body) : undefined
            });
        } catch (error) {
            console.error('AsaasPixProvider: falha de rede', method, path, error.message);
            throw new PixProviderUnavailableError('Asaas indisponível no momento');
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            // Só status e rota — o corpo de erro pode ecoar nome/CPF do pagador (PII).
            console.error('AsaasPixProvider: resposta', response.status, method, path);
            throw new PixProviderUnavailableError(`Asaas respondeu ${response.status}`);
        }

        return response.json();
    }

    async createCharge({ amount, description, externalId, payerName, payerEmail, payerCpf }) {
        if (!payerCpf) {
            // O controller já valida antes (requiresPayerCpf); isto é a defesa do contrato.
            throw new PixProviderUnavailableError('Asaas exige o CPF do pagador');
        }

        const customer = await this.#request('/customers', {
            method: 'POST',
            body: {
                name: payerName || 'Hóspede',
                cpfCnpj: payerCpf,
                email: payerEmail || undefined,
                externalReference: String(externalId),
                // O Asaas envia e-mail/SMS ao cliente por padrão — quem avisa o hóspede é o hotel.
                notificationDisabled: true
            }
        });
        if (!customer?.id) {
            throw new PixProviderUnavailableError('Asaas não retornou o cliente');
        }

        const payment = await this.#request('/payments', {
            method: 'POST',
            body: {
                customer: customer.id,
                billingType: 'PIX',
                value: Number(amount),
                dueDate: todayInBrazil(),
                description,
                externalReference: String(externalId)
            }
        });
        if (!payment?.id) {
            throw new PixProviderUnavailableError('Asaas não retornou a cobrança');
        }

        const qr = await this.#request(`/payments/${encodeURIComponent(payment.id)}/pixQrCode`);
        if (!qr?.payload) {
            // A cobrança já existe no Asaas sem reserva gravada: o id vai no log para reconciliar.
            console.error('AsaasPixProvider.createCharge: cobrança sem QR Code — órfã no Asaas', payment.id);
            throw new PixProviderUnavailableError('Asaas não retornou o QR Code PIX');
        }

        return {
            providerChargeId: String(payment.id),
            qrCode: qr.payload,
            expiration: parseAsaasDate(qr.expirationDate)
        };
    }

    verifyWebhook(request) {
        const expected = process.env.ASAAS_WEBHOOK_TOKEN;
        const received = request.headers?.['asaas-access-token'];

        if (!expected) {
            throw new InvalidWebhookSignatureError('ASAAS_WEBHOOK_TOKEN não configurado — recusando webhook (fail-closed)');
        }
        // A documentação do Asaas proíbe usar a API Key como token do webhook: se forem
        // iguais, quem vê um callback passa a ter a chave da conta.
        if (expected === process.env.ASAAS_API_KEY) {
            throw new InvalidWebhookSignatureError('ASAAS_WEBHOOK_TOKEN não pode ser igual à ASAAS_API_KEY');
        }
        if (!received) {
            throw new InvalidWebhookSignatureError('Notificação sem cabeçalho asaas-access-token');
        }

        // Compara os hashes (mesmo tamanho sempre) para timingSafeEqual não lançar e para o
        // tempo de resposta não revelar o tamanho do token.
        const expectedHash = crypto.createHash('sha256').update(expected).digest();
        const receivedHash = crypto.createHash('sha256').update(String(received)).digest();
        if (!crypto.timingSafeEqual(expectedHash, receivedHash)) {
            throw new InvalidWebhookSignatureError('Token do webhook Asaas inválido');
        }

        return { providerChargeId: request.body?.payment?.id };
    }

    // O token do webhook só prova que quem chamou conhece o segredo — o status e o valor
    // vêm sempre da consulta à API, nunca de `payment.status` no corpo da notificação.
    async getChargeStatus(providerChargeId) {
        const data = await this.#request(`/payments/${encodeURIComponent(providerChargeId)}`);
        const status = toChargeStatus(data);

        // "Pago" sem valor não tem como ser conferido: vira indisponibilidade (503, o Asaas
        // reenvia), nunca confirmação no escuro.
        if (status === CHARGE_STATUS.PAID && data.value == null) {
            console.error('AsaasPixProvider.getChargeStatus: pago sem value', providerChargeId);
            throw new PixProviderUnavailableError('Asaas não informou o valor da cobrança');
        }
        return { status, amount: data.value ?? null, amountVerifiable: true };
    }
}
