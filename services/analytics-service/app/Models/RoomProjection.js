import { DataTypes } from 'sequelize';
import defineProjection from './defineProjection.js';

// Quarto (catálogo §4.3). `cleaning_since` é o `occurred_at` do evento que levou o quarto a CLEANING
// — o "em limpeza desde" do alerta, mais exato que o `updated_at` do core, que muda com qualquer
// edição do quarto. Nulo fora de CLEANING.
const RoomProjection = defineProjection('RoomProjection', 'proj_rooms', {
    category_id:    { type: DataTypes.UUID, allowNull: false },
    number:         { type: DataTypes.TEXT, allowNull: false },
    status:         { type: DataTypes.TEXT, allowNull: false },
    cleaning_since: { type: DataTypes.DATE, allowNull: true }
});

export default RoomProjection;
