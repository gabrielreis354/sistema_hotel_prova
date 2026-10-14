import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { generateKeyPairSync, createHmac } from 'crypto';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { getPrivateKey, getPublicKey, getKeyId } from '../app/utils/jwtKeys.js';

const app = createApp();

beforeAll(async () => {
    await truncateAll();
});

describe('POST /auth/register', () => {
    it('cria tenant e usuário admin, retornando 201 sem expor senha', async () => {
        const res = await request(app).post('/auth/register').send({
            tenantName: 'Hotel Aurora',
            name: 'Admin Aurora',
            email: 'admin@aurora.com',
            password: 'senha123',
        });

        expect(res.status).toBe(201);
        expect(res.body.tenant).toMatchObject({ name: 'Hotel Aurora', subdomain: 'hotel-aurora' });
        expect(res.body.user).toMatchObject({ email: 'admin@aurora.com', role: 'ADMIN' });
        expect(res.body.user.password).toBeUndefined();
        expect(res.body.user.password_hash).toBeUndefined();
    });

    it('gera subdomain automaticamente a partir do nome do hotel', async () => {
        const res = await request(app).post('/auth/register').send({
            tenantName: 'Pousada São João',
            name: 'Admin',
            email: 'admin@pousada.com',
            password: 'senha123',
        });

        expect(res.status).toBe(201);
        expect(res.body.tenant.subdomain).toBe('pousada-sao-joao');
    });

    it('retorna 409 quando subdomain já está em uso', async () => {
        const res = await request(app).post('/auth/register').send({
            tenantName: 'Hotel Aurora',
            name: 'Outro Admin',
            email: 'outro@aurora.com',
            password: 'senha123',
        });

        expect(res.status).toBe(409);
    });

    it('retorna 400 quando campos obrigatórios estão ausentes', async () => {
        const res = await request(app).post('/auth/register').send({
            tenantName: 'Hotel X',
        });

        expect(res.status).toBe(400);
        expect(res.body.errors).toBeDefined();
    });
});

describe('POST /auth/login', () => {
    it('retorna JWT válido com credenciais corretas (sem subdomain)', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'admin@aurora.com',
            password: 'senha123',
        });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.token.split('.')).toHaveLength(3);
        expect(res.body.user).toMatchObject({ email: 'admin@aurora.com', role: 'ADMIN' });
    });

    it('retorna JWT válido com credenciais corretas e subdomain explícito', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'admin@aurora.com',
            password: 'senha123',
            subdomain: 'hotel-aurora',
        });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.token.split('.')).toHaveLength(3);
    });

    it('retorna 401 com senha incorreta', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'admin@aurora.com',
            password: 'senhaerrada',
        });

        expect(res.status).toBe(401);
    });

    it('retorna 401 com subdomain inexistente', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'admin@aurora.com',
            password: 'senha123',
            subdomain: 'hotel-fantasma',
        });

        expect(res.status).toBe(401);
    });

    it('retorna 401 com email inexistente', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'naoexiste@test.com',
            password: 'senha123',
        });

        expect(res.status).toBe(401);
    });

    it('retorna 400 sem campos obrigatórios', async () => {
        const res = await request(app).post('/auth/login').send({});
        expect(res.status).toBe(400);
    });
});

