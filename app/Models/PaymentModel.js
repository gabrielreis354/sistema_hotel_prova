import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

const PaymentModel = sequelize.define(
    'PaymentModel',
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
        reservation_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'reservations', key: 'id' }
        },
        amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        method: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        // Ciclo de vida do pagamento. Pagamentos manuais (recepção) já nascem PAID;
        // cobranças PIX online nascem PENDING e viram PAID quando o webhook confirma.
        status: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: 'PAID'
        },
        // Natureza do valor: FULL (integral), DEPOSIT (sinal online) ou BALANCE (saldo no check-in).
        kind: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: 'FULL'
        },
        // Dados do provedor de pagamento (PSP). Nulos em pagamentos manuais.
        provider: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        provider_charge_id: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        // Payload PIX copia-e-cola (EMV) e validade da cobrança.
        pix_qr_code: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        pix_expiration: {
            type: DataTypes.DATE,
            allowNull: true
        },
        paid_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        }
    },
    {
        tableName: 'payments',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        paranoid: true,
        deletedAt: 'deleted_at'
    }
);

export default PaymentModel;
