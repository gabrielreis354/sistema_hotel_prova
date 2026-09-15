import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const ContractModel = sequelize.define('Contract', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    corporate_client_id: { type: DataTypes.UUID, allowNull: false },
    quote_id: { type: DataTypes.UUID, allowNull: true },
    objeto: { type: DataTypes.TEXT, allowNull: false },
    check_in: { type: DataTypes.DATEONLY, allowNull: false },
    check_out: { type: DataTypes.DATEONLY, allowNull: false },
    pessoas: { type: DataTypes.INTEGER, allowNull: false },
    total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    testemunha_1: { type: DataTypes.STRING, allowNull: false },
    testemunha_2: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.ENUM('GENERATED', 'SIGNED', 'CANCELLED'), defaultValue: 'GENERATED' },
    pdf_url: { type: DataTypes.TEXT, allowNull: true },
    // Reserva-bloco criada ao assinar o contrato (ver SignContractController) — garante
    // que os quartos do evento fiquem indisponíveis para venda avulsa no período.
    reservation_id: { type: DataTypes.UUID, allowNull: true },
}, {
    tableName: 'contracts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
});

export default ContractModel;
