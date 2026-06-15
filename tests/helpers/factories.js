import request from 'supertest';

export async function createCategory(app, jwt, overrides = {}) {
    const res = await request(app)
        .post('/room-categories')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
            name:            overrides.name            ?? 'Standard',
            description:     overrides.description     ?? 'Quarto padrão',
            capacity:        overrides.capacity        ?? 2,
            price_per_night: overrides.price_per_night ?? 200.00,
        });
    return res.body;
}

export async function createRoom(app, jwt, categoryId, overrides = {}) {
    const res = await request(app)
        .post('/rooms')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
            category_id: categoryId,
            number:      overrides.number  ?? '101',
            floor:       overrides.floor   ?? 1,
            status:      overrides.status  ?? 'AVAILABLE',
        });
    return res.body;
}

export async function createGuest(app, jwt, overrides = {}) {
    const suffix = Date.now();
    const res = await request(app)
        .post('/guests')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
            full_name: overrides.full_name ?? 'Hóspede Teste',
            cpf:       overrides.cpf       ?? null,
            email:     overrides.email     ?? `hospede_${suffix}@test.com`,
            phone:     overrides.phone     ?? null,
        });
    return res.body;
}

export async function createReservation(app, jwt, guestId, roomId, overrides = {}) {
    const res = await request(app)
        .post('/reservations')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
            guest_id:       guestId,
            room_id:        roomId,
            check_in_date:  overrides.check_in_date  ?? '2027-03-01',
            check_out_date: overrides.check_out_date ?? '2027-03-05',
        });
    return res.body;
}
