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

        let user;

        if (subdomain) {
            // Caminho explícito: subdomain informado → restringe ao tenant correto.
            // Elimina ambiguidade quando o mesmo e-mail existe em tenants diferentes.
            const tenant = await TenantModel.findOne({ where: { subdomain } });
            if (!tenant) return response.status(401).json({ error: 'Credenciais inválidas' });

            user = await UserModel.findOne({ where: { email, tenant_id: tenant.id } });
            if (!user) return response.status(401).json({ error: 'Credenciais inválidas' });
        } else {
            // Caminho sem subdomain: busca todos os usuários com esse e-mail.
            // Se existir mais de um (mesmo e-mail em tenants diferentes),
            // exige o subdomain para desambiguar — evita retornar o tenant errado.
            const candidates = await UserModel.findAll({ where: { email } });

            if (candidates.length === 0) {
                return response.status(401).json({ error: 'Credenciais inválidas' });
            }

            if (candidates.length > 1) {
                return response.status(409).json({
                    error: 'E-mail associado a múltiplos hotéis. Informe o subdomain para fazer login.',
                    requires: 'subdomain'
                });
            }

            user = candidates[0];
        }

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
        console.error('LoginController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
