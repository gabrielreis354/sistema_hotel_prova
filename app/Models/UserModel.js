import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const UserModel = sequelize.define(
    'UserModel',
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
        email: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        password_hash: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        role: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: 'RECEPTIONIST'
        }
    },
    {
        tableName: 'users',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        paranoid: true,
        deletedAt: 'deleted_at',
        indexes: [
            {
                unique: true,
                fields: ['email', 'tenant_id'],
                name: 'users_email_tenant_unique',
                // Índice PARCIAL. Sem o filtro, um usuário soft-deletado queimaria o
                // e-mail para sempre: a linha morta continua no índice, o guard da
                // aplicação não a enxerga (escopo paranoid) e quem barra é o Postgres,
                // virando 500. Só linhas vivas disputam unicidade.
                where: { deleted_at: null }
            }
        ]
    }
);

export default UserModel;
