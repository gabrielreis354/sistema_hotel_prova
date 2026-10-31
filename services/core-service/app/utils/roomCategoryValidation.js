import { parsePrice, MAX_PRICE } from './productValidation.js';
import { parseInteger } from './roomRules.js';

// Dinheiro tem 2 casas: '10.999' seria arredondado pelo banco sem aviso.
const TWO_DECIMALS = /^\d+(\.\d{1,2})?$/;

const MAX_NAME = 100;

/**
 * Valida os campos da categoria de quarto (R-5 do qa-redteam de 21/10). `partial: true` no
 * update — só valida o que veio. Devolve `{ field, message }` por falha; vazio é entrada válida.
 *
 * A diária é o que a reserva cobra (calculateStayTotal): negativa ou zero deixava o quarto
 * impossível de reservar, e texto ou estouro de DECIMAL(10,2) chegavam ao banco como 500.
 */
export function validateRoomCategoryFields({ name, capacity, price_per_night }, { partial = false } = {}) {
    const issues = [];
    const fail = (field, message) => issues.push({ field, message });

    if (!partial || name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) fail('name', partial ? 'name não pode ser vazio' : 'name obrigatório');
        else if (name.trim().length > MAX_NAME) fail('name', `name não pode passar de ${MAX_NAME} caracteres`);
    }

    if (!partial || price_per_night !== undefined) {
        const price = parsePrice(price_per_night);
        if (price_per_night === undefined || price_per_night === null || price_per_night === '') fail('price_per_night', 'price_per_night obrigatório');
        else if (price === null) fail('price_per_night', 'price_per_night deve ser um número (use ponto como separador decimal)');
        else if (price <= 0) fail('price_per_night', 'price_per_night deve ser maior que zero');
        else if (price > MAX_PRICE) fail('price_per_night', `price_per_night não pode exceder ${MAX_PRICE}`);
        else if (!TWO_DECIMALS.test(String(price_per_night).trim())) fail('price_per_night', 'price_per_night aceita no máximo 2 casas decimais');
    }

    // No cadastro, capacidade ausente vale 1 (default da coluna); no update, só o que veio.
    const capacityGiven = partial ? capacity !== undefined : capacity !== undefined && capacity !== null;
    if (capacityGiven) {
        const n = parseInteger(capacity);
        if (n === null || n < 1) fail('capacity', 'capacity deve ser um número inteiro maior ou igual a 1');
    }

    return issues;
}
