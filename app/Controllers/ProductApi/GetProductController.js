import ProductModel from '../../Models/ProductModel.js';

/**
 * GET /products/:id
 */
export default async function GetProductController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;

        const product = await ProductModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!product) return response.status(404).json({ error: 'Produto não encontrado' });

        return response.json(product);
    } catch (error) {
        console.error('GetProductController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
