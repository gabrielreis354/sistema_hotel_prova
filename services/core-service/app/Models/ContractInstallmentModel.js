import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const ContractInstallmentModel = sequelize.define('ContractInstallment', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    contract_id: { type: DataTypes.UUID, allowNull: false },
    descricao: { type: DataTypes.STRING, allowNull: false },
    data_vencimento: { type: DataTypes.DATEONLY, allowNull: false },
    valor: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    status: { type: DataTypes.ENUM('PENDING', 'PAID'), defaultValue: 'PENDING' },
    paid_at: { type: DataTypes.DATE, allowNull: true },
}, {
    tableName: 'contract_installments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: false,
});

export default ContractInstallmentModel;
