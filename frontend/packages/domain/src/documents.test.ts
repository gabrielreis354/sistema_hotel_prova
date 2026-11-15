import { describe, it, expect } from 'vitest';
import { formatCpf } from './index.js';

describe('formatCpf', () => {
  it('11 digitos crus viram 000.000.000-00', () => {
    expect(formatCpf('30000000014')).toBe('300.000.000-14');
  });

  it('11 digitos com pontuacao parcial ou completa saem no mesmo formato', () => {
    expect(formatCpf('300.000.000-14')).toBe('300.000.000-14');
    expect(formatCpf('300000000-14')).toBe('300.000.000-14');
    expect(formatCpf('300.000.00014')).toBe('300.000.000-14');
    expect(formatCpf(' 300 000 000 14 ')).toBe('300.000.000-14');
  });

  it('fora de 11 digitos volta como veio', () => {
    expect(formatCpf('3000000001')).toBe('3000000001');
    expect(formatCpf('300000000140')).toBe('300000000140');
    expect(formatCpf('12.345.678/0001-90')).toBe('12.345.678/0001-90');
  });

  it('texto que nao e CPF volta como veio, mesmo com 11 digitos no meio', () => {
    expect(formatCpf('RG 30000000014')).toBe('RG 30000000014');
    expect(formatCpf('abc')).toBe('abc');
  });

  it('nulo, vazio ou so espacos vira null', () => {
    expect(formatCpf(null)).toBeNull();
    expect(formatCpf(undefined)).toBeNull();
    expect(formatCpf('')).toBeNull();
    expect(formatCpf('   ')).toBeNull();
  });
});
