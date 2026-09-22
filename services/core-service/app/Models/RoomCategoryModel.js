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
        deletedAt: 'deleted_at',
        indexes: [
            {
                unique: true,
                fields: ['tenant_id', 'name'],
                name: 'room_categories_name_tenant_unique',
                // Índice PARCIAL. Sem o filtro, uma categoria soft-deletada queimaria o
                // nome para sempre: a linha morta continua no índice, o guard da
                // aplicação não a enxerga (escopo paranoid) e quem barra é o Postgres,
                // virando 500. Só linhas vivas disputam unicidade.
                where: { deleted_at: null }
            }
        ]
    }
);

export default RoomCategoryModel;
