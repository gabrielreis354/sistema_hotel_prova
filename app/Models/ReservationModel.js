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
            allowNull: true,
            references: { model: 'guests', key: 'id' }
        },
        room_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'rooms', key: 'id' }
        },
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
