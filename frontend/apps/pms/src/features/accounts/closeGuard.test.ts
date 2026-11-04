import { describe, it, expect } from 'vitest';
import { CONFIRM_ARM_MS, confirmArmed } from './closeGuard.js';

describe('confirmArmed — toque duplo não fecha a conta (P0 da revisão Impeccable)', () => {
  it('ignora o toque logo depois de a confirmação aparecer (o segundo toque do duplo)', () => {
    expect(confirmArmed(1_000, 1_120)).toBe(false);
  });

  it('aceita depois do prazo', () => {
    expect(confirmArmed(1_000, 1_000 + CONFIRM_ARM_MS)).toBe(true);
  });

  it('o prazo cobre um toque duplo (≥ 300 ms) sem atrasar quem lê e confirma', () => {
    expect(CONFIRM_ARM_MS).toBeGreaterThanOrEqual(300);
    expect(CONFIRM_ARM_MS).toBeLessThanOrEqual(600);
  });
});
