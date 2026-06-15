import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import UserModel from '../../Models/UserModel.js';

export default async function LoginController(request, response) {
    try {
        const { email, password } = request.body;

        const errors = [];
        if (!email)    errors.push('email obrigatório');
        if (!password) errors.push('password obrigatório');
        if (errors.length) return response.status(400).json({ errors });

        const user = await UserModel.findOne({ where: { email } });
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
