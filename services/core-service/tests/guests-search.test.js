/**
 * GET /guests?q=&limit= — busca de hóspede no servidor (T-05.12 adiantada na T-05.2).
 *
 * A nova reserva procura o hóspede por nome, CPF, e-mail ou telefone. Antes desta rota, a tela
 * baixava o cadastro inteiro do hotel para filtrar no navegador (princípio 7, LGPD art. 6º, III).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createGuest } from './helpers/factories.js';

const app = createApp();
let jwtA;
let jwtB;

const search = (jwt, query) => request(app).get('/guests').query(query).set('Authorization', `Bearer ${jwt}`);

beforeAll(async () => {
    await truncateAll();
    ({ jwt: jwtA } = await registerAndLogin(app, { tenantName: 'Hotel Busca A' }));
    ({ jwt: jwtB } = await registerAndLogin(app, { tenantName: 'Hotel Busca B' }));

    await createGuest(app, jwtA, { full_name: 'Ana Souza', cpf: '123.456.789-00', email: 'ana@a.test', phone: '(11) 98888-1111' });
    await createGuest(app, jwtA, { full_name: 'Bruno Lima', cpf: '22233344455', email: 'bruno@a.test', phone: '11977772222' });
    // Nomes com os curingas do LIKE: % e _ precisam ser literais na busca.
    await createGuest(app, jwtA, { full_name: 'Desconto 100% Silva', email: 'pct@a.test' });
    await createGuest(app, jwtA, { full_name: 'Joao_Underscore', email: 'under@a.test' });
    await createGuest(app, jwtA, { full_name: 'JoaoXUnderscore', email: 'x@a.test' });
    for (let i = 1; i <= 25; i++) {
        await createGuest(app, jwtA, { full_name: `Massa Hospede ${String(i).padStart(2, '0')}`, email: `massa${i}@a.test` });
    }

    // Outro hotel, com hóspede que casaria com os mesmos termos.
    await createGuest(app, jwtB, { full_name: 'Ana Souza do Hotel B', cpf: '12345678900', email: 'ana@b.test' });
});

describe('GET /guests?q= — busca no servidor', () => {
    it('acha por parte do nome, sem distinguir maiúscula', async () => {
        const res = await search(jwtA, { q: 'ana sou' });
        expect(res.status).toBe(200);
        expect(res.body.map((g) => g.full_name)).toEqual(['Ana Souza']);
    });

    it('acha por e-mail', async () => {
        const res = await search(jwtA, { q: 'bruno@a' });
        expect(res.body.map((g) => g.full_name)).toEqual(['Bruno Lima']);
    });

    it('acha por CPF e telefone digitados com ou sem máscara', async () => {
        expect((await search(jwtA, { q: '123.456' })).body.map((g) => g.full_name)).toEqual(['Ana Souza']);
        expect((await search(jwtA, { q: '22233344455' })).body.map((g) => g.full_name)).toEqual(['Bruno Lima']);
        // CPF guardado com máscara, digitado só com dígitos
        expect((await search(jwtA, { q: '12345678900' })).body.map((g) => g.full_name)).toEqual(['Ana Souza']);
        // telefone guardado com máscara, digitado só com dígitos
        expect((await search(jwtA, { q: '988881111' })).body.map((g) => g.full_name)).toEqual(['Ana Souza']);
    });

    it('nunca devolve hóspede de outro hotel (tenant_id)', async () => {
        const resA = await search(jwtA, { q: 'Ana Souza' });
        expect(resA.body.map((g) => g.full_name)).toEqual(['Ana Souza']);
        const resB = await search(jwtB, { q: 'Ana' });
        expect(resB.body.map((g) => g.full_name)).toEqual(['Ana Souza do Hotel B']);
        expect(resB.body.every((g) => g.email !== 'ana@a.test')).toBe(true);
    });

    it('% e _ são literais, não curingas', async () => {
        expect((await search(jwtA, { q: '100%' })).body.map((g) => g.full_name)).toEqual(['Desconto 100% Silva']);
        // Sem escape, '%' sozinho casaria com todo mundo.
        expect((await search(jwtA, { q: '%' })).body.map((g) => g.full_name)).toEqual(['Desconto 100% Silva']);
        // Sem escape, '_' casaria com qualquer caractere e traria JoaoXUnderscore.
        expect((await search(jwtA, { q: 'Joao_' })).body.map((g) => g.full_name)).toEqual(['Joao_Underscore']);
        // A barra invertida também é literal.
        expect((await search(jwtA, { q: '\\' })).body).toEqual([]);
    });

    it('limit padrão 10, máximo 20, ordenado por nome', async () => {
        const padrao = await search(jwtA, { q: 'Massa' });
        expect(padrao.body).toHaveLength(10);
        expect(padrao.body[0].full_name).toBe('Massa Hospede 01');

        expect((await search(jwtA, { q: 'Massa', limit: 5 })).body).toHaveLength(5);
        expect((await search(jwtA, { q: 'Massa', limit: 999 })).body).toHaveLength(20);
        expect((await search(jwtA, { q: 'Massa', limit: 0 })).body).toHaveLength(10);
        expect((await search(jwtA, { q: 'Massa', limit: 'abc' })).body).toHaveLength(10);
    });

    it('q vazio ou só espaços devolve lista vazia, nunca o cadastro inteiro', async () => {
        expect((await search(jwtA, { q: '' })).body).toEqual([]);
        expect((await search(jwtA, { q: '   ' })).body).toEqual([]);
    });

    it('sem q mantém o contrato antigo: todos os hóspedes do hotel', async () => {
        const res = await search(jwtA, {});
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(30);
    });

    it('q longo demais é 400', async () => {
        const res = await search(jwtA, { q: 'x'.repeat(101) });
        expect(res.status).toBe(400);
    });
});
