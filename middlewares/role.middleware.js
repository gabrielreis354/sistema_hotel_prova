export function requireRole(...allowedRoles) {
    return (request, response, next) => {
        const userRole = request.user?.role;

        if (!userRole || !allowedRoles.includes(userRole)) {
            return response.status(403).json({ error: 'Acesso não autorizado' });
        }

        next();
    };
}
