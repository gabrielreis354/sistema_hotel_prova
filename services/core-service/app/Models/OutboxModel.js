import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';

/**
 * Outbox transacional (T-01.4, CA-01.4.a) — contrato no catálogo de eventos v1.0
 * (docs/specs/anexos/SPEC-01-catalogo-eventos.md §2 e §6).
 *
 * Cada linha é um evento de domínio. Quem grava é o BANCO, por trigger, na mesma transação da
 * alteração que o originou (database/applyDbConstraints.js, applyOutbox) — nenhum controller
 * escreve aqui. Quem lê é o publicador (app/services/outbox/publisher.js), que entrega ao
 * RabbitMQ e marca `published_at`.
 *
 * `id` (BIGSERIAL) é o `aggregate_version` do envelope: atribuído no INSERT, que o trigger faz
 * DEPOIS da escrita de domínio — é o que garante a ordem por agregado (§6).
 */
const OutboxModel = sequelize.define('Outbox', {
    id:           { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    event_id:     { type: DataTypes.UUID, allowNull: false, unique: true },
    type:         { type: DataTypes.TEXT, allowNull: false },
    version:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    tenant_id:    { type: DataTypes.UUID, allowNull: false },
    aggregate_id: { type: DataTypes.UUID, allowNull: false },
    payload:      { type: DataTypes.JSONB, allowNull: false },
    occurred_at:  { type: DataTypes.DATE, allowNull: false },
    published_at: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: 'outbox',
    timestamps: false,
    // O publicador só procura pendentes: índice parcial, que não cresce com o histórico publicado.
    indexes: [{ name: 'outbox_pendentes', fields: ['id'], where: { published_at: null } }]
});

export default OutboxModel;
