/**
 * Datas do domínio hoteleiro, ancoradas no fuso do hotel.
 *
 * O bug clássico: uma diária "2026-07-01" parseada como UTC e exibida em -03:00 vira
 * "30/06". Diária que escorrega um dia é erro de faturamento. Então fixamos o fuso em
 * America/Sao_Paulo e tratamos datas de calendário (check-in/out) como meia-noite nesse fuso.
 */
import { differenceInCalendarDays, addDays as addDaysFn } from 'date-fns';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

/** Fuso de referência do produto. Um só, fixo — não usa o fuso do navegador. */
export const HOTEL_TZ = 'America/Sao_Paulo';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Converte 'yyyy-MM-dd' no instante da meia-noite do fuso do hotel. */
export function parseHotelDate(iso: string): Date {
  if (!ISO_DATE_RE.test(iso)) {
    throw new RangeError(`Data de calendário inválida (esperado yyyy-MM-dd): ${iso}`);
  }
  return fromZonedTime(`${iso}T00:00:00`, HOTEL_TZ);
}

/** Formata uma data (string yyyy-MM-dd ou Date) como 'dd/MM/yyyy' no fuso do hotel. */
export function formatDateBR(value: string | Date): string {
  const instant = typeof value === 'string' ? parseHotelDate(value) : value;
  return formatInTimeZone(instant, HOTEL_TZ, 'dd/MM/yyyy');
}

/** Data/hora completa (ex.: consumo lançado às 14:32) como 'dd/MM/yyyy HH:mm'. */
export function formatDateTimeBR(value: string | Date): string {
  const instant = typeof value === 'string' ? new Date(value) : value;
  return formatInTimeZone(instant, HOTEL_TZ, 'dd/MM/yyyy HH:mm');
}

/** Devolve 'yyyy-MM-dd' (o formato que o backend espera) a partir de um instante. */
export function toISODate(value: Date): string {
  return formatInTimeZone(value, HOTEL_TZ, 'yyyy-MM-dd');
}

/** Número de diárias entre check-in e check-out (noites). check_out no dia do check_in = 0. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return differenceInCalendarDays(parseHotelDate(checkOut), parseHotelDate(checkIn));
}

/** Soma dias a uma data de calendário, devolvendo 'yyyy-MM-dd' no fuso do hotel. */
export function addDaysISO(iso: string, days: number): string {
  return toISODate(addDaysFn(parseHotelDate(iso), days));
}

/** Data de hoje como 'yyyy-MM-dd' no fuso do hotel. */
export function todayISO(): string {
  return formatInTimeZone(new Date(), HOTEL_TZ, 'yyyy-MM-dd');
}
