import isUuid from './isUuid.js';

/**
 * Guarda de `router.param` para parâmetro de rota que é UUID: o que não for UUID responde 404 com a
 * mesma mensagem que o controller dá para um registro inexistente, em vez de chegar ao Postgres
 * como cast inválido (22P02) e virar 500 — com o SQL e o tenant_id no log.
 *
 *     router.param('id', notFoundUnlessUuid('Hóspede não encontrado'));
 *
 * Nasceu no reservationRouter (fix/reserva-id-invalido-404) e subiu para cá quando os outros oito
 * routers precisaram (repasse do red team de 15/11).
 */
export default function notFoundUnlessUuid(message) {
    return function rejectNonUuid(request, response, next, value) {
        if (!isUuid(value)) return response.status(404).json({ error: message });
        return next();
    };
}
