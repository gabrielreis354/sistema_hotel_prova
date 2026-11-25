import { describe, expect, it } from 'vitest';
import { MOBILE_TABS_MAX, mobileNavForRole, navGroupsForRole, navItemsForRole } from './nav.js';
import type { Role } from '../types.js';

const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe('mobileNavForRole (D-3)', () => {
  it('ADMIN: Hoje, Reservas, Hóspedes, Comanda + Mais com Quartos e Indicadores (sem Usuários, CA-09.e)', () => {
    const { primary, more } = mobileNavForRole('ADMIN');
    expect(labels(primary)).toEqual(['Hoje', 'Reservas', 'Hóspedes', 'Comanda']);
    expect(labels(more)).toEqual(['Quartos', 'Indicadores']);
  });

  it('ADMIN: "Usuários" fora do menu do computador e do celular (CA-09.e)', () => {
    expect(labels(navItemsForRole('ADMIN'))).not.toContain('Usuários');
    const { primary, more } = mobileNavForRole('ADMIN');
    expect(labels([...primary, ...more])).not.toContain('Usuários');
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

describe('ícones do menu (SPEC-08, T-08.2)', () => {
  it('todo item tem ícone, e o rótulo continua obrigatório (ícone nunca sozinho)', () => {
    for (const role of ['ADMIN', 'RECEPTIONIST', 'WAITER'] as Role[]) {
      for (const item of navItemsForRole(role)) {
        expect(item.icon, item.label).toBeTruthy();
        expect(item.label.trim().length, item.to).toBeGreaterThan(0);
      }
    }
  });
});

describe('navGroupsForRole — grupos da barra lateral (SPEC-10, T-10.4)', () => {
  it('ADMIN: Operação (Hoje, Reservas, Hóspedes, Quartos, Comanda) e Gestão (Indicadores)', () => {
    const grupos = navGroupsForRole('ADMIN');
    expect(grupos.map((g) => g.title)).toEqual(['Operação', 'Gestão']);
    expect(labels(grupos[0]!.items)).toEqual(['Hoje', 'Reservas', 'Hóspedes', 'Quartos', 'Comanda']);
    expect(labels(grupos[1]!.items)).toEqual(['Indicadores']);
  });

  it('grupo sem item do papel não aparece: o garçom vê só Operação, com Comanda', () => {
    const grupos = navGroupsForRole('WAITER');
    expect(grupos.map((g) => g.title)).toEqual(['Operação']);
    expect(labels(grupos[0]!.items)).toEqual(['Comanda']);
  });

  it('os grupos têm os mesmos itens do menu, na mesma ordem', () => {
    for (const role of ['ADMIN', 'RECEPTIONIST', 'WAITER'] as Role[]) {
      expect(labels(navGroupsForRole(role).flatMap((g) => g.items))).toEqual(labels(navItemsForRole(role)));
    }
  });
});
