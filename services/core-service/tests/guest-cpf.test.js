import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';

// SPEC-11, T-11.1 (CA-11.c e CA-11.d): o balcão gravava qualquer texto como CPF ("123", dígito
// errado) e o mesmo CPF com e sem máscara virava dois hóspedes. Agora o CPF preenchido precisa
// ser válido, é gravado só com dígitos, e o duplicado é achado pelos dígitos.
// Parecer do Sirlande de 22/11 (🟡2): no PUT só valida quando o CPF MUDA — a tela de edição
// reenvia o CPF sempre, e o hóspede antigo com CPF inválido ainda troca o telefone.
// A migração de normalização (CA-11.e) fica para o 5º semestre, pelo mesmo parecer (🟢4).

const app = createApp();
let jwtA;
let jwtB;
let tenantA;

const post = (jwt, body) => request(app).post('/guests').set('Authorization', `Bearer ${jwt}`).send(body);
const put = (jwt, id, body) => request(app).put(`/guests/${id}`).set('Authorization', `Bearer ${jwt}`).send(body);
const get = (jwt, id) => request(app).get(`/guests/${id}`).set('Authorization', `Bearer ${jwt}`);

/** Hóspede gravado antes da regra (CPF cru), direto no banco: a API não grava mais assim. */
async function legado(fullName, cpf) {
    const [rows] = await sequelize.query(
        `INSERT INTO guests (id, tenant_id, full_name, cpf, created_at, updated_at)
         VALUES (gen_random_uuid(), :tenant, :name, :cpf, now(), now()) RETURNING id`,
        { replacements: { tenant: tenantA, name: fullName, cpf } },
    );
    return rows[0].id;
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt: jwtA, tenantId: tenantA } = await registerAndLogin(app, { tenantName: 'Hotel CPF A' }));
    ({ jwt: jwtB } = await registerAndLogin(app, { tenantName: 'Hotel CPF B' }));
});

describe('POST /guests — CPF (CA-11.c)', () => {
    it.each(['52998224724', '111.111.111-11', '123', 'CPF: 529.982.247-25', '5299822472'])(
        'CPF inválido %j → 400, sem gravar',
        async (cpf) => {
            const res = await post(jwtA, { full_name: 'Inválido', cpf });
            expect(res.status).toBe(400);
            const [rows] = await sequelize.query(`SELECT count(*)::int AS n FROM guests WHERE full_name = 'Inválido'`);
            expect(rows[0].n).toBe(0);
        },
    );

    it('CPF válido formatado → 201 e grava só os dígitos', async () => {
        const res = await post(jwtA, { full_name: 'Com Máscara', cpf: '529.982.247-25' });
        expect(res.status).toBe(201);
        expect(res.body.cpf).toBe('52998224725');
    });

    it('sem CPF, ou CPF vazio → 201 com cpf null (continua opcional)', async () => {
        expect((await post(jwtA, { full_name: 'Sem CPF' })).body.cpf).toBeNull();
        const vazio = await post(jwtA, { full_name: 'CPF Vazio', cpf: '' });
        expect(vazio.status).toBe(201);
        expect(vazio.body.cpf).toBeNull();
    });
});

describe('POST /guests — duplicado pelos dígitos (CA-11.d)', () => {
    it('o mesmo CPF sem máscara no mesmo hotel → 409', async () => {
        const res = await post(jwtA, { full_name: 'Duplicado', cpf: '52998224725' });
        expect(res.status).toBe(409);
    });

    it('CPF de hóspede antigo gravado com máscara → 409', async () => {
        await legado('Legado Mascarado', '168.995.350-09');
        const res = await post(jwtA, { full_name: 'Duplicado do Legado', cpf: '16899535009' });
        expect(res.status).toBe(409);
    });

    it('o mesmo CPF em outro hotel → 201 (unicidade é por tenant)', async () => {
        const res = await post(jwtB, { full_name: 'Outro Hotel', cpf: '529.982.247-25' });
        expect(res.status).toBe(201);
    });
});

describe('PUT /guests/:id — CPF', () => {
    it('trocar para CPF inválido → 400 e o hóspede fica como estava', async () => {
        const id = (await post(jwtA, { full_name: 'Troca Inválida', cpf: '39053344705' })).body.id;
        const res = await put(jwtA, id, { cpf: '39053344704' });
        expect(res.status).toBe(400);
        expect((await get(jwtA, id)).body.cpf).toBe('39053344705');
    });

    it('trocar para CPF válido formatado → grava só os dígitos', async () => {
        const id = (await post(jwtA, { full_name: 'Troca Válida' })).body.id;
        const res = await put(jwtA, id, { cpf: '111.444.777-35' });
        expect(res.status).toBe(200);
        expect(res.body.cpf).toBe('11144477735');
    });

    it('trocar para o CPF de outro hóspede do hotel, em outro formato → 409', async () => {
        const id = (await post(jwtA, { full_name: 'Quer CPF Alheio' })).body.id;
        const res = await put(jwtA, id, { cpf: '529.982.247-25' });
        expect(res.status).toBe(409);
        expect((await get(jwtA, id)).body.cpf).toBeNull();
    });

    it('hóspede antigo com CPF inválido troca o telefone reenviando o mesmo CPF → 200 (parecer 🟡2)', async () => {
        const id = await legado('Legado Inválido', '12345678901');
        const res = await put(jwtA, id, { cpf: '123.456.789-01', phone: '11955554444' });
        expect(res.status).toBe(200);
        expect(res.body.phone).toBe('11955554444');
    });

    it('reenviar o próprio CPF não acusa duplicado consigo mesmo', async () => {
        const id = (await post(jwtA, { full_name: 'Reenvia', cpf: '12345678909' })).body.id;
        const res = await put(jwtA, id, { full_name: 'Reenvia Renomeado', cpf: '123.456.789-09' });
        expect(res.status).toBe(200);
        expect(res.body.cpf).toBe('12345678909');
    });

    it('apagar o CPF (vazio) → 200 com cpf null', async () => {
        const id = (await post(jwtA, { full_name: 'Apaga CPF', cpf: '935.411.347-80' })).body.id;
        const res = await put(jwtA, id, { cpf: '' });
        expect(res.status).toBe(200);
        expect(res.body.cpf).toBeNull();
    });
});
