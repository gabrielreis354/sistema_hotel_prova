import { PRODUCT_CATEGORIES } from './productCategories.js';

// DECIMAL(10,2) — acima disso o Postgres estoura e o erro vira 500.
const MAX_PRICE = 99999999.99;

/**
 * Converte o price recebido em número, ou null se não for um valor aceitável.
 *
 * Number() sozinho não serve: Number('') e Number([]) devolvem 0, e Number(true)
 * devolve 1 — todos passariam como preço válido. E '12,50', que é o que um
 * formulário brasileiro manda, vira NaN e chegaria ao banco como 500.
 */
export function parsePrice(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        // Só notação decimal. Delegar ao Number() sozinho aceitaria '0x10' como 16
        // e '1e3' como 1000 — preço de cardápio não tem hexadecimal nem notação
        // científica, e aceitar isso silenciosamente é pior que rejeitar.
        if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * Valida os campos de produto. `partial: true` no update — só valida o que veio.
 * Retorna array de mensagens; vazio significa entrada válida.
 */
export function validateProductFields({ name, description, price, category, active }, { partial = false } = {}) {
    const errors = [];

    if (!partial || name !== undefined) {
        if (typeof name !== 'string' || name.trim() === '') {
            // No update o campo é opcional — a falha é "veio vazio", não "faltou".
            errors.push(partial ? 'name não pode ser vazio' : 'name obrigatório');
        }
    }

    // description era o único campo sem checagem de tipo: objeto ou array chegavam
    // ao Postgres e viravam 500, e número era gravado convertido em string.
    if (description !== undefined && description !== null && typeof description !== 'string') {
        errors.push('description deve ser texto');
    }

    if (!partial || price !== undefined) {
        if (price === undefined || price === null) {
            errors.push('price obrigatório');
        } else {
            const parsed = parsePrice(price);
            if (parsed === null)          errors.push('price deve ser um número (use ponto como separador decimal)');
            else if (parsed < 0)          errors.push('price não pode ser negativo');
            else if (parsed > MAX_PRICE)  errors.push(`price não pode exceder ${MAX_PRICE}`);
        }
    }

    // Allowlist — categoria desconhecida é rejeitada (fail-safe).
    if (category !== undefined && !PRODUCT_CATEGORIES.includes(category)) {
        errors.push(`category deve ser uma de: ${PRODUCT_CATEGORIES.join(', ')}`);
    }

    if (active !== undefined && typeof active !== 'boolean') {
        errors.push('active deve ser booleano');
    }

    return errors;
}
