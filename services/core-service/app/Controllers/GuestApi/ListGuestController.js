import { Op } from 'sequelize';
import sequelize from '../../../database/connections/sequelize.js';
import GuestModel from '../../Models/GuestModel.js';

// Busca da nova reserva (T-05.2, adianta a T-05.12): poucos resultados, nunca o cadastro.
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const MAX_Q_LENGTH = 100;
// Termo que parece documento ou telefone: dígitos com a pontuação das máscaras usuais.
const NUMERIC_TERM = /^[\d\s().+-]+$/;
const MIN_DIGITS = 3;

/** Escapa os curingas do LIKE (\ primeiro): o termo do usuário é sempre literal. */
function escapeLike(term) {
    return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function parseLimit(raw) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
    return Math.min(n, MAX_LIMIT);
}

/** Coluna só com os dígitos — CPF e telefone guardados com ou sem máscara. */
function digitsOf(column) {
    return sequelize.fn('regexp_replace', sequelize.col(column), '\\D', '', 'g');
}

/**
 * GET /guests
 * - Sem `q`: contrato antigo, todos os hóspedes do hotel (tela de hóspedes; a paginação dela
 *   fica para a T-05.12).
 * - Com `q`: busca no servidor por nome, CPF, e-mail ou telefone (ILIKE com escape), sempre
 *   por tenant_id, ordenada por nome, até `limit` (padrão 10, máximo 20). `q` vazio devolve
 *   lista vazia — nunca o cadastro inteiro.
 */
export default async function ListGuestController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { q } = request.query;

        if (q === undefined) {
            const guests = await GuestModel.findAll({ where: { tenant_id: tenantId } });
            return response.json(guests);
        }

        if (typeof q !== 'string') return response.status(400).json({ error: 'q deve ser um texto' });
        const term = q.trim();
        if (term.length > MAX_Q_LENGTH) {
            return response.status(400).json({ error: `q aceita no máximo ${MAX_Q_LENGTH} caracteres` });
        }
        if (!term) return response.json([]);

        const pattern = `%${escapeLike(term)}%`;
        const or = [
            { full_name: { [Op.iLike]: pattern } },
            { cpf: { [Op.iLike]: pattern } },
            { email: { [Op.iLike]: pattern } },
            { phone: { [Op.iLike]: pattern } }
        ];

        // "12345678900" acha o CPF guardado como "123.456.789-00", e vice-versa.
        const digits = term.replace(/\D/g, '');
        if (NUMERIC_TERM.test(term) && digits.length >= MIN_DIGITS) {
            const digitsPattern = `%${digits}%`;
            or.push(sequelize.where(digitsOf('cpf'), { [Op.like]: digitsPattern }));
            or.push(sequelize.where(digitsOf('phone'), { [Op.like]: digitsPattern }));
        }

        const guests = await GuestModel.findAll({
            where: { tenant_id: tenantId, [Op.or]: or },
            order: [['full_name', 'ASC']],
            limit: parseLimit(request.query.limit)
        });
        return response.json(guests);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
