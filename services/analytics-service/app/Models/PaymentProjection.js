import { DataTypes } from 'sequelize';
import defineProjection from './defineProjection.js';

// Pagamento (catálogo §4.6). `reservation_id` é nulo no pagamento de conta sem reserva (day-use,
// mesa, balcão — T-04.4): o core grava assim desde a CA-04.4.b e o trigger publica o nulo.
// A projeção guarda todo status; as consultas da H.3 contam só PAID (decisões D-2 e D-3).
const PaymentProjection = defineProjection('PaymentProjection', 'proj_payments', {
    reservation_id: { type: DataTypes.UUID, allowNull: true },
    amount:         { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    method:         { type: DataTypes.TEXT, allowNull: false },
    status:         { type: DataTypes.TEXT, allowNull: false },
    paid_at:        { type: DataTypes.DATE, allowNull: true }
});

export default PaymentProjection;
