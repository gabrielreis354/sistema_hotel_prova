import { describe, it, expect } from 'vitest';
import { toCents, fromCents, countNights, categoryStayTotal } from '../app/utils/calculateStayTotal.js';

// Unitário puro (achado 🟢-12 de 10/10): o caso 33,33 × 3 da integração também passava com
// float — estes provam a aritmética em centavos diretamente.
describe('cálculo da estadia em centavos', () => {
    it.each([
        ['150.00', 15000], ['33.33', 3333], ['33.3', 3330], ['100', 10000], [150, 15000], ['0.10', 10],
    ])('toCents(%j) = %i', (entrada, esperado) => expect(toCents(entrada)).toBe(esperado));

    it.each([['abc'], [''], [null], ['-5.00'], ['1.234'], ['1e3']])('toCents(%j) = 0 (inválido)', (entrada) => {
        expect(toCents(entrada)).toBe(0);
    });

    it.each([[9999, '99.99'], [5, '0.05'], [10, '0.10'], [123400, '1234.00']])('fromCents(%i) = %s', (c, esperado) => {
        expect(fromCents(c)).toBe(esperado);
    });

    it('soma que em float erra, em centavos não: 0,10 + 0,20 = 0.30', () => {
        expect(0.1 + 0.2).not.toBe(0.3);
        expect(fromCents(toCents('0.10') + toCents('0.20'))).toBe('0.30');
    });

    it('noites entre datas, inclusive atravessando o horário de verão e anos bissextos', () => {
        expect(countNights('2028-02-28', '2028-03-01')).toBe(2);
        expect(countNights('2027-10-30', '2027-11-02')).toBe(3);
        expect(countNights('2028-01-10', '2028-01-10')).toBe(0);
        expect(Number.isNaN(countNights('lixo', '2028-01-10'))).toBe(true);
    });

    it('categoryStayTotal: preço × noites em string decimal', () => {
        expect(categoryStayTotal('33.33', 3)).toBe('99.99');
        expect(categoryStayTotal(150, 3)).toBe('450.00');
    });
});
