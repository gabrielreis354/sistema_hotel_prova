import { DataTypes, literal } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';
import { ITEM_REASONS, ITEM_ORIGINS } from '../utils/accountEnums.js';

// Linha de consumo lançada numa conta (MER 4.12). Substitui `consumptions` na T-04.2.
// Os CHECKs financeiros (total = quantity × unit_price, motivo obrigatório na
// cortesia) ficam em database/applyDbConstraints.js.
//
// Idempotência (RN-008, D-6): o índice único de (tenant_id, client_item_id) é TOTAL,
// de propósito, e por isso NÃO está em `indexes` abaixo — vive só em
// applyDbConstraints.js e db/schema.sql. Um item excluído precisa continuar barrando o
// reenvio do mesmo client_item_id, senão a fila offline do garçom recobraria o
// hóspede. É a única exceção à regra "model paranoid só tem índice único parcial",
// nomeada no teste "nenhum model paranoid ficou com índice único total".
const AccountItemModel = sequelize.define(
    'AccountItemModel',
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
        account_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'accounts', key: 'id' },
            onDelete: 'CASCADE'
        },
        // Nulo permite lançamento avulso, fora do cardápio
        product_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'products', key: 'id' },
            onDelete: 'RESTRICT'
        },
        // Copiada do produto quando product_id vem preenchido
        description: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        quantity: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        // Preço no momento do lançamento, não referência ao catálogo — o histórico
        // não muda se o preço do produto mudar depois.
        unit_price: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        // Sempre quantity × unit_price, calculado no servidor (CA-04.1.c).
        total: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        // false = não soma no total da conta, mas o valor fica gravado (RN-007)
        billable: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        // Obrigatório quando billable = false
        reason: {
            type: DataTypes.TEXT,
            allowNull: true,
            validate: {
                isIn: {
                    args: [ITEM_REASONS],
                    msg: `reason deve ser um de: ${ITEM_REASONS.join(', ')}`
                }
            }
        },
        // Gerado no dispositivo do garçom — idempotência da fila offline (RN-008)
        client_item_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        // Quem lançou — trilha de auditoria. Nulo só no consumo antigo migrado, que não
        // registrava autor (D-25); o CHECK account_items_created_by_required garante.
        created_by: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'users', key: 'id' },
            onDelete: 'RESTRICT'
        },
        origin: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: 'ACCOUNT',
            validate: {
                isIn: {
                    args: [ITEM_ORIGINS],
                    msg: `origin deve ser um de: ${ITEM_ORIGINS.join(', ')}`
                }
            }
        },
        // Quando o hóspede consumiu, que pode ser antes do lançamento chegar ao servidor
        // (fila offline do garçom) — created_at é quando o servidor gravou (D-26).
        // literal('now()') e não DataTypes.NOW: só o literal vira DEFAULT no banco, e é
        // ele que deixa o sync adicionar a coluna NOT NULL numa tabela que já tem linhas.
        consumed_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: literal('now()')
        },
        // Quem excluiu o lançamento (D-7) — trilha de auditoria financeira, como em
        // consumptions; a T-04.2 migra o deleted_by dos consumos para cá.
        deleted_by: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'users', key: 'id' },
            onDelete: 'RESTRICT'
        }
    },
    {
        tableName: 'account_items',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        paranoid: true,
        deletedAt: 'deleted_at'
    }
);

export default AccountItemModel;
