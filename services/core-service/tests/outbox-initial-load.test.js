import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import sequelize from '../database/connections/sequelize.js';
import enqueueInitialLoad from '../database/outboxInitialLoad.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';

// T-01.4 / H.2 — carga inicial das projeções do analytics (CA-01.4.j), catálogo de eventos v1.0 §6:
// o retrato atual de cada registro vai para o outbox, pelo mesmo caminho do fluxo normal.

const app = createApp();
let jwt;
let tenantId;
let ids;

const auth = () => ({ Authorization: `Bearer ${jwt}` });
const select = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
const limparOutbox = () => sequelize.query('DELETE FROM outbox');
const eventosDe = (aggregateId) =>
    select('SELECT id, type, version, tenant_id, payload FROM outbox WHERE aggregate_id = :aggregateId ORDER BY id', { aggregateId });

beforeAll(async () => {
    await truncateAll();
    ({ jwt, tenantId } = await registerAndLogin(app, { tenantName: 'Hotel Carga Inicial' }));
    const categoria = await createCategory(app, jwt, { name: 'Luxo Carga', price_per_night: 250 });
    const quarto = await createRoom(app, jwt, categoria.id, { number: '901' });
    const hospede = await createGuest(app, jwt, { full_name: 'Ana Carga', cpf: null, phone: '11999990000' });
    const excluido = await createGuest(app, jwt, { full_name: 'Bruno Excluído' });
    const reserva = await createReservation(app, jwt, hospede.id, quarto.id);
    const pagamento = await request(app).post('/payments').set(auth())
        .send({ reservation_id: reserva.id, amount: 300, method: 'PIX' });
    expect(pagamento.status).toBe(201);
    expect((await request(app).delete(`/guests/${excluido.id}`).set(auth())).status).toBe(204);
    ids = { categoria: categoria.id, quarto: quarto.id, hospede: hospede.id, excluido: excluido.id, reserva: reserva.id, pagamento: pagamento.body.id };
});

describe('Carga inicial do outbox (CA-01.4.j, catálogo §6)', () => {
    it('grava um evento por registro existente, com o payload do catálogo (o mesmo dos triggers)', async () => {
        await limparOutbox();
        const resultado = await enqueueInitialLoad(sequelize);

        expect(resultado).toEqual({ tenants: 1, room_categories: 1, rooms: 1, guests: 2, reservations: 1, payments: 1 });

        const [tenant] = await eventosDe(tenantId);
        expect(tenant).toMatchObject({ type: 'tenant.updated', version: 1, tenant_id: tenantId, payload: { status: 'ACTIVE' } });

        const [categoria] = await eventosDe(ids.categoria);
        expect(categoria).toMatchObject({ type: 'room_category.updated', tenant_id: tenantId, payload: { name: 'Luxo Carga' } });

        const [quarto] = await eventosDe(ids.quarto);
        expect(quarto.type).toBe('room.updated');
        expect(quarto.payload).toEqual({ category_id: ids.categoria, number: '901', status: 'AVAILABLE' });

        // Minimização (§4.4): só o nome — telefone, e-mail e CPF não viajam.
        const [hospede] = await eventosDe(ids.hospede);
        expect(hospede.type).toBe('guest.updated');
        expect(hospede.payload).toEqual({ full_name: 'Ana Carga' });

        const [reserva] = await eventosDe(ids.reserva);
        expect(reserva.type).toBe('reservation.updated');
        expect(Object.keys(reserva.payload).sort()).toEqual(
            ['check_in_date', 'check_out_date', 'created_at', 'guest_id', 'room_id', 'status', 'total_amount']);
        expect(reserva.payload).toMatchObject({ guest_id: ids.hospede, room_id: ids.quarto, check_in_date: '2027-03-01', check_out_date: '2027-03-05' });
        expect(reserva.payload.total_amount).toMatch(/^\d+\.\d{2}$/);   // dinheiro como string (§2)

        const [pagamento] = await eventosDe(ids.pagamento);
        expect(pagamento.type).toBe('payment.updated');
        expect(pagamento.payload).toMatchObject({ reservation_id: ids.reserva, amount: '300.00', method: 'PIX', status: 'PAID' });
    });

    it('registro com exclusão lógica sai como *.deleted, com o retrato (reservas antigas ainda apontam para ele)', async () => {
        const [excluido] = await eventosDe(ids.excluido);
        expect(excluido.type).toBe('guest.deleted');
        expect(excluido.payload).toEqual({ full_name: 'Bruno Excluído' });
    });

    it('rodar de novo grava o mesmo retrato com aggregate_version maior — o consumidor aplica sem mudar nada (§5.2)', async () => {
        const antes = await select('SELECT aggregate_id, id, payload FROM outbox ORDER BY id');
        await enqueueInitialLoad(sequelize);
        const depois = await select('SELECT aggregate_id, id, payload FROM outbox ORDER BY id');

        expect(depois).toHaveLength(antes.length * 2);
        for (const evento of antes) {
            const novo = depois.find((e) => e.aggregate_id === evento.aggregate_id && e.id !== evento.id);
            expect(Number(novo.id)).toBeGreaterThan(Number(evento.id));
            expect(novo.payload).toEqual(evento.payload);
        }
    });

    it('não gera evento de tabela fora do catálogo nem dispara os triggers de domínio', async () => {
        await limparOutbox();
        await enqueueInitialLoad(sequelize);
        const tipos = await select(`SELECT DISTINCT split_part(type, '.', 1) AS agregado FROM outbox ORDER BY 1`);
        expect(tipos.map((t) => t.agregado)).toEqual(['guest', 'payment', 'reservation', 'room', 'room_category', 'tenant']);
        const [{ total }] = await select('SELECT count(*)::int AS total FROM outbox');
        expect(total).toBe(7);   // um por registro: nenhum evento extra de trigger
    });

    it('ordem por agregado (§6): escrita não confirmada durante a carga sai ANTES, e a carga leva o retrato novo', async () => {
        await limparOutbox();
        const escrita = await sequelize.transaction();
        await sequelize.query(`UPDATE rooms SET number = '902' WHERE id = :id`, { replacements: { id: ids.quarto }, transaction: escrita });

        const carga = enqueueInitialLoad(sequelize);
        await new Promise((resolve) => setTimeout(resolve, 300));   // a carga chega ao LOCK de rooms e espera
        await escrita.commit();
        await carga;

        const eventos = await eventosDe(ids.quarto);
        expect(eventos.map((e) => e.payload.number)).toEqual(['902', '902']);   // o da escrita, depois o da carga
        expect(eventos.map((e) => e.type)).toEqual(['room.updated', 'room.updated']);
        // Sem o lock, a carga leria o retrato antigo ('901') e gravaria com número MAIOR: o
        // consumidor ficaria com o número velho e descartaria o novo como versão antiga.
    });
});
