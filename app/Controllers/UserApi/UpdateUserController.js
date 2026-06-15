import bcrypt from 'bcryptjs';
import UserModel from '../../Models/UserModel.js';

export default async function UpdateUserController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { name, email, password, role } = request.body;

        const user = await UserModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!user) return response.status(404).json({ error: 'Usuário não encontrado' });

        if (name)     user.name = name;
        if (email)    user.email = email;
        if (role)     user.role = role;
        if (password) user.password_hash = await bcrypt.hash(password, 10);

        await user.save();
        const { password_hash: _, ...data } = user.toJSON();
        return response.json(data);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
