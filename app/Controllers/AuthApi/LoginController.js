import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import UserModel from '../../Models/UserModel.js';
import TenantModel from '../../Models/TenantModel.js';

export default async function LoginController(request, response) {
    try {
        const { email, password, subdomain } = request.body;

        const errors = [];
        if (!email)    errors.push('email obrigatório');
        if (!password) errors.push('password obrigatório');
        if (errors.length) return response.status(400).json({ errors });

        // Se o subdomain for informado, restringe o login ao tenant correto,
        // evitando colisão quando o mesmo e-mail existe em tenants diferentes.
        let tenantId = undefined;
        if (subdomain) {
            const tenant = await TenantModel.findOne({ where: { subdomain } });
            if (!tenant) return response.status(401).json({ error: 'Credenciais inválidas' });
            tenantId = tenant.id;
        }

        const where = tenantId ? { email, tenant_id: tenantId } : { email };
        const user = await UserModel.findOne({ where });
        if (!user) return response.status(401).json({ error: 'Credenciais inválidas' });

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return response.status(401).json({ error: 'Credenciais inválidas' });

        const token = jwt.sign(
            { userId: user.id, role: user.role, tenantId: user.tenant_id },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        return response.json({
            token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
