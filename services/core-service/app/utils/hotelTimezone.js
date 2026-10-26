// Fuso em que o hotel conta o dia (D-68, T-04.7). O banco guarda instantes (TIMESTAMPTZ) e
// a sessão do Sequelize roda em UTC: sem converter, `::date` joga tudo o que acontece
// entre 21h e meia-noite em Brasília para o dia seguinte — a cortesia das 22:30 de 31/10
// cairia no relatório de novembro.
//
// Uma constante para o produto inteiro enquanto todos os hotéis estão no horário de
// Brasília. Hotel em outro fuso (Manaus, Fernando de Noronha) pede uma coluna em
// `tenants` — fora do MVP. Relatório que agrupa por dia deve usar esta constante:
//   (coluna AT TIME ZONE :timezone)::date   com replacements: { timezone: HOTEL_TIMEZONE }
export const HOTEL_TIMEZONE = 'America/Sao_Paulo';
