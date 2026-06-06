import bcrypt from 'bcryptjs';
import TenantModel from '../../Models/TenantModel.js';
import UserModel from '../../Models/UserModel.js';

export default async function RegisterController(request, response) {
    try {
        const { tenantName, name, email, password } = request.body;

        const errors = [];
        if (!tenantName) errors.push('tenantName obrigatório');
        if (!name)       errors.push('name obrigatório');
        if (!email)      errors.push('email obrigatório');
        if (!password)   errors.push('password obrigatório');
        if (errors.length) return response.status(400).json({ errors });

        const existing = await UserModel.findOne({ where: { email } });
        if (existing) return response.status(409).json({ error: 'E-mail já cadastrado' });

        const tenant = await TenantModel.create({ name: tenantName, status: 'ACTIVE' });
        const password_hash = await bcrypt.hash(password, 10);

        const user = await UserModel.create({
            tenant_id: tenant.id,
            name,
            email,
            password_hash,
            role: 'ADMIN'
        });

        return response.status(201).json({
            tenant: { id: tenant.id, name: tenant.name },
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
