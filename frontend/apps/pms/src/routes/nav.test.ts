import { describe, expect, it } from 'vitest';
import { MOBILE_TABS_MAX, mobileNavForRole, navItemsForRole } from './nav.js';
import type { Role } from '../types.js';

const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe('mobileNavForRole (D-3)', () => {
  it('ADMIN: Hoje, Reservas, Hóspedes, Comanda + Mais com Quartos, Indicadores e Usuários', () => {
    const { primary, more } = mobileNavForRole('ADMIN');
    expect(labels(primary)).toEqual(['Hoje', 'Reservas', 'Hóspedes', 'Comanda']);
    expect(labels(more)).toEqual(['Quartos', 'Indicadores', 'Usuários']);
  });

  it('RECEPTIONIST: os 5 cabem direto, sem "Mais"', () => {
    const { primary, more } = mobileNavForRole('RECEPTIONIST');
    expect(labels(primary)).toEqual(['Hoje', 'Reservas', 'Hóspedes', 'Quartos', 'Comanda']);
    expect(more).toEqual([]);
  });

  it('WAITER: só a Comanda', () => {
    expect(labels(mobileNavForRole('WAITER').primary)).toEqual(['Comanda']);
    expect(mobileNavForRole('WAITER').more).toEqual([]);
  });

  it.each<Role>(['ADMIN', 'RECEPTIONIST', 'WAITER'])('%s: nenhum item some nem aparece em dobro, e nada fora do papel', (role) => {
    const { primary, more } = mobileNavForRole(role);
    const tabs = primary.length + (more.length > 0 ? 1 : 0);
    expect(tabs).toBeLessThanOrEqual(MOBILE_TABS_MAX);
    expect(labels([...primary, ...more]).sort()).toEqual(labels(navItemsForRole(role)).sort());
    expect([...primary, ...more].every((i) => i.roles.includes(role))).toBe(true);
  });
});
