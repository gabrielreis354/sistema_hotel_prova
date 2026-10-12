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
        },
        // Cópia da reserva-mãe, mantida pelo BANCO (triggers em database/applyDbConstraints.js):
        // é sobre ela que o EXCLUDE recusa o mesmo quarto em duas reservas sobrepostas — inclusive
        // quarto extra (P-1). Nunca escrever estes campos pela aplicação: o trigger os sobrescreve.
        check_in_date:  { type: DataTypes.DATEONLY, allowNull: true },
        check_out_date: { type: DataTypes.DATEONLY, allowNull: true },
        blocks_room:    { type: DataTypes.BOOLEAN,  allowNull: true }
    },
    {
        tableName: 'reservation_rooms',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
);

export default ReservationRoomModel;
