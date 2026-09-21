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
        },
        // Motor de reserva direta: liga/desliga a página pública de reservas do hotel.
        booking_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        // Percentual da reserva cobrado como sinal/depósito no PIX online.
        // Ex.: 30 = cobra 30% no ato; o restante é pago no check-in.
        deposit_percent: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 30,
            validate: { min: 0, max: 100 }
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
