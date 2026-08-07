import type { Role } from '../types.js';

/** Destino inicial por papel: o garçom cai direto na comanda; recepção/admin no painel Hoje. */
export function homeForRole(role: Role): string {
  return role === 'WAITER' ? '/comanda' : '/';
}
