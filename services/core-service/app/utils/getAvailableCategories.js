import RoomModel from '../Models/RoomModel.js';
import RoomCategoryModel from '../Models/RoomCategoryModel.js';
import { checkReservationConflict } from './checkReservationConflict.js';
import { categoryStayTotal, countNights } from './calculateStayTotal.js';

/**
 * Calcula disponibilidade por CATEGORIA para o motor de reserva direta.
 *
 * No site público o hóspede escolhe uma categoria (Standard, Suíte...), não um quarto.
 * Para cada categoria do tenant, conta quantos quartos estão livres no período
 * (sem conflito de reserva e fora de manutenção) e devolve preço total da estadia.
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.checkIn   — YYYY-MM-DD
 * @param {string} params.checkOut  — YYYY-MM-DD
 * @param {number} [params.guests=1]
 * @returns {Promise<{ nights: number, categories: Array }>}
 */
export async function getAvailableCategories({ tenantId, checkIn, checkOut, guests = 1 }) {
    const nights = countNights(checkIn, checkOut);

    const rooms = await RoomModel.findAll({
        where: { tenant_id: tenantId },
        include: [{ model: RoomCategoryModel, as: 'category' }]
    });

    // Agrega quartos livres por categoria.
    const byCategory = new Map();

    for (const room of rooms) {
        // Quartos em manutenção não são ofertados online.
        if (room.status === 'MAINTENANCE') continue;
        if (!room.category) continue;

        const conflict = await checkReservationConflict(room.id, checkIn, checkOut, null, tenantId);
        if (conflict) continue;

        const cat = room.category;
        if (!byCategory.has(cat.id)) {
            byCategory.set(cat.id, {
                category_id: cat.id,
                name: cat.name,
                capacity: cat.capacity,
                price_per_night: Number(cat.price_per_night),
                available_rooms: 0
            });
        }
        byCategory.get(cat.id).available_rooms += 1;
    }

    const categories = [...byCategory.values()]
        // Só oferta categorias que comportam o nº de hóspedes e têm quarto livre.
        .filter((c) => c.available_rooms > 0 && c.capacity >= guests)
        .map((c) => ({
            ...c,
            nights,
            // Mesmo cálculo da reserva (centavos); a resposta pública segue em número.
            total_price: Number(categoryStayTotal(c.price_per_night, nights))
        }))
        .sort((a, b) => a.price_per_night - b.price_per_night);

    return { nights, categories };
}
