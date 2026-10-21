import { DataTypes } from 'sequelize';
import defineProjection from './defineProjection.js';

// Reserva (catálogo v1.0 §4.5 — o contrato aprovado; a ADR-007, se aceita, entra como evento v2 pela
// §7). Dinheiro em NUMERIC: o Sequelize devolve DECIMAL como string e nada aqui converte para float.
// `created_at` é o do core (alerta de pendente há mais de 48 h), não o da projeção.
const ReservationProjection = defineProjection('ReservationProjection', 'proj_reservations', {
    guest_id:       { type: DataTypes.UUID, allowNull: false },
    room_id:        { type: DataTypes.UUID, allowNull: false },
    status:         { type: DataTypes.TEXT, allowNull: false },
    check_in_date:  { type: DataTypes.DATEONLY, allowNull: false },
    check_out_date: { type: DataTypes.DATEONLY, allowNull: false },
    total_amount:   { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    created_at:     { type: DataTypes.DATE, allowNull: false }
});

export default ReservationProjection;
