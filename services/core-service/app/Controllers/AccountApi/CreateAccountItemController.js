import { UniqueConstraintError } from 'sequelize';
import sequelize from '../../../database/connections/sequelize.js';
import AccountModel from '../../Models/AccountModel.js';
import AccountItemModel from '../../Models/AccountItemModel.js';
import ProductModel from '../../Models/ProductModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import { ITEM_REASONS } from '../../utils/accountEnums.js';
import accountRuleViolation from '../../utils/accountRuleViolation.js';
import accountTotal from '../../utils/accountTotal.js';
import { parsePrice, MAX_PRICE } from '../../utils/productValidation.js';
import isUuid from '../../utils/isUuid.js';

// Índice único TOTAL de (tenant_id, client_item_id) — D-6, applyAccountConstraints.
const CLIENT_ITEM_INDEX = 'account_items_client_item_tenant_unique';

// Teto do total de um item: a coluna é DECIMAL(10,2). Em centavos.
const MAX_TOTAL_CENTS = Math.round(MAX_PRICE * 100);

// D-8 / CA-04.1.l: quem decide o que o hotel dá de graça. Os mesmos papéis lançam
// avulso (D-21): quem define o preço de um item define também se ele sai de graça.
const PRICE_SETTING_ROLES = ['ADMIN', 'RECEPTIONIST'];

// Teto operacional de quantidade por lançamento (D-20). Muito abaixo do INTEGER do banco,
// que estourava em 500; quantidade maior que isso num lançamento só é erro de digitação.
const MAX_QUANTITY = 9999;

const MAX_DESCRIPTION = 200;

// Dinheiro tem 2 casas. 3 casas eram arredondadas sem aviso ('1.999' × 3 virava 6.00).
const TWO_DECIMALS = /^\d+(\.\d{1,2})?$/;

const provided = (value) => value !== undefined && value !== null;

function validateInput(body) {
    const errors = [];

    if (provided(body.client_item_id) && !isUuid(body.client_item_id)) errors.push('client_item_id deve ser um UUID');
    if (provided(body.product_id) && !isUuid(body.product_id)) errors.push('product_id deve ser um UUID');

    // typeof number: '2' viraria 2 no Number(), mas o app manda número; texto é bug do cliente.
    if (provided(body.quantity) && !(Number.isInteger(body.quantity) && body.quantity > 0 && body.quantity <= MAX_QUANTITY)) {
        errors.push(`quantity deve ser um inteiro entre 1 e ${MAX_QUANTITY}`);
    }
    if (provided(body.billable) && typeof body.billable !== 'boolean') errors.push('billable deve ser booleano');
    if (provided(body.reason) && !ITEM_REASONS.includes(body.reason)) {
        errors.push(`reason deve ser um de: ${ITEM_REASONS.join(', ')}`);
    }

    // Com product_id, descrição e preço vêm do cardápio e o que o cliente mandou é ignorado.
    if (!provided(body.product_id)) {
        if (typeof body.description !== 'string' || !body.description.trim()) errors.push('description é obrigatório sem product_id');
        else if (body.description.trim().length > MAX_DESCRIPTION) errors.push(`description não pode passar de ${MAX_DESCRIPTION} caracteres`);
        if (!provided(body.unit_price)) {
            errors.push('unit_price é obrigatório sem product_id');
        } else {
            const price = parsePrice(body.unit_price);
            if (price === null) errors.push('unit_price deve ser um número (use ponto como separador decimal)');
            else if (price < 0) errors.push('unit_price não pode ser negativo');
            else if (price > MAX_PRICE) errors.push(`unit_price não pode exceder ${MAX_PRICE}`);
            else if (!TWO_DECIMALS.test(String(body.unit_price).trim())) errors.push('unit_price aceita no máximo 2 casas decimais');
        }
    }

    return errors;
}

// RN-007: cortesia tem motivo; item cobrado não tem — "cobrado por cortesia" é
// contraditório e confundiria o relatório de consumo interno (T-04.7).
function reasonRuleError(billable, reason) {
    if (!billable && !provided(reason)) return 'Item não faturável exige reason';
    if (billable && provided(reason)) return 'reason só se aplica a item não faturável (billable: false)';
    return null;
}

// Reenvio da fila offline (RN-008): devolve o item original, mesmo excluído (D-6),
// para a fila parar de reenviar. Vale o conteúdo original, não o do reenvio.
async function replay(existing, accountId, response) {
    if (existing.account_id !== accountId) {
        return response.status(409).json({ error: 'client_item_id já usado em outra conta' });
    }
    return response.status(200).json({ item: existing, account_total: await accountTotal(accountId, existing.tenant_id) });
}

const findByClientItemId = (tenantId, clientItemId) =>
    AccountItemModel.findOne({ where: { tenant_id: tenantId, client_item_id: clientItemId }, paranoid: false });

