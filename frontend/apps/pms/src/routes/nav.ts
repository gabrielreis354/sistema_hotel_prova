import type { Role } from '../types.js';

export interface NavItem {
  to: string;
  label: string;
  roles: Role[];
  /**
   * Fica direto na barra inferior do celular (D-3, decisão do Gabriel de 04/11/2026). Os
   * demais vão para "Mais" quando o papel tem mais itens do que cabem.
   */
  mobilePrimary?: boolean;
}

/**
 * Navegação por papel (§7.1 do plano). WAITER só vê Comanda; ADMIN vê tudo, incluindo
 * Configurações. A lista é a fonte única do menu e do gate de rota (RequireRole usa os
 * mesmos papéis).
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Hoje', roles: ['ADMIN', 'RECEPTIONIST'], mobilePrimary: true },
  { to: '/reservas', label: 'Reservas', roles: ['ADMIN', 'RECEPTIONIST'], mobilePrimary: true },
  { to: '/hospedes', label: 'Hóspedes', roles: ['ADMIN', 'RECEPTIONIST'], mobilePrimary: true },
  // Categorias ficam dentro de Quartos (abas da própria tela) — uma aba a menos no celular.
  { to: '/quartos', label: 'Quartos', roles: ['ADMIN', 'RECEPTIONIST'] },
  { to: '/comanda', label: 'Comanda', roles: ['ADMIN', 'RECEPTIONIST', 'WAITER'], mobilePrimary: true },
  { to: '/indicadores', label: 'Indicadores', roles: ['ADMIN'] },
  { to: '/config/usuarios', label: 'Usuários', roles: ['ADMIN'] },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** Quantas abas cabem na barra inferior em 375 px sem os rótulos se encostarem. */
export const MOBILE_TABS_MAX = 5;

/**
 * Barra inferior do celular (D-3). Se os itens do papel cabem em 5, vão todos direto (a
 * recepção tem 5, o garçom 1) — um "Mais" com um item só seria um toque a mais à toa. Se não
 * cabem (ADMIN, 7), ficam os `mobilePrimary` e o resto entra em "Mais", sempre filtrado pelo
 * papel: nada aparece no "Mais" que o RequireRole não deixaria abrir.
 */
export function mobileNavForRole(role: Role): { primary: NavItem[]; more: NavItem[] } {
  const items = navItemsForRole(role);
  if (items.length <= MOBILE_TABS_MAX) return { primary: items, more: [] };
  const primary = items.filter((i) => i.mobilePrimary).slice(0, MOBILE_TABS_MAX - 1);
  return { primary, more: items.filter((i) => !primary.includes(i)) };
}
