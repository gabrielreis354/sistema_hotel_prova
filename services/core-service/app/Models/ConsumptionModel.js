import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

// Consumo extra lançado numa reserva (frigobar, restaurante, bar, spa, lavanderia).
// Espelha o padrão de PaymentModel: tenant_id, reservation_id, soft delete.
const ConsumptionModel = sequelize.define(
    'ConsumptionModel',
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
        description: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        consumed_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        // Quem autorizou a exclusão (soft delete) — trilha de auditoria financeira.
        deleted_by: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'users', key: 'id' }
        }
    },
    {
        tableName: 'consumptions',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        paranoid: true,
        deletedAt: 'deleted_at'
    }
);

export default ConsumptionModel;
