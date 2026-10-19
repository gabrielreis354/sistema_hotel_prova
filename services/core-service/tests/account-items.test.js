// T-04.1 Bloco D — lançar e excluir itens da conta (comanda).
// Idempotência da fila offline: RN-008 e D-6 (reenvio de item excluído → 200 com deleted_at).
// Cortesia: RN-007 e CA-04.1.i/l. Exclusão com auditoria: D-7 e D-8.
// Ver docs/specs/anexos/SPEC-04-decisoes-T-04.1.md.
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';
import AccountModel from '../app/Models/AccountModel.js';
import AccountItemModel from '../app/Models/AccountItemModel.js';

const app = createApp();

let jwt, waiterJwt, receptionistJwt, otherJwt;
let tenantId, adminUserId;
let beer;          // produto ativo: R$ 12,00
let retired;       // produto inativo
let otherProduct;  // produto do hotel B
let otherAccount;  // conta do hotel B

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const postItem = (token, accountId, body) =>
    request(app).post(`/accounts/${accountId}/items`).set(auth(token)).send(body);

const deleteItem = (token, accountId, itemId) =>
    request(app).delete(`/accounts/${accountId}/items/${itemId}`).set(auth(token));

async function openAccount(token = jwt, label = `Mesa ${randomUUID().slice(0, 4)}`) {
    const res = await request(app).post('/accounts').set(auth(token)).send({ type: 'TABLE', label });
    if (res.status !== 201) throw new Error(`abrir conta falhou: ${JSON.stringify(res.body)}`);
    return res.body;
}

async function createUser(role) {
    const email = `${role.toLowerCase()}_${Date.now()}@test.com`;
    await request(app).post('/users').set(auth(jwt))
        .send({ name: role, email, password: 'senha123', role });
    const login = await request(app).post('/auth/login').send({ email, password: 'senha123' });
    return login.body.token;
}

async function createProduct(token, body) {
    const res = await request(app).post('/products').set(auth(token)).send(body);
    if (res.status !== 201) throw new Error(`produto falhou: ${JSON.stringify(res.body)}`);
    return res.body;
}

// Muda o status direto no banco: fechar conta é a T-04.3, que ainda não existe.
const setStatus = (accountId, status) => AccountModel.update({ status }, { where: { id: accountId } });

