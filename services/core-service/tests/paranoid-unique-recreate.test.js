import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';

// Ciclo criar → deletar → RECRIAR COM O MESMO VALOR, para cada model paranoid com
// índice único.
//
// Antes do índice parcial, o terceiro passo devolvia 500 e o valor ficava queimado
// para sempre: a linha soft-deletada continuava disputando unicidade, o guard da
// aplicação não a enxergava (escopo paranoid) e quem barrava era o Postgres.
//
// Cada caso abaixo é um cenário real de recepção: o quarto 101 renumerado e
// recriado, o hóspede que voltou ao hotel, o funcionário readmitido.

const app = createApp();
let jwt;

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Ciclo' }));
});

const auth = (req) => req.set('Authorization', `Bearer ${jwt}`);

/**
 * Executa criar → deletar → recriar e devolve os três status.
 * @param {string} rota  ex.: '/rooms'
 * @param {object} corpo payload idêntico nas duas criações
 */
async function cicloCompleto(rota, corpo) {
    const criado = await auth(request(app).post(rota)).send(corpo);
    const removido = await auth(request(app).delete(`${rota}/${criado.body.id}`));
    const recriado = await auth(request(app).post(rota)).send(corpo);
    return { criado, removido, recriado };
}

describe('Model paranoid + índice único parcial — o valor não fica queimado', () => {
    it('categoria de quarto: nome reutilizável após exclusão', async () => {
        const { criado, removido, recriado } = await cicloCompleto('/room-categories', {
            name: 'Luxo Reciclado', description: 'x', capacity: 2, price_per_night: 300
        });

        expect(criado.status).toBe(201);
        expect(removido.status).toBe(204);
        expect(recriado.status).toBe(201);
        expect(recriado.body.id).not.toBe(criado.body.id);
    });

    it('quarto: número reutilizável após exclusão', async () => {
        const cat = await auth(request(app).post('/room-categories'))
            .send({ name: 'Para Quartos', description: 'x', capacity: 2, price_per_night: 100 });

        const { criado, removido, recriado } = await cicloCompleto('/rooms', {
            category_id: cat.body.id, number: '777', floor: 7, status: 'AVAILABLE'
        });

        expect(criado.status).toBe(201);
        expect(removido.status).toBe(204);
        expect(recriado.status).toBe(201);
    });

    it('hóspede: CPF reutilizável após exclusão (hóspede que volta ao hotel)', async () => {
        const { criado, removido, recriado } = await cicloCompleto('/guests', {
            full_name: 'Cliente Fiel', cpf: '39053344705', email: 'fiel@example.com'
        });

        expect(criado.status).toBe(201);
        expect(removido.status).toBe(204);
        expect(recriado.status).toBe(201);
    });

    it('usuário: e-mail reutilizável após exclusão (funcionário readmitido)', async () => {
        const { criado, removido, recriado } = await cicloCompleto('/users', {
            name: 'Recepcionista Readmitido', email: 'readmitido@example.com',
            password: 'senha123', role: 'RECEPTIONIST'
        });

        expect(criado.status).toBe(201);
        expect(removido.status).toBe(204);
        expect(recriado.status).toBe(201);
    });

    it('cliente corporativo: CNPJ reutilizável após exclusão', async () => {
        const { criado, removido, recriado } = await cicloCompleto('/corporate-clients', {
            razao_social: 'Empresa Recorrente LTDA', cnpj: '11222333000181'
        });

        expect(criado.status).toBe(201);
        expect(removido.status).toBe(204);
        expect(recriado.status).toBe(201);
    });
});

describe('Duplicata entre registros VIVOS continua sendo 409, não 500', () => {
    // O índice parcial não pode afrouxar a unicidade real. Estes casos garantem que
    // a correção não trocou "queima o nome" por "aceita duplicata".

    it('categoria com nome já em uso devolve 409', async () => {
        const corpo = { name: 'Nome Disputado', description: 'x', capacity: 2, price_per_night: 100 };
        const primeira = await auth(request(app).post('/room-categories')).send(corpo);
        const segunda = await auth(request(app).post('/room-categories')).send(corpo);

        expect(primeira.status).toBe(201);
        expect(segunda.status).toBe(409);
        expect(segunda.body.error).toBeTruthy();
    });

    it('quarto com número já em uso devolve 409', async () => {
        const cat = await auth(request(app).post('/room-categories'))
            .send({ name: 'Cat Duplicata', description: 'x', capacity: 2, price_per_night: 100 });
        const corpo = { category_id: cat.body.id, number: '888', floor: 8, status: 'AVAILABLE' };

        const primeira = await auth(request(app).post('/rooms')).send(corpo);
        const segunda = await auth(request(app).post('/rooms')).send(corpo);

        expect(primeira.status).toBe(201);
        expect(segunda.status).toBe(409);
    });

    it('usuário com e-mail já em uso devolve 409', async () => {
        const corpo = { name: 'Fulano', email: 'disputado@example.com', password: 'senha123', role: 'RECEPTIONIST' };
        const primeira = await auth(request(app).post('/users')).send(corpo);
        const segunda = await auth(request(app).post('/users')).send(corpo);

        expect(primeira.status).toBe(201);
        expect(segunda.status).toBe(409);
    });

    it('hóspede com CPF já em uso devolve 409', async () => {
        const corpo = { full_name: 'Hóspede A', cpf: '52998224725', email: 'a@example.com' };
        const primeira = await auth(request(app).post('/guests')).send(corpo);
        const segunda = await auth(request(app).post('/guests'))
            .send({ ...corpo, full_name: 'Hóspede B', email: 'b@example.com' });

        expect(primeira.status).toBe(201);
        expect(segunda.status).toBe(409);
    });

    it('a mensagem do 409 identifica o campo em conflito, não é genérica', async () => {
        // Prova que uniqueConstraintConflict resolve o nome do índice: uma tabela com
        // dois índices únicos (guests: cpf e email) precisa dizer QUAL deles bateu.
        await auth(request(app).post('/guests'))
            .send({ full_name: 'Dono do E-mail', cpf: '16899535009', email: 'dono@example.com' });

        // Sem CPF, então só o índice de e-mail pode ser violado. O guard de CPF do
        // controller não cobre e-mail: quem barra é o índice, direto no catch.
        const conflito = await auth(request(app).post('/guests'))
            .send({ full_name: 'Outro', email: 'dono@example.com' });

        expect(conflito.status).toBe(409);
        expect(conflito.body.error).toMatch(/mail/i);
    });
});
