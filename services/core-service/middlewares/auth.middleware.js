import jwt from 'jsonwebtoken';
import { getPublicKey } from '../app/utils/jwtKeys.js';

export default function authMiddleware(request, response, next) {
    const authHeader = request.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return response.status(401).json({ error: 'Token não fornecido' });
    }

    try {
        // `algorithms: ['RS256']` fixo (ADR-006) — defesa em profundidade. O jsonwebtoken
        // 9.x já recusa o "algorithm confusion" clássico (HS256 assinado com a chave
        // pública), mas sem a trava deriva a lista do tipo da chave e aceitaria também
        // RS384/512 e PS*: o contrato é UM algoritmo, sem depender do default da lib.
        // Teste que prova a trava: auth.test.js, RS512/PS256 com a privada correta → 401.
        const payload = jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] });
        request.user = payload; // { userId, role, tenantId }
        next();
    } catch {
        return response.status(401).json({ error: 'Token inválido ou expirado' });
    }
}
