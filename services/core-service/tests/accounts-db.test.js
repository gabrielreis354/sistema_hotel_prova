import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';

// T-04.1, Bloco B — garantias de BANCO da comanda (MER 4.11 e 4.12, decisões D-3 a D-7).
//
// Tudo aqui é INSERT direto, contornando a aplicação de propósito: os 422 dos
// controllers chegam no Bloco C, e estes testes provam que a segunda barreira existe
// mesmo que um controller esqueça uma validação. Mesmo raciocínio do EXCLUDE
// anti-double-booking: a regra financeira não depende só do código.

const app = createApp();
let ctx;      // tenant principal
let outro;    // segundo tenant, para o CA-04.1.m

async function semear(nome) {
    const { jwt, tenantId, userId } = await registerAndLogin(app, { tenantName: nome });
    const cat = await createCategory(app, jwt);
    const quarto = await createRoom(app, jwt, cat.id, { number: '201' });
    const hospede = await createGuest(app, jwt);
    const estadia = await createReservation(app, jwt, hospede.id, quarto.id);
    // Mesma suíte, outra estadia — a RN-005 não pode travar o quarto entre estadias (D-3)
    const proxima = await createReservation(app, jwt, hospede.id, quarto.id, {
        check_in_date: '2027-04-01', check_out_date: '2027-04-03'
    });
    const [[produto]] = await sequelize.query(
        `INSERT INTO products (id, tenant_id, name, price, category, active, created_at, updated_at)
         VALUES (gen_random_uuid(), :tenantId, 'Cerveja 600ml', 18.50, 'DRINK', true, now(), now())
         RETURNING id`,
        { replacements: { tenantId } }
    );
    return { tenantId, userId, quartoId: quarto.id, hospedeId: hospede.id,
             estadiaId: estadia.id, proximaId: proxima.id, produtoId: produto.id };
}

beforeAll(async () => {
    await truncateAll();
    ctx = await semear('Hotel Comanda');
    outro = await semear('Hotel Vizinho');
});

// Conta ROOM válida por padrão; cada teste sobrescreve só o que quer quebrar.
async function inserirConta(over = {}, c = ctx) {
    const v = {
        id: randomUUID(), tenant_id: c.tenantId, type: 'ROOM', status: 'OPEN',
        reservation_id: c.estadiaId, room_id: c.quartoId, guest_id: c.hospedeId,
        label: 'Suíte 201', charges_lodging: false, deleted_at: null, ...over
    };
    await sequelize.query(
        `INSERT INTO accounts (id, tenant_id, type, status, reservation_id, room_id, guest_id,
                               label, charges_lodging, opened_at, deleted_at, created_at, updated_at)
         VALUES (:id, :tenant_id, :type, :status, :reservation_id, :room_id, :guest_id,
                 :label, :charges_lodging, now(), :deleted_at, now(), now())`,
        { replacements: v }
    );
    return v.id;
}

let contaBase;  // conta de apoio para os testes de item
async function inserirItem(over = {}, c = ctx) {
    const v = {
        id: randomUUID(), tenant_id: c.tenantId, account_id: contaBase, product_id: null,
        description: 'Água', quantity: 2, unit_price: 5.00, total: 10.00,
        billable: true, reason: null, client_item_id: null, created_by: c.userId,
        deleted_at: null, ...over
    };
    await sequelize.query(
        `INSERT INTO account_items (id, tenant_id, account_id, product_id, description, quantity,
                                    unit_price, total, billable, reason, client_item_id,
                                    created_by, deleted_at, created_at, updated_at)
         VALUES (:id, :tenant_id, :account_id, :product_id, :description, :quantity,
                 :unit_price, :total, :billable, :reason, :client_item_id,
                 :created_by, :deleted_at, now(), now())`,
        { replacements: v }
    );
    return v.id;
}

// Recusa pela constraint CERTA, não por qualquer erro. Um `rejects.toThrow()` genérico
// passava com a tabela ainda inexistente (RED que parecia verde) e passaria também se
// a recusa viesse de outra regra.
async function recusadoPor(promessa, constraint) {
    const erro = await promessa.then(() => null, (e) => e);
    expect(erro, `deveria ter sido recusado por ${constraint}`).not.toBeNull();
    expect((erro.parent ?? erro.original)?.constraint).toBe(constraint);
}

