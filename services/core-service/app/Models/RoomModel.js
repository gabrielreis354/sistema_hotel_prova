import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const RoomModel = sequelize.define(
    'RoomModel',
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
        category_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'room_categories', key: 'id' }
        },
        number: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        floor: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        status: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: 'AVAILABLE'
        }
    },
    {
        tableName: 'rooms',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        paranoid: true,
        deletedAt: 'deleted_at',
        indexes: [
            {
                unique: true,
                fields: ['tenant_id', 'number'],
                name: 'rooms_number_tenant_unique'
            }
        ]
    }
);

export default RoomModel;