describe('POST /auth/login — colisão de e-mail multi-tenant', () => {
    // Cria dois tenants com o mesmo e-mail para validar o comportamento
    // de desambiguação via subdomain introduzido no fix de segurança.
    beforeAll(async () => {
        await request(app).post('/auth/register').send({
            tenantName: 'Hotel Alpha',
            name: 'Admin Alpha',
            email: 'shared@multihotel.com',
            password: 'senha123',
        });
        await request(app).post('/auth/register').send({
            tenantName: 'Hotel Beta',
            name: 'Admin Beta',
            email: 'shared@multihotel.com',
            password: 'senha123',
        });
    });

    it('retorna 409 quando e-mail existe em múltiplos tenants e subdomain não é informado', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'shared@multihotel.com',
            password: 'senha123',
        });

        expect(res.status).toBe(409);
        expect(res.body.requires).toBe('subdomain');
    });

    it('retorna 200 com subdomain correto desambiguando o tenant', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'shared@multihotel.com',
            password: 'senha123',
            subdomain: 'hotel-alpha',
        });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.token.split('.')).toHaveLength(3);
    });

    it('retorna JWT com tenantId do hotel correto ao usar subdomain', async () => {
        const resAlpha = await request(app).post('/auth/login').send({
            email: 'shared@multihotel.com',
            password: 'senha123',
            subdomain: 'hotel-alpha',
        });
        const resBeta = await request(app).post('/auth/login').send({
            email: 'shared@multihotel.com',
            password: 'senha123',
            subdomain: 'hotel-beta',
        });

        expect(resAlpha.status).toBe(200);
        expect(resBeta.status).toBe(200);

        // Os dois tokens devem ter tenantIds diferentes
        const payloadAlpha = JSON.parse(Buffer.from(resAlpha.body.token.split('.')[1], 'base64').toString());
        const payloadBeta  = JSON.parse(Buffer.from(resBeta.body.token.split('.')[1],  'base64').toString());
        expect(payloadAlpha.tenantId).not.toBe(payloadBeta.tenantId);
    });

    it('retorna 401 com subdomain inexistente mesmo com e-mail e senha corretos', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'shared@multihotel.com',
            password: 'senha123',
            subdomain: 'hotel-fantasma',
        });

        expect(res.status).toBe(401);
    });
});

describe('Proteção por authMiddleware', () => {
    it('retorna 401 ao acessar rota protegida sem token', async () => {
        const res = await request(app).get('/rooms');
        expect(res.status).toBe(401);
    });

    it('retorna 401 com token inválido', async () => {
        const res = await request(app)
            .get('/rooms')
            .set('Authorization', 'Bearer token.invalido.aqui');
        expect(res.status).toBe(401);
    });
});

