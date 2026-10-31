import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

// Primeira barreira de idempotência (catálogo §5.2): o `event_id` já processado. Gravado na MESMA
// transação da projeção — se a projeção desfaz, o registro some junto e o evento é reprocessado.
const ProcessedEventModel = sequelize.define('ProcessedEvent', {
    event_id:     { type: DataTypes.UUID, primaryKey: true },
    processed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
    tableName: 'processed_events',
    timestamps: false
});

export default ProcessedEventModel;
