import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const QuoteServiceModel = sequelize.define('QuoteService', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    quote_id: { type: DataTypes.UUID, allowNull: false },
    nome: { type: DataTypes.STRING, allowNull: false },
    quantidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    valor_unitario: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    diarias: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
}, {
    tableName: 'quote_services',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: false,
});

export default QuoteServiceModel;
