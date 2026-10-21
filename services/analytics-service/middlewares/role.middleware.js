// Allowlist de papéis — mesmo contrato do core (services/core-service/middlewares/role.middleware.js).
// Papel ausente ou fora da lista → 403. O próximo papel do sistema nasce sem acesso.
export function requireRole(...allowedRoles) {
    return (request, response, next) => {
        const userRole = request.user?.role;

        if (!userRole || !allowedRoles.includes(userRole)) {
            return response.status(403).json({ error: 'Acesso não autorizado' });
        }

        next();
    };
}