beforeAll(async () => {
    await truncateAll();

    ({ jwt, tenantId, userId: adminUserId } = await registerAndLogin(app, { tenantName: 'Hotel Itens' }));
    ({ jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Hotel Vizinho Itens' }));
    waiterJwt = await createUser('WAITER');
    receptionistJwt = await createUser('RECEPTIONIST');

    beer = await createProduct(jwt, { name: 'Cerveja 600ml', price: 12, category: 'DRINK' });
    retired = await createProduct(jwt, { name: 'Suco antigo', price: 8, category: 'DRINK', active: false });
    otherProduct = await createProduct(otherJwt, { name: 'Cerveja do vizinho', price: 10 });
    otherAccount = await openAccount(otherJwt, 'Mesa do vizinho');
});

describe('POST /accounts/:id/items — lançamento', () => {
    it('CA-04.1.a/c: com product_id copia descrição e preço do cardápio e calcula o total', async () => {
        const account = await openAccount();
        const res = await postItem(jwt, account.id, {
            product_id: beer.id,
            quantity: 3,
            // ignorados: o cardápio e o servidor mandam no valor
            description: 'Cerveja grátis',
            unit_price: 0.01,
            total: 1
        });

        expect(res.status).toBe(201);
        expect(res.body.item).toMatchObject({
            account_id: account.id,
            product_id: beer.id,
            description: 'Cerveja 600ml',
            quantity: 3,
            unit_price: '12.00',
            total: '36.00',
            billable: true,
            reason: null,
            created_by: adminUserId,
            tenant_id: tenantId
        });
    });

    it('CA-04.1.e: devolve o total atualizado da conta', async () => {
        const account = await openAccount();
        await postItem(jwt, account.id, { product_id: beer.id, quantity: 1 });
        const res = await postItem(jwt, account.id, { description: 'Gelo', unit_price: 2.5, quantity: 2 });

        expect(res.status).toBe(201);
        expect(res.body.account_total).toBe('17.00');
    });

    it('CA-04.1.b: lançamento avulso exige description e unit_price', async () => {
        const account = await openAccount();
        const res = await postItem(jwt, account.id, { quantity: 1 });

        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual(expect.arrayContaining([
            expect.stringContaining('description'),
            expect.stringContaining('unit_price')
        ]));
    });

    it('lançamento avulso sem quantity assume 1', async () => {
        const account = await openAccount();
        const res = await postItem(jwt, account.id, { description: 'Taxa de rolha', unit_price: '30.00' });

        expect(res.status).toBe(201);
        expect(res.body.item).toMatchObject({ quantity: 1, total: '30.00', product_id: null });
    });

    it('calcula em centavos: 3 × 0,10 grava 0.30 exato', async () => {
        const account = await openAccount();
        const res = await postItem(jwt, account.id, { description: 'Bala', unit_price: 0.1, quantity: 3 });

        expect(res.status).toBe(201);
        expect(res.body.item.total).toBe('0.30');
    });

    it.each([
        ['quantity zero', { quantity: 0 }],
        ['quantity negativa', { quantity: -1 }],
        ['quantity fracionada', { quantity: 1.5 }],
        ['quantity em texto', { quantity: '2' }],
        ['preço negativo', { unit_price: -1 }],
        ['preço com vírgula', { unit_price: '12,50' }],
        ['total acima da coluna', { unit_price: 99999999.99, quantity: 2 }],
        ['product_id que não é UUID', { product_id: 'abc', description: undefined, unit_price: undefined }],
        ['client_item_id que não é UUID', { client_item_id: 'abc' }],
        ['billable que não é booleano', { billable: 'nao' }],
        ['reason fora da allowlist', { billable: false, reason: 'GIFT' }],
        // qa-redteam 19/10: acima do INTEGER do banco virava 500
        ['quantity acima do teto', { quantity: 10000 }],
        ['quantity acima do INTEGER', { unit_price: 0, quantity: 3000000000 }],
        // qa-redteam 19/10: 3 casas eram arredondadas sem aviso
        ['preço com 3 casas (texto)', { unit_price: '10.005' }],
        ['preço com 3 casas (número)', { unit_price: 1.999, quantity: 3 }],
        ['description acima de 200 caracteres', { description: 'x'.repeat(201) }]
    ])('%s → 400', async (_, override) => {
        const account = await openAccount();
        const res = await postItem(jwt, account.id, { description: 'Item', unit_price: 5, quantity: 1, ...override });

        expect(res.status).toBe(400);
    });

    it('produto inativo → 422', async () => {
        const account = await openAccount();
        const res = await postItem(jwt, account.id, { product_id: retired.id });

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/cardápio/i);
    });

    it('CA-04.1.g: conta CLOSED rejeita item novo → 422', async () => {
        const account = await openAccount();
        await setStatus(account.id, 'CLOSED');

        const res = await postItem(jwt, account.id, { product_id: beer.id });

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/CLOSED/);
    });

    it('conta PAID também rejeita → 422', async () => {
        const account = await openAccount();
        await setStatus(account.id, 'PAID');

        const res = await postItem(jwt, account.id, { product_id: beer.id });

        expect(res.status).toBe(422);
    });
});

