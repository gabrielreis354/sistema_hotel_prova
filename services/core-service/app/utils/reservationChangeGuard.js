/**
 * Pode alterar quartos ou datas desta reserva pelas rotas de reserva?
 *
 * - Reserva-bloco B2B: não. Ela é o lado de quartos de um contrato assinado; mexer nela pela
 *   rota de reserva libera ou prende quartos com o contrato inalterado — e assinar e cancelar
 *   contrato é decisão do ADMIN (P-3). Altera-se pelo contrato.
 * - Estadia encerrada (CHECKED_OUT) ou cancelada: não há o que ocupar nem cobrar a mais.
 *
 * @returns {null | { status: number, message: string }}
 */
export function reservationChangeBlocked(reservation) {
    if (reservation.source === 'B2B') {
        return { status: 409, message: 'Reserva-bloco de contrato: altere ou cancele pelo contrato (/contracts/:id)' };
    }
    if (['CHECKED_OUT', 'CANCELLED'].includes(reservation.status)) {
        return { status: 409, message: `Reserva em ${reservation.status} não pode ter quartos ou datas alterados` };
    }
    return null;
}
