import jwt from 'jsonwebtoken';
import { getPublicKey } from '../app/utils/jwtKeys.js';

export default function authMiddleware(request, response, next) {
    const authHeader = request.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return response.status(401).json({ error: 'Token não fornecido' });
    }

    try {
        // `algorithms: ['RS256']` fixo é o que fecha o CA-01.3.b (ADR-006): sem isso,
        // um token forjado com `alg: HS256`, assinado usando a própria chave PÚBLICA
        // como segredo simétrico (ela não é secreta — é distribuída de propósito),
        // passaria na verificação. É a vulnerabilidade de "algorithm confusion" — a
        // biblioteca aceita, por padrão, qualquer algoritmo que o token declarar.
        const payload = jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] });
        request.user = payload; // { userId, role, tenantId }
        next();
    } catch {
        return response.status(401).json({ error: 'Token inválido ou expirado' });
    }
}
