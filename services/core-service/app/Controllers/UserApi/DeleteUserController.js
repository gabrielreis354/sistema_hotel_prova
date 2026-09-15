import UserModel from '../../Models/UserModel.js';

export default async function DeleteUserController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const user = await UserModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!user) return response.status(404).json({ error: 'Usuário não encontrado' });
        await user.destroy();
        return response.status(204).send();
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
