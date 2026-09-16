import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const CorporateClientModel = sequelize.define('CorporateClient', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    razao_social: { type: DataTypes.STRING, allowNull: false },
    cnpj: { type: DataTypes.STRING(14), allowNull: true },
    cpf: { type: DataTypes.STRING(11), allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    telefone: { type: DataTypes.STRING, allowNull: true },
    endereco: { type: DataTypes.TEXT, allowNull: true },
    representante_nome: { type: DataTypes.STRING, allowNull: true },
    representante_cpf: { type: DataTypes.STRING(11), allowNull: true },
    representante_rg: { type: DataTypes.STRING, allowNull: true },
}, {
    tableName: 'corporate_clients',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
    indexes: [
        { unique: true, fields: ['cnpj', 'tenant_id'], name: 'corporate_clients_cnpj_tenant_unique' },
        { unique: true, fields: ['cpf', 'tenant_id'], name: 'corporate_clients_cpf_tenant_unique' },
    ]
});

export default CorporateClientModel;
