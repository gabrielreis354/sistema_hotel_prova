// Fuso em que o hotel conta o dia (D-68). Mesma regra e mesma constante do core
// (services/core-service/app/utils/hotelTimezone.js): o banco guarda instantes (TIMESTAMPTZ) e a sessão
// roda em UTC; sem converter, o que acontece entre 21h e meia-noite em Brasília cai no dia seguinte.
// Uma constante para o produto enquanto todos os hotéis estão no horário de Brasília; hotel em outro
// fuso pede uma coluna em `tenants` (fora do MVP), nos dois serviços. Uso no SQL:
//   (coluna AT TIME ZONE :timezone)::date   com replacements: { timezone: HOTEL_TIMEZONE }
export const HOTEL_TIMEZONE = 'America/Sao_Paulo';

/** "Hoje" no fuso do hotel, 'yyyy-MM-dd' (en-CA formata assim). Lê o relógio do processo. */
export function hotelToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: HOTEL_TIMEZONE }).format(new Date());
}
