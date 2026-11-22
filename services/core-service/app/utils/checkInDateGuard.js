/**
 * Reserva com entrada no passado (SPEC-11, T-11.2, CA-11.f). O PMS aceitava `check_in_date`
 * de ontem (201): a reserva nascia vencida e a conta podia lançar diária de noite que não houve.
 * Hoje continua valendo — é o walk-in do balcão.
 *
 * Na troca de datas só conta a entrada que MUDA (parecer do Sirlande de 22/11, 🟡1): quem está
 * na casa desde ontem estende a saída, e a chegada atrasada PENDING troca de quarto, sem 422.
 *
 * Datas 'YYYY-MM-DD' (DATEONLY), que se comparam como texto. `today` vem de todayInHotel().
 */
export const CHECK_IN_IN_PAST = 'CHECK_IN_IN_PAST';

export function checkInInPast(checkInDate, today, previousCheckInDate) {
    if (previousCheckInDate !== undefined && checkInDate === previousCheckInDate) return false;
    return checkInDate < today;
}

const brDate = (iso) => iso.split('-').reverse().join('/');

/** Corpo do 422, com `code` estável para a tela decidir (mesmo molde do checkInWindowError). */
export function checkInInPastError(checkInDate) {
    return {
        code: CHECK_IN_IN_PAST,
        error: `A data de entrada (${brDate(checkInDate)}) já passou. Para quem chega hoje, use a data de hoje`,
    };
}
