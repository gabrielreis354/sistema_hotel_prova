import { isIsoDate } from './isIsoDate.js';
import { todayInHotel } from './hotelTimezone.js';

/**
 * Datas da estadia pedidas pela API pública (disponibilidade e booking), sem login.
 *
 * Devolve `null` quando as datas servem ou a mensagem do 400 quando não servem. Fica num lugar só
 * para a disponibilidade e o booking nunca discordarem (QA de 24/11):
 * - data que não existe no calendário ('2027-02-30') chegava ao Postgres e virava 500 (🟡-3);
 * - entrada no passado era aceita e gerava cobrança PIX (pendência do guia do passo 6).
 *
 * "Hoje" é o dia do hotel (D-68), não o do servidor em UTC: às 22h de Brasília ainda é hoje.
 * Entrada hoje vale: o hóspede reserva para a mesma noite.
 *
 * @param {unknown} checkIn
 * @param {unknown} checkOut
 * @param {Date} [now] relógio injetável para teste
 * @returns {string|null}
 */
export function publicStayDatesError(checkIn, checkOut, now = new Date()) {
    if (!checkIn || !checkOut) return 'check_in e check_out são obrigatórios (YYYY-MM-DD)';
    if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) {
        return 'check_in e check_out precisam ser datas válidas no formato YYYY-MM-DD';
    }
    if (checkIn >= checkOut) return 'check_out deve ser posterior a check_in';
    if (checkIn < todayInHotel(now)) return 'check_in não pode ser no passado';
    return null;
}
