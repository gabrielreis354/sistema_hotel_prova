import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';
import { PAYMENT_STATUSES } from '../utils/paymentEnums.js';

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
        // Reserva OU conta (CA-04.4.b, CHECK payments_reservation_or_account). Day-use, mesa e
        // balcão pagam a conta, sem reserva. Pagamento de conta da suíte grava as duas: a
        // reserva vem da conta (o servidor preenche) e o bill da reserva segue somando.
        reservation_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'reservations', key: 'id' }
        },
        // Conta paga (T-04.4). Nulo = pagamento da reserva, que entra na conta titular
        // (app/utils/accountPayments.js). RESTRICT: pagamento é registro financeiro.
        account_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'accounts', key: 'id' },
            onDelete: 'RESTRICT'
        },
        amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        method: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        // Ciclo de vida do pagamento: allowlist em app/utils/paymentEnums.js (CHECK
        // payments_status_allowlist no banco). Pagamentos manuais (recepção) já nascem
        // PAID; cobranças PIX online nascem PENDING e viram PAID quando o webhook confirma.
        // EXPIRED (cobrança PIX vencida) e FAILED (recusada pelo PSP) ficam reservados para
        // o provedor real. VOIDED é o estorno do lançamento (T-06.13): só PAID vira VOIDED,
        // pelo POST /payments/:id/void, e o pagamento fica no histórico.
        status: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: 'PAID',
            validate: { isIn: [PAYMENT_STATUSES] }
        },
        // Trilha do estorno (CA-06.13.b, e). Nulos em todo pagamento não anulado; os três
        // obrigatórios no VOIDED — CHECKs payments_voided_has_trail e payments_trail_only_voided.
        void_reason: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        voided_by: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'users', key: 'id' }
        },
        voided_at: {
            type: DataTypes.DATE,
            allowNull: true
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
        // Mesma regra do CHECK payments_paid_has_paid_at, antes do INSERT/UPDATE (reauditoria
        // delta, 🟢-3): o status nasce PAID por padrão e paid_at não tem default, então um
        // create manual sem data (migração, job, teste) falha aqui, com nome e mensagem.
        // Cobre create e save/update de instância; o UPDATE estático por where não carrega a
        // linha inteira — aí quem garante é o banco.
        validate: {
            paidHasPaidAt() {
                if (this.status === 'PAID' && (this.paid_at === null || this.paid_at === undefined)) {
                    throw new Error('payments_paid_has_paid_at: pagamento PAID exige paid_at');
                }
            }
        },
        tableName: 'payments',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        paranoid: true,
        deletedAt: 'deleted_at',
        indexes: [
            {
                // O webhook PIX (rota pública, sem tenant) acha o pagamento só por este id.
                // Único e GLOBAL: duplicado, o webhook confirmaria uma linha qualquer, até
                // de outro hotel. PARCIAL, como todo único de model paranoid. O índice de
                // verdade vem de applyDbConstraints (indicesParciais), que cura banco legado.
                unique: true,
                fields: ['provider_charge_id'],
                name: 'payments_provider_charge_id_unique',
                where: { deleted_at: null }
            }
        ],
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
