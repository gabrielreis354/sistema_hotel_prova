import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const GuestModel = sequelize.define(
    'GuestModel',
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
        full_name: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        cpf: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        phone: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        email: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    },
    {
        tableName: 'guests',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        paranoid: true,
        deletedAt: 'deleted_at',
        indexes: [
            {
                // CPF único por tenant — PostgreSQL não considera dois NULLs como iguais,
                // então múltiplos hóspedes sem CPF são permitidos naturalmente.
                unique: true,
                fields: ['cpf', 'tenant_id'],
                name: 'guests_cpf_tenant_unique'
            }
        ]
    }
);

export default GuestModel;
