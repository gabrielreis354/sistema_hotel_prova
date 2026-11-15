import { todayInHotel } from '../../app/utils/hotelTimezone.js';

/** Soma dias a uma data 'YYYY-MM-DD', sem passar pelo fuso do servidor. */
export function addDays(iso, days) {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/**
 * Estadia que começa hoje, no fuso do hotel: a janela do check-in está aberta (regra de
 * 15/11/2026, app/utils/checkInWindow.js). Teste que faz check-in usa estas datas; reserva que
 * nunca recebe check-in pode continuar em datas futuras fixas.
 */
export function stayFromToday(nights = 1) {
    const today = todayInHotel();
    return { check_in_date: today, check_out_date: addDays(today, nights) };
}
