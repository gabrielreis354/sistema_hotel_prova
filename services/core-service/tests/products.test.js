import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';

const app = createApp();

let jwt;            // ADMIN do tenant A
let waiterJwt;      // WAITER do tenant A
let otherJwt;       // ADMIN do tenant B — prova de isolamento
let productId;

beforeAll(async () => {
    await truncateAll();

    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Cardapio' }));
    ({ jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Hotel Vizinho' }));

    // Garçom do tenant A — precisa ler o cardápio, não escrever.
    const waiterEmail = `garcom_${Date.now()}@test.com`;
    await request(app)
        .post('/users')
        .set('Authorization', `Bearer ${jwt}`)
        .send({ name: 'Garçom', email: waiterEmail, password: 'senha123', role: 'WAITER' });

    const waiterLogin = await request(app)
        .post('/auth/login')
        .send({ email: waiterEmail, password: 'senha123' });
    waiterJwt = waiterLogin.body.token;

    const res = await request(app)
        .post('/products')
        .set('Authorization', `Bearer ${jwt}`)
        .send({ name: 'Cerveja 600ml', price: 12.0, category: 'DRINK' });
    productId = res.body.id;
});

describe('POST /products', () => {
    it('cria produto e retorna 201', async () => {
        const res = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'Porção de Batata', description: 'Serve 2', price: 35.5, category: 'FOOD' });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            name: 'Porção de Batata',
            price: '35.50',
            category: 'FOOD',
            active: true
        });
    });

    it('assume category OTHER e active true por padrão', async () => {
        const res = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'Item Sem Categoria', price: 10 });

        expect(res.status).toBe(201);
        expect(res.body.category).toBe('OTHER');
        expect(res.body.active).toBe(true);
    });

    it('retorna 400 sem name ou price', async () => {
        const res = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${jwt}`)
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual(
            expect.arrayContaining([
                expect.stringContaining('name'),
                expect.stringContaining('price')
            ])
        );
    });

    it('rejeita category fora da allowlist', async () => {
        const res = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'Produto Estranho', price: 10, category: 'SOBREMESA' });

        expect(res.status).toBe(400);
    });

    it('rejeita price negativo', async () => {
        const res = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'Produto Negativo', price: -5 });

        expect(res.status).toBe(400);
    });

    it('retorna 409 para nome duplicado no mesmo tenant', async () => {
        const res = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'Cerveja 600ml', price: 14 });

        expect(res.status).toBe(409);
    });

    it('permite o mesmo nome em tenant diferente', async () => {
        const res = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${otherJwt}`)
            .send({ name: 'Cerveja 600ml', price: 15, category: 'DRINK' });

        expect(res.status).toBe(201);
    });
});

describe('GET /products', () => {
    it('lista apenas produtos do tenant logado', async () => {
        const res = await request(app)
            .get('/products')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        // O "Cerveja 600ml" do Hotel Vizinho não pode aparecer aqui.
        expect(res.body.filter(p => p.name === 'Cerveja 600ml')).toHaveLength(1);
    });

    it('filtra por ?active=true', async () => {
        const criado = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'Item Inativo', price: 9, active: false });

        const res = await request(app)
            .get('/products?active=true')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(res.body.map(p => p.id)).not.toContain(criado.body.id);
    });

    it('filtra por ?active=false', async () => {
        const res = await request(app)
            .get('/products?active=false')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body.every(p => p.active === false)).toBe(true);
    });

    it('filtra por categoria', async () => {
        const res = await request(app)
            .get('/products?category=DRINK')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        // O length > 0 importa: sem ele, .every() é vacuamente verdadeiro numa
        // lista vazia e o teste passaria mesmo com o filtro quebrado.
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body.every(p => p.category === 'DRINK')).toBe(true);
    });

    it('rejeita categoria inválida no filtro', async () => {
        const res = await request(app)
            .get('/products?category=INEXISTENTE')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(400);
    });

    it('retorna produto por ID', async () => {
        const res = await request(app)
            .get(`/products/${productId}`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(productId);
    });

    it('retorna 404 para produto de outro tenant', async () => {
        const res = await request(app)
            .get(`/products/${productId}`)
            .set('Authorization', `Bearer ${otherJwt}`);

        expect(res.status).toBe(404);
    });
});

describe('PUT /products/:id', () => {
    it('atualiza produto e retorna 200', async () => {
        const res = await request(app)
            .put(`/products/${productId}`)
            .set('Authorization', `Bearer ${jwt}`)
            .send({ price: 13.5 });

        expect(res.status).toBe(200);
        expect(res.body.price).toBe('13.50');
    });

    it('desativa sem deletar quando active vira false', async () => {
        const criado = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'Produto A Desativar', price: 20 });

        const res = await request(app)
            .put(`/products/${criado.body.id}`)
            .set('Authorization', `Bearer ${jwt}`)
            .send({ active: false });

        expect(res.status).toBe(200);
        expect(res.body.active).toBe(false);

        // Continua acessível por ID — desativar não é deletar.
        const get = await request(app)
            .get(`/products/${criado.body.id}`)
            .set('Authorization', `Bearer ${jwt}`);
        expect(get.status).toBe(200);
    });

    it('retorna 409 ao renomear para um nome já usado', async () => {
        const res = await request(app)
            .put(`/products/${productId}`)
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'Porção de Batata' });

        expect(res.status).toBe(409);
    });

    it('retorna 404 para produto de outro tenant', async () => {
        const res = await request(app)
            .put(`/products/${productId}`)
            .set('Authorization', `Bearer ${otherJwt}`)
            .send({ price: 1 });

        expect(res.status).toBe(404);
    });
});

