/** API pública do módulo de reservas (princípio 2: outro módulo importa só daqui). */
export { ReservationsListPage } from './ReservationsListPage.js';
export { NewReservationPage } from './NewReservationPage.js';
export { ReservationDetailPage } from './ReservationDetailPage.js';
export { ReservationReceiptPage } from './ReservationReceiptPage.js';
export { ReservationStatusBadge } from './components/ReservationStatusBadge.js';
// Usados pelo painel "Hoje" (T-05.3): check-in/out na linha com a mesma máquina de estados e a
// mesma conta do detalhe — nenhuma regra de reserva é reescrita fora deste módulo.
export { ButtonLink } from './components/primitives.js';
export { useBill, useTransitionReservation, reservationKeys } from './queries.js';
export { listReservations, type ReservationListItem, type ReservationPage, type ReservationTransition } from './reservationsApi.js';
export { officialBalanceCents, reservationActions, safeNights } from './reservationLogic.js';