describe('accounts — regras por tipo no banco (D-4, D-5)', () => {
    it.each([
        'accounts_type_allowlist',
        'accounts_status_allowlist',
        'accounts_charges_lodging_room_only',
        'accounts_room_requires_stay',
        'accounts_reservation_only_room',
        'accounts_no_guest_table_internal'
    ])('CHECK %s existe', async (nome) => {
        const [rows] = await sequelize.query(
            `SELECT 1 FROM pg_constraint WHERE conrelid = 'accounts'::regclass AND conname = :nome`,
            { replacements: { nome } }
        );
        expect(rows).toHaveLength(1);
    });

    it('aceita uma conta válida de cada tipo', async () => {
        await inserirConta({ charges_lodging: true });
        await inserirConta({ type: 'DAY_USE', reservation_id: null, room_id: null, label: 'Piscina — Ana' });
        await inserirConta({ type: 'DAY_USE', reservation_id: null, room_id: null, guest_id: null, label: 'Piscina' });
        await inserirConta({ type: 'TABLE', reservation_id: null, room_id: null, guest_id: null, label: 'Mesa 5' });
        await inserirConta({ type: 'DIRECT', reservation_id: null, room_id: null, label: 'Balcão' });
        await inserirConta({ type: 'INTERNAL', reservation_id: null, room_id: null, guest_id: null, label: 'Cozinha' });
    });

    // Cada caso viola exatamente uma constraint — `avulsa` zera os vínculos para que
    // um tipo errado não seja recusado, antes, pela regra de reserva.
    const avulsa = { reservation_id: null, room_id: null, guest_id: null };
    it.each([
        ['type fora da allowlist', { ...avulsa, type: 'BAR' }, 'accounts_type_allowlist'],
        ['status fora da allowlist', { status: 'ABERTA' }, 'accounts_status_allowlist'],
        ['diária fora de ROOM (D-4)', { ...avulsa, type: 'TABLE', charges_lodging: true }, 'accounts_charges_lodging_room_only'],
        ['ROOM sem reserva', { reservation_id: null }, 'accounts_room_requires_stay'],
        ['ROOM sem quarto', { room_id: null }, 'accounts_room_requires_stay'],
        ['ROOM sem hóspede', { guest_id: null }, 'accounts_room_requires_stay'],
        ['DAY_USE com reserva', { type: 'DAY_USE' }, 'accounts_reservation_only_room'],
        ['DIRECT com reserva', { type: 'DIRECT' }, 'accounts_reservation_only_room'],
        ['TABLE com hóspede', { type: 'TABLE', reservation_id: null, room_id: null }, 'accounts_no_guest_table_internal'],
        ['INTERNAL com hóspede', { type: 'INTERNAL', reservation_id: null, room_id: null }, 'accounts_no_guest_table_internal'],
        ['INTERNAL com reserva', { type: 'INTERNAL', guest_id: null }, 'accounts_reservation_only_room']
    ])('recusa %s', async (_caso, over, constraint) => {
        await recusadoPor(inserirConta(over), constraint);
    });
});

describe('accounts — RN-005, uma diária por quarto da estadia (D-3, CA-04.1.k)', () => {
    beforeAll(async () => {
        // Isola do describe anterior, que já abriu uma conta cobrando diária
        await sequelize.query('DELETE FROM accounts WHERE tenant_id = :t', { replacements: { t: ctx.tenantId } });
    });

    it('o índice da RN-005 é parcial: só contas vivas cobrando diária disputam', async () => {
        const [rows] = await sequelize.query(
            `SELECT indexdef FROM pg_indexes WHERE tablename = 'accounts' AND indexname = 'accounts_lodging_unique'`
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].indexdef).toContain('UNIQUE');
        expect(rows[0].indexdef).toContain('charges_lodging');
        expect(rows[0].indexdef).toContain('deleted_at IS NULL');
    });

    it('segunda conta viva cobrando diária no mesmo quarto da mesma estadia é recusada', async () => {
        await inserirConta({ charges_lodging: true, label: 'Suíte 201 — João' });
        await recusadoPor(inserirConta({ charges_lodging: true, label: 'Suíte 201 — Maria' }), 'accounts_lodging_unique');
    });

    it('conta dividida na mesma suíte é aceita quando não cobra diária (RF-021)', async () => {
        await inserirConta({ charges_lodging: false, label: 'Suíte 201 — Maria' });
    });

    it('a próxima estadia na mesma suíte cobra a própria diária — o quarto não fica travado', async () => {
        await inserirConta({ reservation_id: ctx.proximaId, charges_lodging: true });
    });

    it('excluir a conta que cobrava libera outra para cobrar', async () => {
        await sequelize.query(
            `UPDATE accounts SET deleted_at = now()
             WHERE reservation_id = :r AND charges_lodging AND deleted_at IS NULL`,
            { replacements: { r: ctx.estadiaId } }
        );
        await inserirConta({ charges_lodging: true, label: 'Suíte 201 — João (reaberta)' });
    });
});

