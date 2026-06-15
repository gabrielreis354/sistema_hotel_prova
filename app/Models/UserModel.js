import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const UserModel = sequelize.define(
    'UserModel',
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
        email: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        password_hash: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        role: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: 'RECEPTIONIST'
        }
    },
    {
        tableName: 'users',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        paranoid: true,
        deletedAt: 'deleted_at',
        indexes: [
            {
                unique: true,
                fields: ['email', 'tenant_id'],
                name: 'users_email_tenant_unique'
            }
        ]
    }
);

export default UserModel;