describe('POST /accounts/:id/items — idempotência da fila offline (CA-04.1.d)', () => {
    it('reenvio do mesmo client_item_id devolve o item original com 200, sem duplicar', async () => {
        const account = await openAccount();
        const clientItemId = randomUUID();

        const first = await postItem(waiterJwt, account.id, { product_id: beer.id, quantity: 1, client_item_id: clientItemId });
        // O reenvio pode chegar com outro conteúdo (bug no app): vale o original.
        const again = await postItem(waiterJwt, account.id, { product_id: beer.id, quantity: 5, client_item_id: clientItemId });

        expect(first.status).toBe(201);
        expect(again.status).toBe(200);
        expect(again.body.item.id).toBe(first.body.item.id);
        expect(again.body.item.quantity).toBe(1);
        expect(again.body.account_total).toBe('12.00');

        const count = await AccountItemModel.count({ where: { account_id: account.id } });
        expect(count).toBe(1);
    });

    it('reenvio na corrida com o id da conta em maiúsculas → 200, não 409 (qa-redteam 19/10)', async () => {
        const account = await openAccount();
        const clientItemId = randomUUID();
        const first = await postItem(jwt, account.id, { product_id: beer.id, client_item_id: clientItemId });

        const spy = vi.spyOn(AccountItemModel, 'findOne').mockResolvedValueOnce(null);
        try {
            const res = await postItem(jwt, account.id.toUpperCase(), { product_id: beer.id, client_item_id: clientItemId });
            expect(res.status).toBe(200);
            expect(res.body.item.id).toBe(first.body.item.id);
        } finally {
            spy.mockRestore();
        }
    });

    it('reenvio na corrida: a busca não vê o item e o índice barra → 200 com o original', async () => {
        const account = await openAccount();
        const clientItemId = randomUUID();
        const first = await postItem(jwt, account.id, { product_id: beer.id, client_item_id: clientItemId });

        // Simula a corrida: a outra requisição gravou depois da busca do reenvio.
        const spy = vi.spyOn(AccountItemModel, 'findOne').mockResolvedValueOnce(null);
        try {
            const res = await postItem(jwt, account.id, { product_id: beer.id, client_item_id: clientItemId });
            expect(spy).toHaveBeenCalled();
            expect(res.status).toBe(200);
            expect(res.body.item.id).toBe(first.body.item.id);
        } finally {
            spy.mockRestore();
        }
    });

    it('D-6: reenvio de item já excluído → 200 com deleted_at, sem recriar', async () => {
        const account = await openAccount();
        const clientItemId = randomUUID();
        const first = await postItem(waiterJwt, account.id, { product_id: beer.id, client_item_id: clientItemId });
        expect((await deleteItem(jwt, account.id, first.body.item.id)).status).toBe(204);

        const res = await postItem(waiterJwt, account.id, { product_id: beer.id, client_item_id: clientItemId });

        expect(res.status).toBe(200);
        expect(res.body.item.id).toBe(first.body.item.id);
        expect(res.body.item.deleted_at).not.toBeNull();
        expect(res.body.account_total).toBe('0.00');
    });

    it('reenvio depois que a conta fechou → 200 (o item entrou antes do fechamento)', async () => {
        const account = await openAccount();
        const clientItemId = randomUUID();
        const first = await postItem(waiterJwt, account.id, { product_id: beer.id, client_item_id: clientItemId });
        await setStatus(account.id, 'CLOSED');

        const res = await postItem(waiterJwt, account.id, { product_id: beer.id, client_item_id: clientItemId });

        expect(res.status).toBe(200);
        expect(res.body.item.id).toBe(first.body.item.id);
    });

    it('mesmo client_item_id em outra conta do hotel → 409', async () => {
        const a = await openAccount();
        const b = await openAccount();
        const clientItemId = randomUUID();
        await postItem(jwt, a.id, { product_id: beer.id, client_item_id: clientItemId });

        const res = await postItem(jwt, b.id, { product_id: beer.id, client_item_id: clientItemId });

        expect(res.status).toBe(409);
    });

    it('mesmo client_item_id em outro hotel é independente', async () => {
        const account = await openAccount();
        const clientItemId = randomUUID();
        await postItem(jwt, account.id, { product_id: beer.id, client_item_id: clientItemId });

        const res = await postItem(otherJwt, otherAccount.id, { product_id: otherProduct.id, client_item_id: clientItemId });

        expect(res.status).toBe(201);
    });
});

