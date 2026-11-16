import { describe, expect, it } from 'vitest';
import { DELETE_GUEST_REASON, canDeleteGuest } from './guestRules.js';

// Espelha o backend: DELETE /guests/:id exige ADMIN (guestRouter.js). A recepção via o botão
// habilitado, confirmava e levava 403 com "Tente novamente" (qa-explorador de 16/11, 🟡-1).
describe('canDeleteGuest — só o administrador exclui hóspede', () => {
  it('ADMIN pode; recepção, garçom e sessão vazia não', () => {
    expect(canDeleteGuest('ADMIN')).toBe(true);
    expect(canDeleteGuest('RECEPTIONIST')).toBe(false);
    expect(canDeleteGuest('WAITER')).toBe(false);
    expect(canDeleteGuest(undefined)).toBe(false);
  });

  it('o motivo diz quem pode, sem mandar tentar de novo', () => {
    expect(DELETE_GUEST_REASON).toMatch(/administrador/);
    expect(DELETE_GUEST_REASON).not.toMatch(/tente/i);
  });
});
