import type { Role } from '../../types.js';

/**
 * Regras de tela do cadastro de hóspedes. O backend continua sendo a autoridade; aqui só se
 * decide o que habilitar e com que motivo (mesmo molde de rooms/roomRules.ts).
 */

/** Espelha o backend: DELETE /guests/:id exige ADMIN (routes/apis/guestRouter.js). */
export function canDeleteGuest(role: Role | undefined): boolean {
  return role === 'ADMIN';
}

export const DELETE_GUEST_REASON = 'Só o administrador exclui hóspedes.';
