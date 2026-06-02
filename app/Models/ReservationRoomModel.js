import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const ReservationRoomModel = sequelize.define(
    'ReservationRoomModel',
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        reservation_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'reservations', key: 'id' },
            onDelete: 'CASCADE'
        },
        room_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'rooms', key: 'id' },
            onDelete: 'CASCADE'
        }
    },
    {
        tableName: 'reservation_rooms',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
);

export default ReservationRoomModel;
