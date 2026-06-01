import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const TenantModel = sequelize.define(
    'TenantModel',
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        subdomain: {
            type: DataTypes.TEXT,
            allowNull: false,
            unique: true
        },
        legal_id: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        status: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: 'ACTIVE'
        }
    },
    {
        tableName: 'tenants',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
);

export default TenantModel;
