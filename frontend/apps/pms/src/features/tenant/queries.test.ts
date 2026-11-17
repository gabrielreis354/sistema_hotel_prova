// O garçom não pergunta pelo hotel: o backend devolve 403 a ele em GET /tenants/me (allowlist do
// WAITER, SPEC-04 §6). Avaliação simulada da banca de 15/11.
import { describe, expect, it } from 'vitest';
import { canReadMyTenant } from './queries.js';

describe('canReadMyTenant', () => {
  it('admin e recepção leem o hotel', () => {
    expect(canReadMyTenant('ADMIN')).toBe(true);
    expect(canReadMyTenant('RECEPTIONIST')).toBe(true);
  });

  it('garçom, papel desconhecido ou sem sessão não perguntam (allowlist)', () => {
    expect(canReadMyTenant('WAITER')).toBe(false);
    expect(canReadMyTenant(undefined)).toBe(false);
    expect(canReadMyTenant('QUALQUER' as never)).toBe(false);
  });
});
