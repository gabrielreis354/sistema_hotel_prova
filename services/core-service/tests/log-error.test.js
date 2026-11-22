import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import GuestModel from '../app/Models/GuestModel.js';
import { logError, safeError } from '../app/utils/logError.js';
import sequelize from '../database/connections/sequelize.js';

// SPEC-06, T-06.12 (CA-06.12.a a c): o erro do Sequelize carrega o `sql`, os `parameters`, os
// `errors[].value` e o `parent.detail` do INSERT que falhou. O `console.error(error)` dos
// controllers imprimia nome, CPF e e-mail do hóspede no stdout do container (LGPD art. 46 e
// art. 6º, III). O log de um 500 precisa do que falhou, não do dado da pessoa.

const CPF = '52998224725';
const NOME = 'Maria Sigilo';
const EMAIL = 'maria.sigilo@example.test';
const SENSIVEIS = [CPF, NOME, EMAIL, 'maria.sigilo'];

let tenantId;

beforeAll(async () => {
    await truncateAll();
    ({ tenantId } = await registerAndLogin(createApp(), { tenantName: 'Hotel Log' }));
});

afterEach(() => vi.restoreAllMocks());

/** O que foi para o console.error, como texto: é o que chega ao agregador de logs. */
function logged(label, error) {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError(label, error);
    expect(spy).toHaveBeenCalledTimes(1);
    return spy.mock.calls[0].map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
}

describe('logError — o erro sai sem o dado da pessoa (CA-06.12.a e c)', () => {
    it('conflito de unicidade (CPF repetido): sem CPF, nome nem e-mail; com rótulo, nome e constraint', async () => {
        await GuestModel.create({ tenant_id: tenantId, full_name: NOME, cpf: CPF, email: EMAIL });
        const error = await GuestModel.create({ tenant_id: tenantId, full_name: NOME, cpf: CPF, email: EMAIL }).catch((e) => e);
        // O erro de verdade carrega o dado: é isso que o console.error(error) imprimia.
        expect(JSON.stringify({ ...error, sql: error.sql, parameters: error.parameters })).toContain(CPF);

        const out = logged('CreateGuestController', error);
        for (const s of SENSIVEIS) expect(out).not.toContain(s);
        expect(out).toContain('CreateGuestController');
        expect(out).toContain('SequelizeUniqueConstraintError');
        expect(out).toMatch(/guests_(cpf|email)_tenant_unique/);
    });

    it('erro do banco no INSERT (tenant inválido): sem os parameters do INSERT', async () => {
        const error = await GuestModel.create({ tenant_id: '00000000-0000-4000-8000-000000000000', full_name: NOME, cpf: CPF, email: EMAIL }).catch((e) => e);
        const out = logged('CreateGuestController', error);
        for (const s of SENSIVEIS) expect(out).not.toContain(s);
        expect(out).toContain('SequelizeForeignKeyConstraintError');
        expect(out).toContain('23503'); // código do Postgres: o que o diagnóstico precisa
    });

    it('valor que não é Error vira só a mensagem', () => {
        expect(safeError('falhou')).toEqual({ message: 'falhou' });
    });

    it('Error comum mantém nome, mensagem e a pilha', () => {
        const out = safeError(new TypeError('x is not a function'));
        expect(out).toMatchObject({ name: 'TypeError', message: 'x is not a function' });
        expect(out.stack).toContain('TypeError');
    });
});

describe('controller que dá 500 não imprime o dado do hóspede', () => {
    it('PUT /guests/:id com falha no banco: o log não leva o CPF nem o e-mail enviados', async () => {
        const app = createApp();
        const { jwt } = await registerAndLogin(app, { tenantName: 'Hotel Log 500' });
        const id = (await request(app).post('/guests').set('Authorization', `Bearer ${jwt}`).send({ full_name: 'Ana' })).body.id;
        vi.spyOn(GuestModel.prototype, 'save').mockRejectedValue(
            Object.assign(new Error('falha simulada'), { name: 'SequelizeDatabaseError', sql: `UPDATE guests SET cpf='${CPF}'`, parameters: [CPF, EMAIL] }),
        );
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await request(app).put(`/guests/${id}`).set('Authorization', `Bearer ${jwt}`).send({ cpf: CPF, email: EMAIL });
        expect(res.status).toBe(500);
        const out = JSON.stringify(spy.mock.calls);
        expect(out).not.toContain(CPF);
        expect(out).not.toContain(EMAIL);
        expect(out).toContain('falha simulada');
    });
});

// qa-redteam de 22/11 (🟡-1 e 🟢-2): a `message` do erro de conversão de tipo do Postgres (classe 22)
// traz o valor enviado — `invalid input syntax for type uuid: "52998224725"` — e a pilha repete a
// mensagem na 1ª linha. O literal entre aspas sai como "…"; o código e o tipo ficam.
describe('logError — erro de conversão de tipo do Postgres (classe 22)', () => {
    it('22P02 (uuid): sem o CPF na mensagem nem na pilha, com o código e o tipo', async () => {
        const error = await GuestModel.findOne({ where: { id: CPF } }).catch((e) => e);
        expect(error.message).toContain(CPF); // o erro de verdade leva o valor
        const out = logged('CreateReservationController', error);
        expect(out).not.toContain(CPF);
        expect(out).toContain('22P02');
        expect(out).toContain('invalid input syntax for type uuid');
    });

    it('22007 (data): sem o nome do hóspede', async () => {
        const error = await sequelize.query('SELECT $1::date', { bind: [NOME] }).catch((e) => e);
        expect(error.message).toContain(NOME);
        const out = logged('X', error);
        expect(out).not.toContain(NOME);
        expect(out).toContain('22007');
    });

    it('causa encadeada (Error com cause) sai reduzida, sem o valor (🟢-1)', async () => {
        const root = await GuestModel.findOne({ where: { id: CPF } }).catch((e) => e);
        const out = safeError(new Error('falhou ao buscar o hóspede', { cause: root }));
        expect(out.cause).toMatchObject({ name: 'SequelizeDatabaseError', code: '22P02' });
        expect(JSON.stringify(out)).not.toContain(CPF);
    });

    it('POST /reservations com o CPF no guest_id: o log não leva o CPF', async () => {
        const app = createApp();
        const { jwt } = await registerAndLogin(app, { tenantName: 'Hotel Log 22' });
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await request(app).post('/reservations').set('Authorization', `Bearer ${jwt}`)
            .send({ guest_id: CPF, room_id: CPF, check_in_date: '2030-01-10', check_out_date: '2030-01-12' });
        expect(JSON.stringify(spy.mock.calls)).not.toContain(CPF);
    });
});

// qa-redteam de 22/11 (repasse): sem middleware de erro, o JSON malformado ia ao `finalhandler`
// do Express, que imprime a pilha do SyntaxError com um trecho do corpo (o dado do hóspede).
describe('JSON malformado: 400 em JSON, sem o corpo no log', () => {
    it('POST /guests com JSON inválido', async () => {
        const app = createApp();
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await request(app).post('/guests').set('Content-Type', 'application/json')
            .send(`{"cpf":"${CPF}","full_name": ${NOME}}`);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'JSON inválido' });
        expect(JSON.stringify(spy.mock.calls)).not.toContain('Maria');
    });

    it('rota pública também', async () => {
        const res = await request(createApp()).post('/public/qualquer/bookings').set('Content-Type', 'application/json')
            .send(`{"guest": {"cpf": ${CPF}`);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'JSON inválido' });
    });
});
