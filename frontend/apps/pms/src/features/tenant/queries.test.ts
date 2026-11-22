// O garçom não pergunta pelo hotel: o backend devolve 403 a ele em GET /tenants/me (allowlist do
// WAITER, SPEC-04 §6). Avaliação simulada da banca de 15/11.
import { describe, expect, it } from 'vitest';
import { canReadMyTenant, myTenantQuery } from './queries.js';

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

describe('myTenantQuery — a consulta do hook leva o papel (🟡 do qa-redteam de 16/11)', () => {
  it('garçom: consulta desligada, nenhuma chamada a /tenants/me', () => {
    expect(myTenantQuery('WAITER').enabled).toBe(false);
    expect(myTenantQuery(undefined).enabled).toBe(false);
  });

  it('admin e recepção: consulta ligada, mesma chave e mesmo cache do comprovante', () => {
    expect(myTenantQuery('ADMIN').enabled).toBe(true);
    expect(myTenantQuery('RECEPTIONIST').enabled).toBe(true);
    expect(myTenantQuery('ADMIN').queryKey).toEqual(['tenant', 'me']);
  });
});
