import { Op, fn, col, where } from 'sequelize';
import RoomCategoryModel from '../Models/RoomCategoryModel.js';
import { ROOM_ERROR_CODES } from './roomErrors.js';

/**
 * Corpo do 409 quando já existe, no mesmo hotel, outra categoria viva com o mesmo nome sem
 * olhar a caixa ("Suíte Família" × "suíte FAMÍLIA"); `null` quando o nome está livre.
 *
 * QA de 24/11 (🟢-1): as duas conviviam, e o seletor do quarto mostrava duas opções quase
 * iguais com diárias diferentes. A checagem é na aplicação, e não num índice sobre lower(name),
 * de propósito: trocar o índice no schema.sql faria o `migrate` falhar num banco que já tem
 * nomes assim. O índice exato (room_categories_name_tenant_unique) continua barrando a corrida
 * da gravação idêntica; a corrida de duas caixas diferentes ao mesmo tempo fica aceita.
 *
 * @param {string} tenantId
 * @param {string} name já aparado
 * @param {string} [exceptId] a própria categoria, na edição: mudar só a caixa do nome vale
 * @returns {Promise<{ error: string, code: string } | null>}
 */
export async function categoryNameTaken(tenantId, name, exceptId) {
    const clash = await RoomCategoryModel.findOne({
        attributes: ['id'],
        where: {
            tenant_id: tenantId,
            ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}),
            [Op.and]: [where(fn('lower', col('name')), fn('lower', name))]
        }
    });
    if (!clash) return null;
    return { error: 'Já existe uma categoria com esse nome', code: ROOM_ERROR_CODES.CATEGORY_NAME_TAKEN };
}
