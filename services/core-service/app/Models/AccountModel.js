import { DataTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';
import { ACCOUNT_TYPES, ACCOUNT_STATUSES } from '../utils/accountEnums.js';

// Conta/comanda (MER 4.11) — onde o garçom e a recepção lançam consumo. Substitui o
// vínculo rígido "consumo pertence a uma reserva": day-use, mesa e consumo interno
// não têm reserva. As regras de quais vínculos cada `type` exige (D-5) e de quem
// cobra diária (D-4) são CHECKs em database/applyDbConstraints.js — o banco recusa
// mesmo que um controller esqueça de validar.
const AccountModel = sequelize.define(
    'AccountModel',
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'tenants', key: 'id' },
            onDelete: 'CASCADE'
        },
        type: {
            type: DataTypes.TEXT,
            allowNull: false,
            validate: {
                isIn: {
                    args: [ACCOUNT_TYPES],
                    msg: `type deve ser um de: ${ACCOUNT_TYPES.join(', ')}`
                }
            }
        },
        status: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: 'OPEN',
            validate: {
                isIn: {
                    args: [ACCOUNT_STATUSES],
                    msg: `status deve ser um de: ${ACCOUNT_STATUSES.join(', ')}`
                }
            }
        },
        // Nulo fora de ROOM — é o que viabiliza consumo sem hospedagem.
        // RESTRICT: a conta é registro financeiro, não pode sumir junto com a reserva.
        reservation_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'reservations', key: 'id' },
            onDelete: 'RESTRICT'
        },
        room_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'rooms', key: 'id' },
            onDelete: 'RESTRICT'
        },
        // Responsável pela conta. Nulo em mesa avulsa e conta interna.
        guest_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'guests', key: 'id' },
            onDelete: 'RESTRICT'
        },
        // Identificação operacional: "Suíte 201 — João", "Mesa 5", "Piscina — Ana"
        label: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        // Qual conta carrega a diária quando a suíte divide a conta (RN-005).
        // Fora de ROOM o servidor grava false (D-4); o CHECK do banco garante.
        charges_lodging: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        opened_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        closed_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // Diária apresentada no fechamento (D-39). Conta fechada não muda de valor depois
        // (D-23): nem se o preço da categoria ou o total da reserva mudarem. Nula na conta
        // aberta, que calcula na hora (CHECK em applyDbConstraints).
        closed_room_charges: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true
        }
    },
    {
        tableName: 'accounts',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        paranoid: true,
        deletedAt: 'deleted_at',
        indexes: [
            {
                // RN-005 no escopo da D-3: uma conta cobrando diária por quarto DA ESTADIA.
                // Ao pé da letra (uma por room_id) a conta da estadia anterior travaria o
                // quarto para o próximo hóspede. Parcial em deleted_at pelo mesmo motivo
                // dos demais models paranoid: conta excluída não disputa mais a diária.
                unique: true,
                fields: ['reservation_id', 'room_id'],
                name: 'accounts_lodging_unique',
                where: { charges_lodging: true, deleted_at: null }
            }
        ]
    }
);

export default AccountModel;
