import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

/**
 * Toda projeção tem as mesmas colunas de controle (catálogo de eventos v1.0 §5.2):
 *
 * - `id`: o `aggregate_id` do evento — o mesmo UUID do registro no core.
 * - `tenant_id`: do envelope. Toda consulta filtra por ele (CA-01.4.m).
 * - `aggregate_version`: o último aplicado. Evento com versão menor ou igual é descartado.
 * - `deleted_at`: marca de exclusão (`*.deleted`), com o `occurred_at` do evento. Não é remoção
 *   física: um `*.updated` atrasado não "ressuscita" o registro.
 *
 * Sem FK entre projeções de propósito: os eventos de agregados diferentes chegam em qualquer ordem
 * (a reserva pode chegar antes do hóspede), e a FK recusaria uma ordem que é legítima.
 */
export default function defineProjection(modelName, tableName, campos) {
    return sequelize.define(modelName, {
        id:                { type: DataTypes.UUID, primaryKey: true },
        tenant_id:         { type: DataTypes.UUID, allowNull: false },
        ...campos,
        aggregate_version: { type: DataTypes.BIGINT, allowNull: false },
        deleted_at:        { type: DataTypes.DATE, allowNull: true }
    }, {
        tableName,
        timestamps: false,
        indexes: [{ name: `${tableName}_tenant`, fields: ['tenant_id'] }]
    });
}
