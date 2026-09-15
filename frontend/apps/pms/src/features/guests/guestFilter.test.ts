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
