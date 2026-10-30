/**
 * Regras de cadastro de quarto (R-2, R-3 e R-6 do qa-redteam de 21/10).
 *
 * Máquina de estados (CLAUDE.md §3): AVAILABLE → OCCUPIED pelo check-in, OCCUPIED → CLEANING
 * pelo check-out, CLEANING → AVAILABLE quando a limpeza termina (manual). MAINTENANCE é manual.
 */

export const ROOM_STATUSES = ['AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'];

// Quarto novo não tem hóspede nem saída de hóspede: OCCUPIED e CLEANING no cadastro eram
// "ocupado sem ninguém dentro" (allowlist, fail-safe).
export const CREATABLE_ROOM_STATUSES = ['AVAILABLE', 'MAINTENANCE'];

// Transições pela edição manual (PUT /rooms/:id). OCCUPIED e CLEANING só entram e saem
// pelos endpoints de check-in e check-out — exceto CLEANING → AVAILABLE, que é a limpeza
// concluída. Liberar à mão um quarto OCCUPIED o devolvia a /rooms/available com hóspede dentro.
export const MANUAL_ROOM_TRANSITIONS = {
    AVAILABLE:   ['MAINTENANCE'],
    MAINTENANCE: ['AVAILABLE'],
    CLEANING:    ['AVAILABLE'],
    OCCUPIED:    []
};

// Reserva que ainda segura o quarto: excluir o quarto deixaria a reserva sem onde hospedar.
export const ROOM_HOLDING_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];

/**
 * A edição manual pode levar o quarto de `from` para `to`? Reenviar o status atual não é
 * transição (o formulário manda o quarto inteiro de volta). Um status gravado fora da lista
 * (antes da allowlist do cadastro) só sai para os status de quarto novo — sem isso, o quarto
 * ficaria preso nele para sempre.
 */
export function isManualRoomTransitionAllowed(from, to) {
    if (from === to) return true;
    const allowed = MANUAL_ROOM_TRANSITIONS[from] ?? CREATABLE_ROOM_STATUSES;
    return allowed.includes(to);
}

// Coluna INTEGER do Postgres: acima disso o INSERT estoura e viraria 500.
const PG_INT_MAX = 2147483647;

/**
 * Converte um inteiro vindo do corpo (número ou texto só com dígitos), ou null se não for
 * um inteiro dentro do INTEGER do banco. Number() sozinho aceitaria '', true e '1e3'.
 */
export function parseInteger(value) {
    let n;
    if (typeof value === 'number') n = value;
    else if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) n = Number(value.trim());
    else return null;
    return Number.isInteger(n) && Math.abs(n) <= PG_INT_MAX ? n : null;
}

/**
 * Erro de validação do número do quarto, ou null (🟡-2 do qa-redteam de 30/10). Só texto com
 * conteúdo depois de aparar: null, objeto e lista viravam 500, vazio era gravado na edição e
 * `true` virava o quarto "true". `partial: true` na edição — ausente é "não mudar".
 * Quem grava usa o valor aparado.
 */
export function numberError(number, { partial = false } = {}) {
    if (partial && number === undefined) return null;
    // Ausente no cadastro mantém a mensagem de sempre; o cliente antigo lê a lista `errors`.
    if (!partial && (number === undefined || number === null || number === '')) return 'number obrigatório';
    if (typeof number !== 'string' || !number.trim()) return 'number deve ser um texto não vazio';
    return null;
}

/** Erro de validação do andar, ou null. Ausente/null é "sem andar"; 0 é o térreo. */
export function floorError(floor) {
    if (floor === undefined || floor === null) return null;
    return parseInteger(floor) === null ? 'floor deve ser um número inteiro' : null;
}
