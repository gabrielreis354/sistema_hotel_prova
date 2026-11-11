import { describe, it, expect } from 'vitest';
import { isValidCpf } from '../app/utils/isValidCpf.js';

// CPF malformado chegava ao Asaas e voltava como 503 (ressalva 🟡3 do qa-redteam de 16/10).
// O validador confere o formato e os dois dígitos verificadores antes de chamar o PSP.
describe('isValidCpf', () => {
    it('aceita CPF válido só com dígitos ou formatado', () => {
        expect(isValidCpf('52998224725')).toBe(true);
        expect(isValidCpf('529.982.247-25')).toBe(true);
        expect(isValidCpf('16899535009')).toBe(true);
    });

    it('recusa dígito verificador errado', () => {
        expect(isValidCpf('52998224724')).toBe(false);
        expect(isValidCpf('52998224715')).toBe(false);
    });

    it('recusa tamanho diferente de 11 dígitos', () => {
        expect(isValidCpf('5299822472')).toBe(false);
        expect(isValidCpf('529982247250')).toBe(false);
    });

    it('recusa sequência de dígitos iguais, que passa na conta dos verificadores', () => {
        expect(isValidCpf('00000000000')).toBe(false);
        expect(isValidCpf('111.111.111-11')).toBe(false);
    });

    it('recusa vazio, nulo e não-string', () => {
        expect(isValidCpf('')).toBe(false);
        expect(isValidCpf(null)).toBe(false);
        expect(isValidCpf(undefined)).toBe(false);
        expect(isValidCpf(52998224725)).toBe(false);
    });
});
