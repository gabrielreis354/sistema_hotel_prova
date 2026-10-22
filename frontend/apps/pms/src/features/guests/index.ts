/**
 * API pública do módulo de hóspedes (princípio 2: outro módulo importa só daqui).
 * Criado na T-05.2 para a nova reserva reaproveitar a busca e o cadastro de hóspede sem
 * duplicar chamada nem regra de filtro.
 */
export { useGuests, useCreateGuest, guestKeys } from './queries.js';
export { guestMatches, filterGuests } from './guestFilter.js';
export type { Guest, GuestInput } from './guestsApi.js';