describe('RBAC do cardápio', () => {
    it('WAITER lê o cardápio', async () => {
        const res = await request(app)
            .get('/products?active=true')
            .set('Authorization', `Bearer ${waiterJwt}`);

        expect(res.status).toBe(200);
        // Só checar o 200 passaria com corpo vazio — que é o oposto do critério:
        // o garçom precisa ENXERGAR o cardápio para lançar consumo.
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0]).toHaveProperty('name');
        expect(res.body[0]).toHaveProperty('price');
    });

    it('WAITER não cria produto', async () => {
        const res = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${waiterJwt}`)
            .send({ name: 'Produto Do Garcom', price: 10 });

        expect(res.status).toBe(403);
    });

    it('WAITER não atualiza nem deleta produto', async () => {
        const put = await request(app)
            .put(`/products/${productId}`)
            .set('Authorization', `Bearer ${waiterJwt}`)
            .send({ price: 99 });
        expect(put.status).toBe(403);

        const del = await request(app)
            .delete(`/products/${productId}`)
            .set('Authorization', `Bearer ${waiterJwt}`);
        expect(del.status).toBe(403);
    });

    it('exige autenticação', async () => {
        const res = await request(app).get('/products');
        expect(res.status).toBe(401);
    });
});

describe('DELETE /products/:id', () => {
    it('remove produto (soft delete) e retorna 204', async () => {
        const criado = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'Produto Descartavel', price: 5 });

        const res = await request(app)
            .delete(`/products/${criado.body.id}`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(204);

        const get = await request(app)
            .get(`/products/${criado.body.id}`)
            .set('Authorization', `Bearer ${jwt}`);
        expect(get.status).toBe(404);
    });

    it('retorna 404 para ID inexistente', async () => {
        const res = await request(app)
            .delete('/products/00000000-0000-0000-0000-000000000000')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(404);
    });

    it('não deleta produto de outro tenant', async () => {
        const res = await request(app)
            .delete(`/products/${productId}`)
            .set('Authorization', `Bearer ${otherJwt}`);

        expect(res.status).toBe(404);

        // E o produto continua vivo no tenant dono.
        const get = await request(app)
            .get(`/products/${productId}`)
            .set('Authorization', `Bearer ${jwt}`);
        expect(get.status).toBe(200);
    });

    it('permite recriar um produto com o nome de um que foi deletado', async () => {
        // O unique (tenant_id, name) precisa ser PARCIAL. Sendo total, a linha
        // soft-deletada continua no índice e queima o nome para sempre — o guard
        // da aplicação não a enxerga e o Postgres devolve 500.
        const nome = 'Produto Reciclavel';

        const criado = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: nome, price: 10 });
        expect(criado.status).toBe(201);

        const del = await request(app)
            .delete(`/products/${criado.body.id}`)
            .set('Authorization', `Bearer ${jwt}`);
        expect(del.status).toBe(204);

        const recriado = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: nome, price: 11 });
        expect(recriado.status).toBe(201);
        expect(recriado.body.id).not.toBe(criado.body.id);
    });
});

describe('Validação de entrada', () => {
    it.each([
        ['string não numérica', 'abc'],
        ['vírgula decimal (formato BR)', '12,50'],
        ['objeto', { valor: 10 }],
        ['booleano', true],
        ['string vazia', ''],
        ['acima do DECIMAL(10,2)', 999999999999]
    ])('rejeita price inválido: %s → 400', async (_label, price) => {
        const res = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: `Preco Invalido ${Math.random()}`, price });

        expect(res.status).toBe(400);
    });

    it.each([
        ['objeto', { a: 1 }],
        ['array', [1, 2]],
        ['número', 42]
    ])('rejeita description inválida: %s → 400', async (_label, description) => {
        const res = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: `Desc Invalida ${Math.random()}`, price: 10, description });

        expect(res.status).toBe(400);
    });

    it.each([
        ['hexadecimal', '0x10'],
        ['notação científica', '1e3']
    ])('rejeita price em notação não decimal: %s → 400', async (_label, price) => {
        const res = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: `Notacao ${Math.random()}`, price });

        expect(res.status).toBe(400);
    });

    it('mensagem do PUT distingue vazio de ausente', async () => {
        const res = await request(app)
            .put(`/products/${productId}`)
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: '' });

        expect(res.status).toBe(400);
        expect(res.body.errors.join(' ')).toContain('não pode ser vazio');
    });

    it('rejeita active não booleano', async () => {
        const res = await request(app)
            .post('/products')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'Active Invalido', price: 10, active: 'sim' });

        expect(res.status).toBe(400);
    });

    it.each(['GET', 'PUT', 'DELETE'])('%s com :id não-UUID devolve 404, não 500', async (method) => {
        const req = request(app)[method.toLowerCase()]('/products/nao-e-uuid')
            .set('Authorization', `Bearer ${jwt}`);

        const res = method === 'PUT' ? await req.send({ price: 1 }) : await req;
        expect(res.status).toBe(404);
    });
});