describe('account_items — valor, cortesia e idempotência (RN-007, RN-008, D-6)', () => {
    beforeAll(async () => {
        contaBase = await inserirConta({ type: 'TABLE', reservation_id: null, room_id: null, guest_id: null, label: 'Mesa 1' });
    });

    it.each([
        'account_items_quantity_positive',
        'account_items_unit_price_non_negative',
        'account_items_total_matches',
        'account_items_reason_allowlist',
        'account_items_reason_required'
    ])('CHECK %s existe', async (nome) => {
        const [rows] = await sequelize.query(
            `SELECT 1 FROM pg_constraint WHERE conrelid = 'account_items'::regclass AND conname = :nome`,
            { replacements: { nome } }
        );
        expect(rows).toHaveLength(1);
    });

    it('aceita item do catálogo e item avulso', async () => {
        await inserirItem({ product_id: ctx.produtoId, description: 'Cerveja 600ml', quantity: 3, unit_price: 18.50, total: 55.50 });
        await inserirItem();
    });

    it.each([
        ['quantidade zero', { quantity: 0, total: 0 }, 'account_items_quantity_positive'],
        ['preço negativo', { unit_price: -5, total: -10 }, 'account_items_unit_price_non_negative'],
        ['total diferente de quantidade × preço (CA-04.1.c)', { total: 9.99 }, 'account_items_total_matches'],
        ['reason fora da allowlist', { billable: false, reason: 'BRINDE' }, 'account_items_reason_allowlist'],
        ['item não faturável sem reason', { billable: false, reason: null }, 'account_items_reason_required']
    ])('recusa %s', async (_caso, over, constraint) => {
        await recusadoPor(inserirItem(over), constraint);
    });

    it('cortesia mantém preço e total gravados (RN-007)', async () => {
        const id = await inserirItem({ billable: false, reason: 'COURTESY', unit_price: 30, quantity: 1, total: 30 });
        const [[item]] = await sequelize.query('SELECT unit_price, total FROM account_items WHERE id = :id', { replacements: { id } });
        expect(Number(item.unit_price)).toBe(30);
        expect(Number(item.total)).toBe(30);
    });

    it('o índice de client_item_id é TOTAL — exceção documentada à regra dos paranoid (D-6)', async () => {
        const [rows] = await sequelize.query(
            `SELECT indexdef FROM pg_indexes
             WHERE tablename = 'account_items' AND indexname = 'account_items_client_item_tenant_unique'`
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].indexdef).toContain('UNIQUE');
        expect(rows[0].indexdef).not.toContain('deleted_at');
    });

    it('reenvio do mesmo client_item_id é recusado pelo banco (RN-008)', async () => {
        const clientItemId = randomUUID();
        await inserirItem({ client_item_id: clientItemId });
        await recusadoPor(inserirItem({ client_item_id: clientItemId }), 'account_items_client_item_tenant_unique');
    });

    it('reenvio depois de o item ser excluído continua recusado — senão a fila offline recobraria (D-6)', async () => {
        const clientItemId = randomUUID();
        const id = await inserirItem({ client_item_id: clientItemId });
        await sequelize.query(
            'UPDATE account_items SET deleted_at = now(), deleted_by = :u WHERE id = :id',
            { replacements: { id, u: ctx.userId } }
        );
        await recusadoPor(inserirItem({ client_item_id: clientItemId }), 'account_items_client_item_tenant_unique');
    });

    it('itens sem client_item_id não colidem entre si', async () => {
        await inserirItem({ client_item_id: null });
        await inserirItem({ client_item_id: null });
    });
});

describe('isolamento multi-tenant no banco (CA-04.1.m)', () => {
    it('o mesmo client_item_id em outro hotel não colide — a unicidade é por tenant', async () => {
        const clientItemId = randomUUID();
        await inserirItem({ client_item_id: clientItemId });

        const contaVizinha = await inserirConta(
            { type: 'DIRECT', reservation_id: null, room_id: null, guest_id: null, label: 'Balcão' }, outro
        );
        await inserirItem({ account_id: contaVizinha, client_item_id: clientItemId }, outro);
    });

    it.each(['accounts', 'account_items'])('%s.tenant_id é NOT NULL', async (tabela) => {
        const [[col]] = await sequelize.query(
            `SELECT is_nullable FROM information_schema.columns WHERE table_name = :t AND column_name = 'tenant_id'`,
            { replacements: { t: tabela } }
        );
        expect(col.is_nullable).toBe('NO');
    });

    // confdeltype: c = CASCADE, r = RESTRICT. Conferido no banco, não no model: o
    // belongsTo do Sequelize troca o onDelete de FK anulável para SET NULL se a
    // associação não repetir a regra — e SET NULL num FK de reserva apagaria o vínculo
    // da conta com a estadia em silêncio.
    it.each([
        ['accounts', 'tenant_id', 'c'],
        ['accounts', 'reservation_id', 'r'],
        ['accounts', 'room_id', 'r'],
        ['accounts', 'guest_id', 'r'],
        ['account_items', 'tenant_id', 'c'],
        ['account_items', 'account_id', 'c'],
        ['account_items', 'product_id', 'r'],
        ['account_items', 'created_by', 'r'],
        ['account_items', 'deleted_by', 'r']
    ])('FK %s.%s tem a ação de exclusão do MER', async (tabela, coluna, acao) => {
        const [rows] = await sequelize.query(
            `SELECT con.confdeltype
             FROM pg_constraint con
             JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
             WHERE con.contype = 'f' AND con.conrelid = (:t)::regclass AND a.attname = :c`,
            { replacements: { t: tabela, c: coluna } }
        );
        expect(rows.map(r => r.confdeltype)).toEqual([acao]);
    });
});
