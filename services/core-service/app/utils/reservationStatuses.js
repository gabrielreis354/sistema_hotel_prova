/**
 * Situações da reserva (CLAUDE.md §3) — a mesma lista do enum do Swagger e do `@hotel/domain`.
 */
export const RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];

/**
 * Lê o filtro `?status=A,B` da listagem (T-05.3). Allowlist, fail-safe: qualquer item fora da
 * lista, vazio, em minúsculas ou repetido como array (`?status=A&status=B`) é recusado inteiro —
 * nunca ignorado em silêncio, o que devolveria mais reservas do que a tela pediu.
 *
 * @returns {{ ok: true, statuses: string[] | null } | { ok: false, error: string }}
 *          `statuses: null` quando o parâmetro não veio (contrato antigo, sem filtro).
 */
export function parseStatusFilter(raw) {
    if (raw === undefined) return { ok: true, statuses: null };
    const error = `status deve ser um ou mais de: ${RESERVATION_STATUSES.join(', ')} (separados por vírgula)`;
    if (typeof raw !== 'string') return { ok: false, error };
    const parts = raw.split(',');
    if (parts.some((s) => !RESERVATION_STATUSES.includes(s))) return { ok: false, error };
    return { ok: true, statuses: [...new Set(parts)] };
}
