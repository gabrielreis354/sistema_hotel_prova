import type { Guest } from './guestsApi.js';

const onlyDigits = (v: string) => v.replace(/\D/g, '');

/**
 * Casa o termo de busca contra nome, CPF, e-mail ou telefone (case-insensitive). Vazio casa tudo.
 * CPF e telefone também casam só pelos dígitos: a lista mostra o CPF formatado (T-09.2) mesmo
 * quando ele foi gravado cru, e a recepção busca pelo que vê (🟡-1 do qa-redteam de 15/11).
 */
export function guestMatches(guest: Guest, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const textMatch = [guest.full_name, guest.cpf, guest.email, guest.phone]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q));
  if (textMatch) return true;
  // Só quando o termo é "numérico" (dígitos e pontuação de documento/telefone), para que "ana 1"
  // não case por dígito solto.
  const qDigits = onlyDigits(q);
  if (!qDigits || !/^[\d\s.()\-/+]+$/.test(q)) return false;
  return [guest.cpf, guest.phone].some((v) => !!v && onlyDigits(String(v)).includes(qDigits));
}

export function filterGuests(guests: Guest[], term: string): Guest[] {
  return guests.filter((g) => guestMatches(g, term));
}