describe('POST /accounts/:id/items — cortesia (RN-007)', () => {
    it('CA-04.1.i/j: recepção lança cortesia com motivo; valor gravado, fora da soma', async () => {
        const account = await openAccount();
        await postItem(jwt, account.id, { product_id: beer.id, quantity: 2 });

        const res = await postItem(receptionistJwt, account.id, {
            product_id: beer.id, quantity: 1, billable: false, reason: 'COURTESY'
        });

        expect(res.status).toBe(201);
        expect(res.body.item).toMatchObject({ billable: false, reason: 'COURTESY', total: '12.00' });
        expect(res.body.account_total).toBe('24.00');
    });

    it('CA-04.1.i: cortesia sem motivo → 422', async () => {
        const account = await openAccount();
        const res = await postItem(jwt, account.id, { product_id: beer.id, billable: false });

        expect(res.status).toBe(422);
        expect(res.body.error).toContain('reason');
    });

    it('motivo em item faturável → 422 (dado contraditório)', async () => {
        const account = await openAccount();
        const res = await postItem(jwt, account.id, { product_id: beer.id, reason: 'COURTESY' });

        expect(res.status).toBe(422);
        expect(res.body.error).toContain('reason');
    });

    it('CA-04.1.l: garçom não lança cortesia → 403', async () => {
        const account = await openAccount();
        const res = await postItem(waiterJwt, account.id, {
            product_id: beer.id, billable: false, reason: 'COURTESY'
        });

        expect(res.status).toBe(403);
    });
});

describe('Garçom só lança do cardápio (qa-redteam 19/10)', () => {
    it('lançamento avulso do garçom → 403: ele não define preço', async () => {
        const account = await openAccount(waiterJwt);
        const res = await postItem(waiterJwt, account.id, { description: 'Cerveja', unit_price: 0, quantity: 10 });

        expect(res.status).toBe(403);
    });

    it('recepção continua lançando avulso', async () => {
        const account = await openAccount();
        const res = await postItem(receptionistJwt, account.id, { description: 'Taxa de rolha', unit_price: 30 });

        expect(res.status).toBe(201);
    });
});

describe('Conta ROOM só recebe item durante a estadia (qa-redteam 19/10)', () => {
    let roomAccount, reservationId;

    beforeAll(async () => {
        const category = await createCategory(app, jwt, { name: 'Suíte Itens' });
        const room = await createRoom(app, jwt, category.id, { number: '501' });
        const guest = await createGuest(app, jwt, { email: `suite_itens_${Date.now()}@test.com` });
        const reservation = await createReservation(app, jwt, guest.id, room.id);
        reservationId = reservation.id;
        await request(app).put(`/reservations/${reservationId}/check-in`).set(auth(jwt));

        const res = await request(app).post('/accounts').set(auth(jwt)).send({
            type: 'ROOM', reservation_id: reservationId, room_id: room.id, guest_id: guest.id, label: 'Suíte 501'
        });
        roomAccount = res.body;
    });

    it('com check-in feito, lança', async () => {
        const res = await postItem(waiterJwt, roomAccount.id, { product_id: beer.id });
        expect(res.status).toBe(201);
    });

    it('depois do check-out → 422', async () => {
        const out = await request(app).put(`/reservations/${reservationId}/check-out`).set(auth(jwt));
        expect(out.status).toBe(200);

        const res = await postItem(waiterJwt, roomAccount.id, { product_id: beer.id });

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/check-out|estadia/i);
    });
});

describe('CA-04.1.n.1 — garçom lê o cardápio e lança na conta', () => {
    it('lista produtos ativos e lança um item faturável', async () => {
        const account = await openAccount(waiterJwt);
        const menu = await request(app).get('/products?active=true').set(auth(waiterJwt));
        expect(menu.status).toBe(200);

        const product = menu.body.find(p => p.id === beer.id);
        const res = await postItem(waiterJwt, account.id, { product_id: product.id, quantity: 2 });

        expect(res.status).toBe(201);
        expect(res.body.account_total).toBe('24.00');
    });
});

