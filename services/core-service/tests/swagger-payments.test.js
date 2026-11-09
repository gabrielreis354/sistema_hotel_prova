/**
 * Contrato OpenAPI do POST /payments (M5-b): o cliente tipado do frontend é gerado deste spec.
 * Com `amount: number`, a tela de pagamento tinha de converter o valor para float — o que a
 * regra de dinheiro do PMS proíbe. O valor vai em texto, como na resposta e no PUT.
 */
import { describe, it, expect } from 'vitest';
import spec from '../config/swagger.js';
import { toCents } from '../app/utils/calculateStayTotal.js';

describe('Swagger — POST /payments', () => {
    const schema = spec.paths['/payments'].post.requestBody.content['application/json'].schema;
    const amount = schema.properties.amount;

    it('amount é texto decimal, não número', () => {
        expect(amount.type).toBe('string');
        expect(amount.example).toBe('300.00');
    });

    it('o pattern do amount aceita o mesmo formato que o backend lê (toCents)', () => {
        const pattern = new RegExp(amount.pattern);
        for (const value of ['300', '300.5', '300.00', '0.01', '1234567.89']) {
            expect(pattern.test(value), value).toBe(true);
            expect(toCents(value), value).toBeGreaterThan(0);
        }
        for (const value of ['300,00', '-5', '1.234', '1e3', '', '300.']) {
            expect(pattern.test(value), value).toBe(false);
            expect(toCents(value), value).toBe(0);
        }
    });
});
