// Leitura dos parâmetros de query das consultas de indicadores (T-01.4/H.3, CA-01.4.k).
// No core, data inválida chegava ao PostgreSQL e virava 500; aqui ela para na entrada com 400
// (fail fast). O resto do contrato é o mesmo do core: período só vale com as duas pontas.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INT_RE = /^\d{1,4}$/;

/**
 * YYYY-MM-DD que existe no calendário. 2026-02-30 passa no regex e viraria 500 no Postgres; o ano
 * 0000 também (o JS aceita, o Postgres não). Mesma regra do relatório de consumo interno do core.
 */
export function isCalendarDate(value) {
    if (typeof value !== 'string' || !DATE_RE.test(value) || value.startsWith('0000')) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Período opcional `start`/`end`. Como no core, o filtro só entra com as duas pontas; só uma delas
 * é ignorada. Devolve `{ error }` ou `{ period }`, com `period = null` quando não há filtro.
 */
export function readPeriod(query) {
    const { start, end } = query;
    if (!start || !end) return { period: null };
    if (!isCalendarDate(start) || !isCalendarDate(end)) {
        return { error: 'start e end devem ser datas válidas no formato YYYY-MM-DD' };
    }
    if (start > end) return { error: 'start não pode ser depois de end' };
    return { period: { start, end } };
}

/**
 * Inteiro de `min` a `max`, com padrão quando ausente. Devolve `{ error }` ou `{ value }`.
 * Só dígitos: "5abc" passava no parseInt do core como 5.
 */
export function readIntInRange(raw, { name, min, max, fallback }) {
    if (raw === undefined) return { value: fallback };
    const value = typeof raw === 'string' && INT_RE.test(raw) ? Number.parseInt(raw, 10) : NaN;
    if (Number.isNaN(value) || value < min || value > max) {
        return { error: `${name} deve ser um número entre ${min} e ${max}` };
    }
    return { value };
}
