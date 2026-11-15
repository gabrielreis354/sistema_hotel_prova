import { describe, it, expect } from 'vitest';
import { guestMatches, filterGuests } from './guestFilter.js';
import type { Guest } from './guestsApi.js';

const guests: Guest[] = [
  { id: '1', full_name: 'Carlos Andrade', cpf: '111.222.333-44', email: 'carlos@ex.com', phone: '(11) 90000-0001' },
  { id: '2', full_name: 'Ana Beatriz', cpf: '555.666.777-88', email: 'ana@ex.com', phone: '(21) 90000-0002' },
];

describe('guestMatches', () => {
  it('termo vazio casa qualquer hospede', () => {
    expect(guestMatches(guests[0]!, '')).toBe(true);
    expect(guestMatches(guests[0]!, '   ')).toBe(true);
  });

  it('casa por nome, ignorando caixa', () => {
    expect(guestMatches(guests[0]!, 'carlos')).toBe(true);
    expect(guestMatches(guests[0]!, 'ANA')).toBe(false);
  });

  it('casa por CPF, e-mail e telefone', () => {
    expect(guestMatches(guests[1]!, '555.666')).toBe(true);
    expect(guestMatches(guests[1]!, 'ana@ex')).toBe(true);
    expect(guestMatches(guests[1]!, '(21)')).toBe(true);
  });

  it('CPF gravado cru casa com a busca formatada, como a lista o mostra (🟡-1 do qa-redteam)', () => {
    const cru: Guest = { id: '4', full_name: 'Nelson', cpf: '30000000014', phone: '11900000001' };
    expect(guestMatches(cru, '300.000.000')).toBe(true);
    expect(guestMatches(cru, '300.000.000-14')).toBe(true);
    expect(guestMatches(guests[0]!, '11122233344')).toBe(true);
    expect(guestMatches(cru, '(11) 90000')).toBe(true);
    expect(guestMatches(cru, '999.000')).toBe(false);
    // termo com letras não cai na busca por dígitos
    expect(guestMatches(cru, 'ana 300')).toBe(false);
  });

  it('ignora campos ausentes sem quebrar', () => {
    const semContato: Guest = { id: '3', full_name: 'So Nome' };
    expect(guestMatches(semContato, 'nome')).toBe(true);
    expect(guestMatches(semContato, 'cpf')).toBe(false);
  });
});

describe('filterGuests', () => {
  it('filtra a lista pelo termo', () => {
    expect(filterGuests(guests, 'ana').map((g) => g.id)).toEqual(['2']);
    expect(filterGuests(guests, '').length).toBe(2);
    expect(filterGuests(guests, 'inexistente').length).toBe(0);
  });
});
