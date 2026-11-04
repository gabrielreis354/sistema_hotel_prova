import jwt from 'jsonwebtoken';
import { getPublicKey } from '../app/utils/jwtPublicKey.js';

/**
 * Verifica o JWT emitido pelo core (ADR-006) — mesmo padrão de
 * services/core-service/middlewares/auth.middleware.js: só a chave PÚBLICA e `algorithms: ['RS256']`
 * fixo (sem a trava, o jsonwebtoken aceitaria também RS384/512 e PS* derivados do tipo da chave).
 *
 * `tenantId` vem SÓ daqui — nunca de body, query ou params (CA-01.4.m).
 */
export default function authMiddleware(request, response, next) {
    const authHeader = request.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return response.status(401).json({ error: 'Token não fornecido' });
    }

    try {
        request.user = jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] }); // { userId, role, tenantId }
    } catch {
        return response.status(401).json({ error: 'Token inválido ou expirado' });
    }

    next();
}
