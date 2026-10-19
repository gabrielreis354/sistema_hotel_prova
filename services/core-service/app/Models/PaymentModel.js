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
        // Ciclo de vida do pagamento (conjunto canônico): PENDING, PAID, EXPIRED, FAILED.
        // Pagamentos manuais (recepção) já nascem PAID; cobranças PIX online nascem PENDING
        // e viram PAID quando o webhook confirma. EXPIRED (cobrança PIX vencida) e FAILED
        // (recusada pelo PSP) ficam reservados para o provedor de pagamento real.
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
        deletedAt: 'deleted_at',
        // Defesa por MODEL, não por call site: pix_qr_code e provider_charge_id nunca
        // saem por padrão. provider_charge_id é a ÚNICA credencial que POST /webhooks/pix
        // exige (T-06.9) — qualquer consumidor de PaymentModel que "esquecer" o
        // `attributes` (como ListPaymentController e GetPaymentController esqueciam,
        // achado 🔴 reconfirmado em 3 auditorias qa-redteam) continua protegido.
        // Quem precisar dos campos de verdade (o próprio fluxo PIX, o futuro
        // RealPixProvider) usa PaymentModel.unscoped() ou .scope(null) explicitamente —
        // a exceção fica visível no código, não escondida atrás do padrão.
        defaultScope: {
            attributes: { exclude: ['pix_qr_code', 'provider', 'provider_charge_id'] }
        }
    }
);

export default PaymentModel;
