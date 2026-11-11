import { readIntInRange } from './queryParams.js';

// Teto das listas detalhadas (revenue.unpaid e alertas) — 🟢-4 do qa-redteam da H.3. Mesmos números
// da paginação do core (ListReservationController: padrão 50, máximo 100). Inválido → 400, como o
// limit do top-guests.
export const LIST_LIMIT = { name: 'limit', min: 1, max: 100, fallback: 50 };

export const readListLimit = (query) => readIntInRange(query.limit, LIST_LIMIT);

// Coluna que a consulta acrescenta antes do LIMIT: o total de linhas, igual em todas.
export const TOTAL_COLUMN = 'COUNT(*) OVER ()::int AS _total';

/** Separa o total das linhas. Sem linha, o total é 0. */
export function splitTotal(rows) {
    return {
        rows: rows.map(({ _total, ...row }) => row),
        total: rows[0]?._total ?? 0
    };
}
