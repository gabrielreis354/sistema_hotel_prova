import ProductModel from '../../Models/ProductModel.js';
import isUuid from '../../utils/isUuid.js';

/**
 * DELETE /products/:id — soft delete (ADMIN).
 * Para tirar do cardápio sem perder histórico, prefira PUT com `active: false`.
 */
export default async function DeleteProductController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;

        if (!isUuid(id)) return response.status(404).json({ error: 'Produto não encontrado' });

        const product = await ProductModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!product) return response.status(404).json({ error: 'Produto não encontrado' });

        await product.destroy();
        return response.status(204).send();
    } catch (error) {
        console.error('DeleteProductController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