/**
 * POST /accounts/:id/items
 * Lança um item na conta. Responde 201 com o item e o total atualizado da conta
 * (CA-04.1.e), ou 200 com o item original quando é reenvio do mesmo client_item_id.
 */
export default async function CreateAccountItemController(request, response) {
    const tenantId = request.user.tenantId;
    const { id: accountId } = request.params;
    const body = request.body ?? {};

    try {
        const errors = validateInput(body);
        if (errors.length) return response.status(400).json({ errors });

        if (!isUuid(accountId)) return response.status(404).json({ error: 'Conta não encontrada' });
        const account = await AccountModel.findOne({ where: { id: accountId, tenant_id: tenantId } });
        if (!account) return response.status(404).json({ error: 'Conta não encontrada' });

        // Antes de checar papel e status: um item que já entrou continua aceito no reenvio,
        // mesmo que a conta tenha fechado depois (o garçom lançou offline antes do fechamento).
        if (provided(body.client_item_id)) {
            const existing = await findByClientItemId(tenantId, body.client_item_id);
            if (existing) return await replay(existing, account.id, response);
        }

        const billable = body.billable ?? true;
        if (!PRICE_SETTING_ROLES.includes(request.user.role) && (!billable || !provided(body.product_id))) {
            // Garçom: só item do cardápio e faturável. Avulso a preço 0 era cortesia sem
            // motivo, fora do relatório de cortesias (qa-redteam 19/10, D-21).
            return response.status(403).json({ error: 'Acesso não autorizado' });
        }

        const ruleError = reasonRuleError(billable, body.reason);
        if (ruleError) return response.status(422).json({ error: ruleError });

        let description;
        let priceCents;
        if (provided(body.product_id)) {
            const product = await ProductModel.findOne({ where: { id: body.product_id, tenant_id: tenantId } });
            if (!product) return response.status(404).json({ error: 'Produto não encontrado' });
            if (!product.active) return response.status(422).json({ error: 'Produto fora do cardápio (inativo)' });
            description = product.name;
            priceCents = Math.round(Number(product.price) * 100);
        } else {
            description = body.description.trim();
            priceCents = Math.round(parsePrice(body.unit_price) * 100);
        }

        // Em centavos (inteiros): 3 × 0,10 em float daria 0.30000000000000004.
        const quantity = body.quantity ?? 1;
        const totalCents = priceCents * quantity;
        if (totalCents > MAX_TOTAL_CENTS) {
            return response.status(400).json({ errors: [`total do item não pode exceder ${MAX_PRICE}`] });
        }

        let item;
        let total;
        const transaction = await sequelize.transaction();
        try {
            // Trava a conta: o fechamento (T-04.3) não pode acontecer no meio do lançamento.
            const locked = await AccountModel.findOne({
                where: { id: account.id, tenant_id: tenantId },
                lock: transaction.LOCK.UPDATE,
                transaction
            });
            if (locked.status !== 'OPEN') {
                await transaction.rollback();
                return response.status(422).json({ error: `Conta ${locked.status} não aceita item novo` });
            }

            // Conta da suíte só recebe consumo durante a estadia (D-22). O check-out já fecha
            // a conta (D-36); esta checagem cobre a conta aberta depois dele, por corrida.
            if (locked.type === 'ROOM') {
                const reservation = await ReservationModel.findOne({
                    where: { id: locked.reservation_id, tenant_id: tenantId },
                    transaction
                });
                if (reservation?.status !== 'CHECKED_IN') {
                    await transaction.rollback();
                    return response.status(422).json({ error: 'Estadia encerrada (check-out feito): a conta da suíte não aceita item novo' });
                }
            }

            item = await AccountItemModel.create({
                tenant_id: tenantId,
                account_id: account.id,
                product_id: body.product_id ?? null,
                description,
                quantity,
                unit_price: (priceCents / 100).toFixed(2),
                total: (totalCents / 100).toFixed(2),
                billable,
                reason: body.reason ?? null,
                client_item_id: body.client_item_id ?? null,
                created_by: request.user.userId
            }, { transaction });

            total = await accountTotal(account.id, tenantId, transaction);
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        // reload fora da transação (já encerrada): o create devolve os valores como
        // enviados e sem os defaults do banco; a resposta tem que ser igual à do GET.
        return response.status(201).json({ item: await item.reload(), account_total: total });
    } catch (error) {
        // Reenvio na corrida: a outra requisição gravou depois da busca acima.
        if (error instanceof UniqueConstraintError && error.parent?.constraint === CLIENT_ITEM_INDEX) {
            const existing = await findByClientItemId(tenantId, body.client_item_id);
            // Id da conta como o banco grava (minúsculo): o da URL pode vir em maiúsculas.
            if (existing) return await replay(existing, accountId.toLowerCase(), response);
        }
        const violation = accountRuleViolation(error, response);
        if (violation) return violation;
        console.error('CreateAccountItemController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
