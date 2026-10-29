/**
 * API pública do módulo de hóspedes (princípio 2: outro módulo importa só daqui).
 * Criado na T-05.2 para a nova reserva reaproveitar a busca e o cadastro de hóspede sem
 * duplicar chamada nem regra.
 */
export { useGuestSearch, useCreateGuest, guestKeys, MIN_SEARCH_TERM, searchTermOf } from './queries.js';
export type { Guest, GuestInput } from './guestsApi.js';
