import { Op } from 'sequelize';
import ProductModel from '../../Models/ProductModel.js';
import uniqueConstraintConflict from '../../utils/uniqueConstraintConflict.js';
import { validateProductFields, parsePrice } from '../../utils/productValidation.js';
import isUuid from '../../utils/isUuid.js';

/**
 * PUT /products/:id
 * Atualiza um item do cardápio. `active: false` desativa sem deletar.
 */
export default async function UpdateProductController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { name, description, price, category, active } = request.body;

        if (!isUuid(id)) return response.status(404).json({ error: 'Produto não encontrado' });

        const product = await ProductModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!product) return response.status(404).json({ error: 'Produto não encontrado' });

        const errors = validateProductFields({ name, description, price, category, active }, { partial: true });
        if (errors.length) return response.status(400).json({ errors });

        // Renomear não pode colidir com outro produto VIVO do mesmo tenant.
        if (name !== undefined && name.trim() !== product.name) {
            const clash = await ProductModel.findOne({
                where: { tenant_id: tenantId, name: name.trim(), id: { [Op.ne]: id } }
            });
            if (clash) {
                return response.status(409).json({ error: 'Já existe um produto com esse nome' });
            }
        }

        if (name !== undefined)        product.name = name.trim();
        if (description !== undefined) product.description = description;
        if (price !== undefined)       product.price = parsePrice(price);
        if (category !== undefined)    product.category = category;
        if (active !== undefined)      product.active = active;

        await product.save();

        // Relê do banco antes de responder. Sem isso, `price` volta como number
        // (o valor JS atribuído acima) enquanto POST e GET devolvem string — que é
        // como o driver do Postgres entrega DECIMAL. O mesmo campo mudando de tipo
        // conforme o endpoint quebra o cliente tipado do frontend.
        await product.reload();
        return response.json(product);
    } catch (error) {
        const conflito = uniqueConstraintConflict(error, response);
        if (conflito) return conflito;
        console.error('UpdateProductController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
