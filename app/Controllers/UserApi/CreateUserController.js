import bcrypt from 'bcryptjs';
import UserModel from '../../Models/UserModel.js';

export default async function CreateUserController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { name, email, password, role } = request.body;

        const errors = [];
        if (!name)     errors.push('name obrigatório');
        if (!email)    errors.push('email obrigatório');
        if (!password) errors.push('password obrigatório');
        if (errors.length) return response.status(400).json({ errors });

        const existing = await UserModel.findOne({ where: { email, tenant_id: tenantId } });
        if (existing) return response.status(409).json({ error: 'E-mail já cadastrado neste tenant' });

        const password_hash = await bcrypt.hash(password, 10);
        const user = await UserModel.create({
            tenant_id: tenantId,
            name,
            email,
            password_hash,
            role: role || 'RECEPTIONIST'
        });

        const { password_hash: _, ...data } = user.toJSON();
        return response.status(201).json(data);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
