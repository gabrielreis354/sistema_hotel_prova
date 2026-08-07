import ProductModel from '../../Models/ProductModel.js';
import { PRODUCT_CATEGORIES } from '../../utils/productCategories.js';

/**
 * POST /products
 * Cria um item do cardápio.
 */
export default async function CreateProductController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { name, description, price, category, active } = request.body;

        const errors = [];
        if (!name || String(name).trim() === '') errors.push('name obrigatório');
        if (price === undefined || price === null) errors.push('price obrigatório');
        else if (Number(price) < 0)                errors.push('price não pode ser negativo');
        // Allowlist, não blocklist — categoria desconhecida é rejeitada (fail-safe).
        if (category !== undefined && !PRODUCT_CATEGORIES.includes(category)) {
            errors.push(`category deve ser uma de: ${PRODUCT_CATEGORIES.join(', ')}`);
        }
        if (errors.length) return response.status(400).json({ errors });

        // Unicidade é por tenant, não global — dois hotéis podem ter "Cerveja 600ml".
        const existing = await ProductModel.findOne({
            where: { tenant_id: tenantId, name: String(name).trim() }
        });
        if (existing) {
            return response.status(409).json({ error: 'Já existe um produto com esse nome' });
        }

        const product = await ProductModel.create({
            tenant_id: tenantId,
            name: String(name).trim(),
            description: description ?? null,
            price,
            category: category ?? 'OTHER',
            active: active ?? true
        });

        return response.status(201).json(product);
    } catch (error) {
        console.error('CreateProductController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
