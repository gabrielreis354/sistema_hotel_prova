import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const ReservationModel = sequelize.define(
    'ReservationModel',
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
        guest_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'guests', key: 'id' }
        },
        room_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'rooms', key: 'id' }
        },
        // Nullable: reservas vindas do motor de reserva direta (online) não têm
        // recepcionista associado. Reservas manuais continuam preenchendo este campo.
        user_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'users', key: 'id' }
        },
        check_in_date: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        check_out_date: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        status: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: 'PENDING'
        },
        total_amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0
        },
        // Origem da reserva: MANUAL (recepção) ou DIRECT (motor de reserva direta online).
        // Alimenta relatórios de canal e o futuro Channel Manager.
        source: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: 'MANUAL'
        }
    },
    {
        tableName: 'reservations',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        paranoid: true,
        deletedAt: 'deleted_at'
    }
);

export default ReservationModel;
