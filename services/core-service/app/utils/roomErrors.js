/**
 * Códigos estáveis dos erros de quartos e categorias, combinados com o frontend (T-05.1).
 * A tela decide pelo `code`, nunca pelo texto de `error` — o texto pode mudar, o code não.
 * Mudar um valor aqui quebra o cliente: trate como contrato da API (config/swagger.js).
 */
export const ROOM_ERROR_CODES = Object.freeze({
    INVALID_INPUT: 'INVALID_INPUT',
    CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
    CATEGORY_IN_USE: 'CATEGORY_IN_USE',
    CATEGORY_NAME_TAKEN: 'CATEGORY_NAME_TAKEN',
    ROOM_NUMBER_TAKEN: 'ROOM_NUMBER_TAKEN',
    ROOM_IN_USE: 'ROOM_IN_USE',
    ROOM_STATUS_TRANSITION_NOT_ALLOWED: 'ROOM_STATUS_TRANSITION_NOT_ALLOWED'
});

/**
 * Corpo de um erro com code. `extra` acrescenta campos (ex.: `errors`, `field`).
 * @returns {{ error: string, code: string }}
 */
export function roomError(code, error, extra = {}) {
    return { error, code, ...extra };
}

/**
 * Corpo do 400 de validação. Mantém a lista `errors` de sempre (o cliente antigo lê ela) e
 * acrescenta `error` (todas as mensagens), `code` e `field` (o primeiro campo que falhou).
 * @param {{ field: string, message: string }[]} issues — não vazio
 */
export function invalidInputBody(issues) {
    const errors = issues.map((issue) => issue.message);
    return roomError(ROOM_ERROR_CODES.INVALID_INPUT, errors.join('; '), { errors, field: issues[0].field });
}
