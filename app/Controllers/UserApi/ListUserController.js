import UserModel from '../../Models/UserModel.js';

export default async function ListUserController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const users = await UserModel.findAll({
            where: { tenant_id: tenantId },
            attributes: { exclude: ['password_hash'] }
        });
        return response.json(users);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
