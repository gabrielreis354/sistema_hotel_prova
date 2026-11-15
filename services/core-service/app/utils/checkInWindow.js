/**
 * Janela do check-in (regra de 15/11/2026, revisão das telas prontas): a recepção só faz o
 * check-in quando a data de entrada já chegou e a data de saída ainda não. Sem isto, uma
 * reserva vencida de setembro entrava "na casa" em novembro e a conta lançava diárias de
 * noites que não aconteceram. Chegada atrasada dentro do período continua valendo.
 *
 * Datas no formato 'YYYY-MM-DD' (DATEONLY), que se comparam como texto. `today` vem de
 * todayInHotel(), no fuso do hotel. O frontend espelha esta regra em @hotel/domain.
 */
export const CHECK_IN_WINDOW = Object.freeze({
    OPEN: 'OPEN',
    TOO_EARLY: 'CHECK_IN_TOO_EARLY',
    EXPIRED: 'RESERVATION_EXPIRED',
});

export function checkInWindow(checkInDate, checkOutDate, today) {
    if (today < checkInDate) return CHECK_IN_WINDOW.TOO_EARLY;
    if (today >= checkOutDate) return CHECK_IN_WINDOW.EXPIRED;
    return CHECK_IN_WINDOW.OPEN;
}

const brDate = (iso) => iso.split('-').reverse().join('/');

/** Corpo do 422 de check-in fora da janela, com `code` estável para a tela decidir. */
export function checkInWindowError(window, reservation) {
    if (window === CHECK_IN_WINDOW.TOO_EARLY) {
        return { code: window, error: `Check-in só a partir de ${brDate(reservation.check_in_date)}, a data de entrada da reserva` };
    }
    return { code: window, error: `Reserva vencida: a saída era ${brDate(reservation.check_out_date)}. Cancele a reserva em vez de fazer o check-in` };
}
