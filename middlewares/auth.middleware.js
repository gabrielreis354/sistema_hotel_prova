import jwt from 'jsonwebtoken';

export default function authMiddleware(request, response, next) {
    const authHeader = request.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return response.status(401).json({ error: 'Token não fornecido' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        request.user = payload; // { userId, role, tenantId }
        next();
    } catch {
        return response.status(401).json({ error: 'Token inválido ou expirado' });
    }
}
