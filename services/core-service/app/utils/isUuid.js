const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Um :id que não é UUID chega ao Postgres como cast inválido e vira 500.
 * Validar antes permite responder 404, que é o que o cliente espera de um
 * recurso inexistente.
 */
export default function isUuid(value) {
    return typeof value === 'string' && UUID_RE.test(value);
}
