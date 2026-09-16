import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const EventQuoteModel = sequelize.define('EventQuote', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    corporate_client_id: { type: DataTypes.UUID, allowNull: false },
    check_in: { type: DataTypes.DATEONLY, allowNull: false },
    check_out: { type: DataTypes.DATEONLY, allowNull: false },
    pessoas: { type: DataTypes.INTEGER, allowNull: false },
    valor_diaria_com_refeicao: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    valor_diaria_sem_refeicao: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    inclui_refeicao: { type: DataTypes.BOOLEAN, defaultValue: false },
    inclui_roupa_cama: { type: DataTypes.BOOLEAN, defaultValue: false },
    desconto_pct: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    observacoes: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.ENUM('SENT', 'CONFIRMED', 'CANCELLED'), defaultValue: 'SENT' },
}, {
    tableName: 'event_quotes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
});

export default EventQuoteModel;
