import type { Guest } from './guestsApi.js';

/** Casa o termo de busca contra nome, CPF, e-mail ou telefone (case-insensitive). Vazio casa tudo. */
export function guestMatches(guest: Guest, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return [guest.full_name, guest.cpf, guest.email, guest.phone]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q));
}

export function filterGuests(guests: Guest[], term: string): Guest[] {
  return guests.filter((g) => guestMatches(g, term));
}
