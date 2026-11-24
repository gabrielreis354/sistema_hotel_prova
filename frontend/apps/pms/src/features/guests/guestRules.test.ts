import { describe, expect, it } from 'vitest';
import { DELETE_GUEST_REASON, canDeleteGuest, duplicateSearchTerm, findDuplicateGuest } from './guestRules.js';

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

describe('hóspede repetido no cadastro (QA 24/11, 🟢-2)', () => {
  const maria = { id: 'g1', full_name: 'Maria', cpf: '529.982.247-25', email: 'maria@ex.com' };
  const mariana = { id: 'g2', full_name: 'Mariana', cpf: '52998224700', email: 'mariana@ex.com' };

  it('procura pelos dígitos do CPF completo; sem CPF, pelo e-mail; sem os dois, não procura', () => {
    expect(duplicateSearchTerm({ cpf: '529.982.247-25', email: 'x@y.com' })).toBe('52998224725');
    expect(duplicateSearchTerm({ cpf: '529.98', email: ' Maria@Ex.com ' })).toBe('Maria@Ex.com');
    expect(duplicateSearchTerm({ cpf: '', email: '' })).toBeNull();
  });

  it('acha só o mesmo CPF ou o mesmo e-mail, nunca o parecido', () => {
    expect(findDuplicateGuest([mariana, maria], { cpf: '52998224725' })).toBe(maria);
    expect(findDuplicateGuest([mariana, maria], { email: 'MARIA@ex.com' })).toBe(maria);
    expect(findDuplicateGuest([mariana], { cpf: '52998224725' })).toBeNull();
    expect(findDuplicateGuest([maria], { cpf: '', email: '' })).toBeNull();
  });
});
