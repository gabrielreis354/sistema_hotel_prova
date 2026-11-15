import type { LucideIcon } from 'lucide-react';
// Um import por ícone (SPEC-08 §8): o bundle leva só os seis usados, não a biblioteca.
import { BedDouble, CalendarDays, ChartColumn, ClipboardList, Receipt, Users } from 'lucide-react';
import type { Role } from '../types.js';

export interface NavItem {
  to: string;
  label: string;
  /** Ícone de traço fino antes do rótulo (T-08.2). Nunca aparece sozinho: o rótulo é obrigatório. */
  icon: LucideIcon;
  roles: Role[];
  /**
   * Fica direto na barra inferior do celular (D-3, decisão do Gabriel de 04/11/2026). Os
   * demais vão para "Mais" quando o papel tem mais itens do que cabem.
   */
  mobilePrimary?: boolean;
}

/**
 * Navegação por papel (§7.1 do plano). WAITER só vê Comanda; ADMIN vê todos os itens do menu.
 * A lista é a fonte do menu. O gate de rota é o `RequireRole` de cada rota no `App.tsx`, que
 * pode ter rota fora do menu (Usuários, até a tela existir).
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Hoje', icon: CalendarDays, roles: ['ADMIN', 'RECEPTIONIST'], mobilePrimary: true },
  { to: '/reservas', label: 'Reservas', icon: ClipboardList, roles: ['ADMIN', 'RECEPTIONIST'], mobilePrimary: true },
  { to: '/hospedes', label: 'Hóspedes', icon: Users, roles: ['ADMIN', 'RECEPTIONIST'], mobilePrimary: true },
  // Categorias ficam dentro de Quartos (abas da própria tela) — uma aba a menos no celular.
  { to: '/quartos', label: 'Quartos', icon: BedDouble, roles: ['ADMIN', 'RECEPTIONIST'] },
  { to: '/comanda', label: 'Comanda', icon: Receipt, roles: ['ADMIN', 'RECEPTIONIST', 'WAITER'], mobilePrimary: true },
  { to: '/indicadores', label: 'Indicadores', icon: ChartColumn, roles: ['ADMIN'] },
  // "Usuários" (/config/usuarios) volta no 5º semestre, quando a tela existir; a rota segue no App.tsx.
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** Quantas abas cabem na barra inferior em 375 px sem os rótulos se encostarem. */
export const MOBILE_TABS_MAX = 5;

/**
 * Barra inferior do celular (D-3). Se os itens do papel cabem em 5, vão todos direto (a
 * recepção tem 5, o garçom 1) — um "Mais" com um item só seria um toque a mais à toa. Se não
 * cabem (ADMIN, 6), ficam os `mobilePrimary` e o resto entra em "Mais", sempre filtrado pelo
 * papel: nada aparece no "Mais" que o RequireRole não deixaria abrir.
 */
export function mobileNavForRole(role: Role): { primary: NavItem[]; more: NavItem[] } {
  const items = navItemsForRole(role);
  if (items.length <= MOBILE_TABS_MAX) return { primary: items, more: [] };
  const primary = items.filter((i) => i.mobilePrimary).slice(0, MOBILE_TABS_MAX - 1);
  return { primary, more: items.filter((i) => !primary.includes(i)) };
}
