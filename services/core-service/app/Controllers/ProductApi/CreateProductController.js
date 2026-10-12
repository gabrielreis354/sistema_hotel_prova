import ProductModel from '../../Models/ProductModel.js';
import uniqueConstraintConflict from '../../utils/uniqueConstraintConflict.js';
import { validateProductFields, parsePrice } from '../../utils/productValidation.js';

/**
 * POST /products
 * Cria um item do cardápio.
 */
export default async function CreateProductController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { name, description, price, category, active } = request.body;

        const errors = validateProductFields({ name, description, price, category, active });
        if (errors.length) return response.status(400).json({ errors });

        const trimmedName = name.trim();

        // Unicidade é por tenant, não global — dois hotéis podem ter "Cerveja 600ml".
        const existing = await ProductModel.findOne({
            where: { tenant_id: tenantId, name: trimmedName }
        });
        if (existing) {
            return response.status(409).json({ error: 'Já existe um produto com esse nome' });
        }

        const product = await ProductModel.create({
            tenant_id: tenantId,
            name: trimmedName,
            description: description ?? null,
            price: parsePrice(price),
            category: category ?? 'OTHER',
            active: active ?? true
        });

        return response.status(201).json(product);
    } catch (error) {
        // O SELECT acima é check-then-act: duas requisições simultâneas (duplo clique)
        // passam as duas e o índice único barra a segunda. Sem este catch viraria 500.
        const conflito = uniqueConstraintConflict(error, response);
        if (conflito) return conflito;
        console.error('CreateProductController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
