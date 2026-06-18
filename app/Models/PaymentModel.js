import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const PaymentModel = sequelize.define(
    'PaymentModel',
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
        reservation_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'reservations', key: 'id' }
        },
        amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        method: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        paid_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: DataTypes.NOW
        }
    },
    {
        tableName: 'payments',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        paranoid: true,
        deletedAt: 'deleted_at'
    }
);

export default PaymentModel;
