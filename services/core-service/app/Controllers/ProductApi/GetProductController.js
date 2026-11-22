import ProductModel from '../../Models/ProductModel.js';
import isUuid from '../../utils/isUuid.js';
import { logError } from '../../utils/logError.js';

/**
 * GET /products/:id
 */
export default async function GetProductController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;

        // :id não-UUID chega ao Postgres como cast inválido e viraria 500.
        if (!isUuid(id)) return response.status(404).json({ error: 'Produto não encontrado' });

        const product = await ProductModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!product) return response.status(404).json({ error: 'Produto não encontrado' });

        return response.json(product);
    } catch (error) {
        logError('GetProductController', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
