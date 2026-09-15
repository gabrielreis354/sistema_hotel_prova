import type { Role } from '../types.js';

export interface NavItem {
  to: string;
  label: string;
  roles: Role[];
}

/**
 * Navegação por papel (§7.1 do plano). WAITER só vê Comanda; ADMIN vê tudo, incluindo
 * Configurações. A lista é a fonte única do menu e do gate de rota (RequireRole usa os
 * mesmos papéis).
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Hoje', roles: ['ADMIN', 'RECEPTIONIST'] },
  { to: '/reservas', label: 'Reservas', roles: ['ADMIN', 'RECEPTIONIST'] },
  { to: '/hospedes', label: 'Hóspedes', roles: ['ADMIN', 'RECEPTIONIST'] },
  { to: '/comanda', label: 'Comanda', roles: ['ADMIN', 'RECEPTIONIST', 'WAITER'] },
  { to: '/config/usuarios', label: 'Usuários', roles: ['ADMIN'] },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
