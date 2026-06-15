import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const RoomCategoryModel = sequelize.define(
    'RoomCategoryModel',
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
        capacity: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        price_per_night: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0
        }
    },
    {
        tableName: 'room_categories',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        paranoid: true,
        deletedAt: 'deleted_at'
    }
);

export default RoomCategoryModel;
