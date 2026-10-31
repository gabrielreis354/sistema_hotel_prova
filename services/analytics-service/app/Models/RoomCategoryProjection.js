import { DataTypes } from 'sequelize';
import defineProjection from './defineProjection.js';

// Categoria de quarto (catálogo §4.2): agrupamento da receita por categoria e coluna `category`
// dos alertas de limpeza.
const RoomCategoryProjection = defineProjection('RoomCategoryProjection', 'proj_room_categories', {
    name: { type: DataTypes.TEXT, allowNull: false }
});

export default RoomCategoryProjection;
