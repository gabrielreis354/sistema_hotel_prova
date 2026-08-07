import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';
import { PRODUCT_CATEGORIES } from '../utils/productCategories.js';

// Item do cardápio do hotel (bebida, comida, serviço). Consumido pelo app do garçom
// ao lançar itens numa comanda. Espelha o padrão de RoomCategoryModel: tenant_id,
// unique composto por tenant e soft delete.
const ProductModel = sequelize.define(
    'ProductModel',
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'tenants', key: 'id' }
        },
        name: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        price: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0
        },
        category: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: 'OTHER',
            validate: {
                isIn: {
                    args: [PRODUCT_CATEGORIES],
                    msg: `category deve ser uma de: ${PRODUCT_CATEGORIES.join(', ')}`
                }
            }
        },
        // Desativar preserva o histórico: itens de comanda já lançados continuam
        // apontando para o produto, mas ele some do cardápio do garçom.
        active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    },
    {
        tableName: 'products',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        paranoid: true,
        deletedAt: 'deleted_at',
        indexes: [
            {
                unique: true,
                fields: ['tenant_id', 'name'],
                name: 'products_name_tenant_unique'
            }
        ]
    }
);

export default ProductModel;
