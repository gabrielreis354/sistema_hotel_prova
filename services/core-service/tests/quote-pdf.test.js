import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3Client from '../database/connections/minio.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';

// RNF-023: o PDF do orçamento é persistido no armazenamento de objeto e baixado por URL
// assinada — como o do contrato. O orçamento é o registro do que foi OFERECIDO ao cliente
// corporativo: regenerado sob demanda, mudaria junto com os dados.
//
// Primeiros testes de PDF da suíte. O MinIO não existe em teste/CI: o `send` do cliente S3 é
// espionado. Não é `vi.mock` do módulo de upload: a suíte roda com `isolate: false` (cache de
// módulos compartilhado entre arquivos), e o mock só valeria se este arquivo carregasse os
// controllers primeiro — com `--sequence.shuffle.files`, falhou em 3 de 4 ordens. O cliente S3
// é uma instância única, então o espião vale em qualquer ordem. O PDF é gerado de verdade
// (pdfkit), e a URL assinada também (assinar não usa rede).
const BUCKET = process.env.MINIO_BUCKET || 'hotel-contracts';
let send;
const uploads = () => send.mock.calls.map(([command]) => command).filter((c) => c instanceof PutObjectCommand);
const urlGravada = (key) => `${process.env.MINIO_ENDPOINT}/${BUCKET}/${key}`;

const app = createApp();
let jwt;
let tenantId;
let clientId;
let outroJwt;

const auth = (token = jwt) => ({ Authorization: `Bearer ${token}` });
const chaveDo = (quoteId) => `${tenantId}/quotes/${quoteId}.pdf`;

async function criarOrcamento() {
    const res = await request(app).post('/event-quotes').set(auth()).send({
        corporate_client_id: clientId,
        check_in: '2027-11-10', check_out: '2027-11-12', pessoas: 8,
        valor_diaria_sem_refeicao: 150,
    });
    expect(res.status).toBe(201);
    return res.body;
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt, tenantId } = await registerAndLogin(app, { tenantName: 'Hotel Orcamento PDF' }));
    ({ jwt: outroJwt } = await registerAndLogin(app, { tenantName: 'Outro Hotel PDF' }));

    const client = await request(app).post('/corporate-clients').set(auth()).send({
        razao_social: 'Eventos Orcamento LTDA',
        cnpj: '98.765.432/0001-10',
        email: 'eventos@orcamento.com',
        representante_nome: 'Beltrana de Tal',
    });
    clientId = client.body.id;
});

beforeEach(() => {
    send?.mockRestore();
    send = vi.spyOn(s3Client, 'send').mockResolvedValue({});
});

afterAll(() => send?.mockRestore());

const falhaNoMinio = () => send.mockRejectedValue(new Error('connect ECONNREFUSED minio:9000'));