describe('JWT em RS256 (ADR-006 / T-01.3)', () => {
    // Payload de referência — mesmo formato que LoginController.js assina.
    const payload = { userId: 'user-fake-id', role: 'ADMIN', tenantId: 'tenant-fake-id' };

    // Mensagem que SÓ o auth.middleware emite. Checar só o status 401 não basta: o
    // tenant.middleware também devolve 401 ("Tenant não encontrado") para um tenantId que
    // não existe — um teste de recusa poderia passar pela camada errada (achado ao testar
    // por mutação em 27/09: removendo a trava de algoritmo, os testes continuavam verdes).
    const RECUSA_DO_AUTH = 'Token inválido ou expirado';

    // Payload de um usuário REAL (tenant existe e está ativo): com ele, só a verificação do
    // token decide o resultado — sem a trava de algoritmo, a requisição chegaria em 200.
    let payloadReal;
    beforeAll(async () => {
        await request(app).post('/auth/register').send({
            tenantName: 'Hotel Payload Real', name: 'Admin', email: 'admin@payloadreal.com', password: 'senha123',
        });
        const login = await request(app).post('/auth/login').send({ email: 'admin@payloadreal.com', password: 'senha123' });
        const { userId, role, tenantId } = jwt.decode(login.body.token);
        payloadReal = { userId, role, tenantId };
    });

    it('o token emitido pelo login é RS256, com kid no cabeçalho', async () => {
        const reg = await request(app).post('/auth/register').send({
            tenantName: 'Hotel RS256', name: 'Admin RS256', email: 'admin@rs256.com', password: 'senha123',
        });
        const login = await request(app).post('/auth/login').send({ email: 'admin@rs256.com', password: 'senha123' });

        const header = JSON.parse(Buffer.from(login.body.token.split('.')[0], 'base64').toString());
        expect(header.alg).toBe('RS256');
        expect(header.kid).toBe(getKeyId());
        void reg;
    });

    it('guarda de regressão do vetor clássico: HS256 assinado com a chave PÚBLICA como segredo é recusado', async () => {
        // O ataque clássico contra RS256 (algorithm confusion): a chave pública não é secreta,
        // então o atacante a usa como segredo HMAC e declara `alg: HS256`. Montado à mão (sem
        // jwt.sign), para não depender de o jsonwebtoken aceitar esse uso na assinatura.
        // NÃO é o teste do pino `algorithms: ['RS256']`: o jsonwebtoken 9.x já recusa este
        // token sozinho (chave RSA só admite RS/PS). Ele fica como guarda caso a biblioteca
        // mude ou regrida. Quem prova o pino é o teste RS512/PS256 logo abaixo.
        const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
        const unsigned = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
        const signature = createHmac('sha256', getPublicKey()).update(unsigned).digest('base64url');

        const res = await request(app).get('/rooms').set('Authorization', `Bearer ${unsigned}.${signature}`);
        expect(res.status).toBe(401);
        expect(res.body.error).toBe(RECUSA_DO_AUTH);
    });

    it.each(['RS512', 'PS256'])(
        'rejeita token %s assinado com a chave privada CORRETA — só RS256 é aceito',
        async (algorithm) => {
            // Este é o teste que prova o `algorithms: ['RS256']` do middleware. Sem a trava,
            // o jsonwebtoken 9.x deriva a lista do tipo da chave (RSA → RS256/384/512 e
            // PS256/384/512) e aceitaria este token: a assinatura é válida. Não é
            // falsificação (exige a privada), mas o contrato é um algoritmo só — e o
            // verificador não pode depender do default da biblioteca.
            const token = jwt.sign(payloadReal, getPrivateKey(), { algorithm });

            const res = await request(app).get('/rooms').set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(401);
            expect(res.body.error).toBe(RECUSA_DO_AUTH);
        }
    );

    it('controle positivo: o MESMO payload real, em RS256, passa — a recusa acima é pelo algoritmo', async () => {
        const token = jwt.sign(payloadReal, getPrivateKey(), { algorithm: 'RS256', keyid: getKeyId() });

        const res = await request(app).get('/rooms').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
    });

    it('rejeita token RS256 assinado com uma chave privada diferente da do core', async () => {
        const { privateKey: chaveErrada } = generateKeyPairSync('rsa', { modulusLength: 2048 });
        const forjado = jwt.sign(payload, chaveErrada, { algorithm: 'RS256' });

        const res = await request(app).get('/rooms').set('Authorization', `Bearer ${forjado}`);
        expect(res.status).toBe(401);
        expect(res.body.error).toBe(RECUSA_DO_AUTH);
    });

    it('rejeita token com tenant_id adulterado depois de assinado', async () => {
        const reg = await request(app).post('/auth/register').send({
            tenantName: 'Hotel Adulterado', name: 'Admin', email: 'admin@adulterado.com', password: 'senha123',
        });
        const login = await request(app).post('/auth/login').send({ email: 'admin@adulterado.com', password: 'senha123' });
        const [header, , signature] = login.body.token.split('.');

        // Troca só o payload (tenant_id de outro tenant), mantendo header e assinatura
        // originais — exatamente o que um atacante tentaria sem ter a chave privada.
        const payloadAdulterado = { ...JSON.parse(Buffer.from(login.body.token.split('.')[1], 'base64').toString()), tenantId: 'tenant-de-outro-hotel' };
        const payloadBase64 = Buffer.from(JSON.stringify(payloadAdulterado)).toString('base64url');
        const tokenAdulterado = `${header}.${payloadBase64}.${signature}`;

        const res = await request(app).get('/rooms').set('Authorization', `Bearer ${tokenAdulterado}`);
        expect(res.status).toBe(401);
        expect(res.body.error).toBe(RECUSA_DO_AUTH);
        void reg;
    });

    it('verifica com a chave pública exposta pelo utilitário — confirma que é o mesmo par usado para assinar', async () => {
        const login = await request(app).post('/auth/register').send({
            tenantName: 'Hotel Par de Chaves', name: 'Admin', email: 'admin@pardechaves.com', password: 'senha123',
        }).then(() => request(app).post('/auth/login').send({ email: 'admin@pardechaves.com', password: 'senha123' }));

        const decoded = jwt.verify(login.body.token, getPublicKey(), { algorithms: ['RS256'] });
        expect(decoded.role).toBe('ADMIN');
    });
});
