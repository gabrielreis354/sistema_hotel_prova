import { Op } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';
import GuestModel from '../Models/GuestModel.js';
import { digitsOf } from './digitsOf.js';
import { isValidCpf } from './isValidCpf.js';
import { onlyDigits } from './onlyDigits.js';

/**
 * CPF do hóspede no balcão (SPEC-11, T-11.1, CA-11.c/d). O cadastro gravava qualquer texto
 * ("123", dígito errado), e o mesmo CPF com e sem máscara virava dois hóspedes, porque o índice
 * único compara o texto cru.
 *
 * Agora: CPF preenchido tem de ser válido (`isValidCpf`), é gravado só com dígitos, e o duplicado
 * é procurado pelos dígitos — o que acha também o hóspede antigo gravado com máscara. A migração
 * que normaliza os antigos ficou para o 5º semestre (parecer do Sirlande de 22/11, 🟢4).
 */
export const INVALID_CPF = 'CPF inválido';
export const DUPLICATE_CPF = 'CPF já cadastrado para outro hóspede';

/** Vazio (`''`, `null`) apaga o CPF: ele continua opcional. */
export function isBlankCpf(value) {
    return value === null || value === '';
}

/** Outro hóspede do hotel com os mesmos dígitos (com ou sem máscara no banco). */
export function findGuestByCpfDigits(tenantId, digits, { excludeId } = {}) {
    return GuestModel.findOne({
        where: {
            tenant_id: tenantId,
            ...(excludeId && { id: { [Op.ne]: excludeId } }),
            [Op.and]: [sequelize.where(digitsOf('cpf'), digits)],
        },
    });
}

/**
 * Valida o CPF novo e procura o duplicado. Devolve `{ digits }` para gravar ou
 * `{ status, error }` para responder.
 */
export async function checkNewCpf(tenantId, value, { excludeId } = {}) {
    if (!isValidCpf(value)) return { status: 400, error: INVALID_CPF };
    const digits = onlyDigits(value);
    if (await findGuestByCpfDigits(tenantId, digits, { excludeId })) return { status: 409, error: DUPLICATE_CPF };
    return { digits };
}

/**
 * No PUT só conta o CPF que MUDA, comparado pelos dígitos (parecer do Sirlande de 22/11, 🟡2):
 * a tela de edição reenvia o CPF sempre, e o hóspede antigo com CPF inválido precisa continuar
 * trocando o telefone.
 */
export function cpfChanged(value, stored) {
    const next = isBlankCpf(value) ? null : onlyDigits(value);
    return next !== onlyDigits(stored);
}
