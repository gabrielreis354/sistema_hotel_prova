import UserModel from '../../Models/UserModel.js';
import { logError } from '../../utils/logError.js';

export default async function ListUserController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const users = await UserModel.findAll({
            where: { tenant_id: tenantId },
            attributes: { exclude: ['password_hash'] }
        });
        return response.json(users);
    } catch (error) {
        logError('ListUserController', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
