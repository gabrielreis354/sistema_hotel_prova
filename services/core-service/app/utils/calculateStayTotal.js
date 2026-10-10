import RoomModel from '../Models/RoomModel.js';
import RoomCategoryModel from '../Models/RoomCategoryModel.js';

/**
 * Total da estadia: para CADA quarto, preço da sua categoria × noites (P-4, rodada 3 — antes
 * só o quarto principal era cobrado). Única função de cálculo: criação e alteração de reserva
 * usam esta, e a SPEC-07 (tarifas por período) vai substituí-la pelo motor de cálculo da
 * estadia — num lugar só.
 *
 * Dinheiro em centavos inteiros, sem parseFloat: o DECIMAL chega do pg como string
 * ("33.33") e vira centavos por string; o total volta como string decimal ("99.99").
 *
 * @returns {Promise<{ total: string } | { error: { status: number, message: string } }>}
 */
export async function calculateStayTotal({ roomIds, checkInDate, checkOutDate, tenantId, transaction }) {
    const ids = [...new Set(roomIds)];
    // Reserva sem quarto não existe: lista vazia é defeito de quem chamou — nunca total 0,00.
    if (ids.length === 0) return { error: { status: 409, message: 'A reserva precisa ter ao menos um quarto' } };

    const nights = countNights(checkInDate, checkOutDate);
    if (!Number.isInteger(nights) || nights <= 0) {
        return { error: { status: 400, message: 'check_out_date deve ser posterior a check_in_date' } };
    }

    // paranoid: false — um quarto excluído do cadastro continua cobrável na reserva que o ocupa.
    const rooms = await RoomModel.findAll({
        where: { id: ids, tenant_id: tenantId },
        include: [{ model: RoomCategoryModel, as: 'category', attributes: ['price_per_night'], paranoid: false }],
        paranoid: false,
        transaction
    });
    if (rooms.length !== ids.length) {
        return { error: { status: 404, message: 'Quarto não encontrado' } };
    }

    let totalCents = 0;
    for (const room of rooms) {
        const cents = toCents(room.category?.price_per_night);
        if (!cents) {
            return { error: { status: 422, message: `Categoria do quarto ${room.number} não possui preço definido` } };
        }
        totalCents += cents * nights;
    }
    return { total: fromCents(totalCents) };
}

/** Noites entre duas datas YYYY-MM-DD; NaN se alguma for inválida. */
export function countNights(checkInDate, checkOutDate) {
    return Math.round((Date.parse(`${checkOutDate}T00:00:00Z`) - Date.parse(`${checkInDate}T00:00:00Z`)) / 86_400_000);
}

/** "150.00" | "33.3" | 100 → centavos inteiros; inválido ou ≤ 0 → 0. */
export function toCents(value) {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? '').trim());
    if (!match) return 0;
    return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export function fromCents(cents) {
    return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/** Total de uma categoria por N noites, em string decimal — para quem não tem quartos (motor público). */
export function categoryStayTotal(pricePerNight, nights) {
    return fromCents(toCents(pricePerNight) * nights);
}