function expectRedirecionaAssinada(res, key) {
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    // O host da assinatura é o público (nginx), não o interno (minio:9000) — achado 🔴-1 da
    // auditoria de 30/09: assinada com o interno, a URL era inalcançável pelo navegador.
    expect(url.origin).toBe(process.env.MINIO_PUBLIC_ENDPOINT);
    expect(url.origin).not.toBe(new URL(process.env.MINIO_ENDPOINT).origin);
    expect(url.pathname).toBe(`/${BUCKET}/${key}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300'); // RNF-023: expiração ≤ 5 min
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    // Assinada pelo usuário só de leitura, nunca pelo root — achado 🔴-11 da reauditoria de 04/10:
    // a URL expõe o access key de quem assinou, e o caminho até o MinIO passa pelo nginx.
    const [accessKey] = url.searchParams.get('X-Amz-Credential').split('/');
    expect(accessKey).toBe(process.env.MINIO_PRESIGN_USER);
    expect(accessKey).not.toBe(process.env.MINIO_ROOT_USER);
}

describe('POST /event-quotes — PDF persistido (CA-D.2)', () => {
    it('gera o PDF, envia com a chave <tenant>/quotes/<id>.pdf e grava pdf_url', async () => {
        const quote = await criarOrcamento();

        expect(uploads()).toHaveLength(1);
        const { Key, Body, ContentType } = uploads()[0].input;
        expect(Key).toBe(chaveDo(quote.id));
        expect(ContentType).toBe('application/pdf');
        expect(Body.subarray(0, 5).toString()).toBe('%PDF-');
        expect(quote.pdf_url).toBe(urlGravada(chaveDo(quote.id)));

        const salvo = await request(app).get(`/event-quotes/${quote.id}`).set(auth());
        expect(salvo.body.pdf_url).toBe(quote.pdf_url);
    });

    it('MinIO fora do ar: orçamento continua criado (201) com pdf_url nulo', async () => {
        falhaNoMinio();

        const quote = await criarOrcamento();

        expect(quote.id).toBeTruthy();
        expect(quote.pdf_url).toBeNull();
    });
});

describe('GET /event-quotes/:id/pdf — download (CA-D.5)', () => {
    it('com pdf_url: redireciona (302) para a URL assinada da chave do orçamento', async () => {
        const quote = await criarOrcamento();

        const res = await request(app).get(`/event-quotes/${quote.id}/pdf`).set(auth());

        expectRedirecionaAssinada(res, chaveDo(quote.id));
    });

    it('sem pdf_url: gera sob demanda (200, application/pdf)', async () => {
        falhaNoMinio();
        const quote = await criarOrcamento();

        const res = await request(app).get(`/event-quotes/${quote.id}/pdf`).set(auth()).buffer(true);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/pdf');
    });
});

describe('PUT /event-quotes/:id — só orçamento SENT é editável (CA-D.3, CA-D.4)', () => {
    it.each([
        ['CONFIRMED', 'confirm'],
        ['CANCELLED', 'cancel'],
    ])('orçamento %s → 409, sem tocar no PDF', async (status, acao) => {
        const quote = await criarOrcamento();
        expect((await request(app).put(`/event-quotes/${quote.id}/${acao}`).set(auth())).status).toBe(200);
        send.mockClear();

        const res = await request(app).put(`/event-quotes/${quote.id}`).set(auth()).send({ pessoas: 20 });

        expect(res.status).toBe(409);
        expect(uploads()).toHaveLength(0);
        const salvo = await request(app).get(`/event-quotes/${quote.id}`).set(auth());
        expect(salvo.body.pessoas).toBe(8);
        expect(salvo.body.status).toBe(status);
    });

    it('orçamento SENT: edita e regera o PDF na mesma chave', async () => {
        const quote = await criarOrcamento();
        send.mockClear();

        const res = await request(app).put(`/event-quotes/${quote.id}`).set(auth()).send({ pessoas: 12 });

        expect(res.status).toBe(200);
        expect(res.body.pessoas).toBe(12);
        expect(uploads()).toHaveLength(1);
        expect(uploads()[0].input.Key).toBe(chaveDo(quote.id));
        expect(res.body.pdf_url).toBe(urlGravada(chaveDo(quote.id)));
    });

    it('orçamento SENT com MinIO fora do ar: edita (200) e zera pdf_url — o PDF antigo não serve mais', async () => {
        const quote = await criarOrcamento();
        expect(quote.pdf_url).not.toBeNull();
        falhaNoMinio();

        const res = await request(app).put(`/event-quotes/${quote.id}`).set(auth()).send({ pessoas: 15 });

        expect(res.status).toBe(200);
        expect(res.body.pessoas).toBe(15);
        expect(res.body.pdf_url).toBeNull();
    });
});

describe('Isolamento de tenant nas rotas tocadas (CA-D.7)', () => {
    it('outro hotel recebe 404 no download e na edição, e o PDF não é tocado', async () => {
        const quote = await criarOrcamento();
        send.mockClear();

        const download = await request(app).get(`/event-quotes/${quote.id}/pdf`).set(auth(outroJwt));
        const edicao = await request(app).put(`/event-quotes/${quote.id}`).set(auth(outroJwt)).send({ pessoas: 99 });

        expect(download.status).toBe(404);
        expect(edicao.status).toBe(404);
        expect(uploads()).toHaveLength(0);
        const salvo = await request(app).get(`/event-quotes/${quote.id}`).set(auth());
        expect(salvo.body.pessoas).toBe(8);
    });

    it('outro hotel não cria orçamento com o cliente corporativo deste hotel (404)', async () => {
        const res = await request(app).post('/event-quotes').set(auth(outroJwt)).send({
            corporate_client_id: clientId,
            check_in: '2027-11-10', check_out: '2027-11-12', pessoas: 8,
        });

        expect(res.status).toBe(404);
        expect(uploads()).toHaveLength(0);
    });
});

// CA-D.6: o bloco "gerar → enviar → gravar pdf_url" saiu do CreateContractController para
// app/utils/storeDocumentPdf.js. Estes testes provam que o contrato se comporta como antes.
describe('Contrato — mesmo util de PDF, comportamento preservado (CA-D.6)', () => {
    const criarContrato = () => request(app).post('/contracts').set(auth()).send({
        corporate_client_id: clientId,
        objeto: 'Hospedagem de evento',
        check_in: '2027-12-01', check_out: '2027-12-03', pessoas: 6, total: 1800,
        testemunha_1: 'Testemunha Um', testemunha_2: 'Testemunha Dois',
    });

    it('criação envia com a chave <tenant>/contracts/<id>.pdf, grava pdf_url e o download redireciona', async () => {
        const res = await criarContrato();

        expect(res.status).toBe(201);
        const chave = `${tenantId}/contracts/${res.body.id}.pdf`;
        expect(uploads()[0].input.Key).toBe(chave);
        expect(res.body.pdf_url).toBe(urlGravada(chave));

        const download = await request(app).get(`/contracts/${res.body.id}/pdf`).set(auth());
        expectRedirecionaAssinada(download, chave);
    });

    it('MinIO fora do ar: contrato criado (201) com pdf_url nulo', async () => {
        falhaNoMinio();

        const res = await criarContrato();

        expect(res.status).toBe(201);
        expect(res.body.pdf_url).toBeNull();
    });
});
