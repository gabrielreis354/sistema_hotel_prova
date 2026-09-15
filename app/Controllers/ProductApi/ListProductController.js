import ProductModel from '../../Models/ProductModel.js';
import { PRODUCT_CATEGORIES } from '../../utils/productCategories.js';

/**
 * GET /products?active=true&category=DRINK
 * Lista o cardápio do tenant. O app do garçom usa ?active=true.
 */
export default async function ListProductController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { active, category } = request.query;

        const where = { tenant_id: tenantId };

        // Só filtra quando o valor é explicitamente 'true' ou 'false'; qualquer
        // outra coisa devolve o cardápio inteiro em vez de silenciosamente vazio.
        if (active === 'true')  where.active = true;
        if (active === 'false') where.active = false;

        if (category !== undefined) {
            if (!PRODUCT_CATEGORIES.includes(category)) {
                return response.status(400).json({
                    error: `category deve ser uma de: ${PRODUCT_CATEGORIES.join(', ')}`
                });
            }
            where.category = category;
        }

        const products = await ProductModel.findAll({
            where,
            order: [['category', 'ASC'], ['name', 'ASC']]
        });

        return response.json(products);
    } catch (error) {
        console.error('ListProductController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