describe('Isolamento entre hotéis nos itens (CA-04.1.m)', () => {
    it('conta de outro hotel → 404', async () => {
        const res = await postItem(jwt, otherAccount.id, { product_id: beer.id });
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/conta/i);
    });

    it('produto de outro hotel → 404', async () => {
        const account = await openAccount();
        const res = await postItem(jwt, account.id, { product_id: otherProduct.id });
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/produto/i);
    });

    it('conta que não é UUID → 404', async () => {
        const res = await postItem(jwt, 'nao-e-uuid', { product_id: beer.id });
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/conta/i);
    });
});

describe('GET /accounts/:id — total (CA-04.1.j)', () => {
    it('soma só os itens faturáveis e não excluídos', async () => {
        const account = await openAccount();
        await postItem(jwt, account.id, { product_id: beer.id, quantity: 2 });                                   // 24
        await postItem(jwt, account.id, { product_id: beer.id, billable: false, reason: 'STAFF' });              // fora
        const removed = await postItem(jwt, account.id, { description: 'Engano', unit_price: 100 });            // excluído
        await deleteItem(jwt, account.id, removed.body.item.id);

        const res = await request(app).get(`/accounts/${account.id}`).set(auth(jwt));

        expect(res.status).toBe(200);
        expect(res.body.total).toBe('24.00');
        expect(res.body.items).toHaveLength(2);
    });

    it('conta sem itens tem total 0.00', async () => {
        const account = await openAccount();
        const res = await request(app).get(`/accounts/${account.id}`).set(auth(jwt));
        expect(res.body.total).toBe('0.00');
    });
});

describe('DELETE /accounts/:id/items/:itemId', () => {
    let account, item;

    beforeAll(async () => {
        account = await openAccount();
        item = (await postItem(jwt, account.id, { product_id: beer.id })).body.item;
    });

    it.each([['garçom', () => waiterJwt], ['recepção', () => receptionistJwt]])('%s não exclui → 403', async (_, token) => {
        const res = await deleteItem(token(), account.id, item.id);
        expect(res.status).toBe(403);
    });

    it('item de outra conta do hotel → 404', async () => {
        const other = await openAccount();
        const res = await deleteItem(jwt, other.id, item.id);
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/item/i);
    });

    it('item de outro hotel → 404', async () => {
        const res = await deleteItem(otherJwt, account.id, item.id);
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/não encontrad/i);
    });

    it('ADMIN exclui: soft delete com deleted_by (D-7)', async () => {
        const res = await deleteItem(jwt, account.id, item.id);
        expect(res.status).toBe(204);

        const row = await AccountItemModel.findByPk(item.id, { paranoid: false });
        expect(row.deleted_at).not.toBeNull();
        expect(row.deleted_by).toBe(adminUserId);
    });

    it('item já excluído → 404', async () => {
        const res = await deleteItem(jwt, account.id, item.id);
        expect(res.status).toBe(404);
    });

    it('conta CLOSED não perde item → 422', async () => {
        const closed = await openAccount();
        const closedItem = (await postItem(jwt, closed.id, { product_id: beer.id })).body.item;
        await setStatus(closed.id, 'CLOSED');

        const res = await deleteItem(jwt, closed.id, closedItem.id);

        expect(res.status).toBe(422);
        const row = await AccountItemModel.findByPk(closedItem.id);
        expect(row).not.toBeNull();
    });
});

describe('accountRuleViolation — constraints de account_items', () => {
    const fakeResponse = () => {
        const r = { statusCode: null, body: null };
        r.status = (code) => { r.statusCode = code; return r; };
        r.json = (body) => { r.body = body; return r; };
        return r;
    };

    it('total divergente gravado direto no banco vira 422', async () => {
        const accountRuleViolation = (await import('../app/utils/accountRuleViolation.js')).default;
        const account = await openAccount();
        const error = await AccountItemModel.create({
            tenant_id: tenantId, account_id: account.id, description: 'Burla',
            quantity: 2, unit_price: 10, total: 1, created_by: adminUserId
        }).catch(e => e);

        const res = fakeResponse();
        expect(accountRuleViolation(error, res)).toBe(res);
        expect(res.statusCode).toBe(422);
        expect(res.body.error).toMatch(/total/i);
    });
});
