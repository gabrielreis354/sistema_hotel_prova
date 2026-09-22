import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest } from './helpers/factories.js';
import ReservationModel from '../app/Models/ReservationModel.js';
import PaymentModel from '../app/Models/PaymentModel.js';
import getPixProvider from '../app/services/pix/index.js';
import sequelize from '../database/connections/sequelize.js';

// Testes do MOTOR DE RESERVA DIRETA + PIX (diferencial nº1).
// Rotas públicas (sem auth) resolvidas por subdomínio + webhook de confirmação PIX.

const app = createApp();
let subdomain;
let jwt;
let categoryId;

// Envia o webhook exatamente como um PSP real assinaria: calcula o HMAC sobre a
// string crua do corpo (não sobre o objeto) e manda os MESMOS bytes assinados —
// exercitando o mesmo caminho de FakePixProvider.signNotification() usado em produção.
function postSignedWebhook(rawBody, { signature } = {}) {
    const req = request(app).post('/webhooks/pix').set('Content-Type', 'application/json');
    if (signature !== null) {
        req.set('x-pix-signature', signature ?? getPixProvider().signNotification(rawBody));
    }
    return req.send(rawBody);
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt, subdomain } = await registerAndLogin(app, { tenantName: 'Hotel Reserva Direta' }));

    const cat = await createCategory(app, jwt, { name: 'Standard', capacity: 2, price_per_night: 150 });
    categoryId = cat.id;
    // 2 quartos na categoria para haver disponibilidade
    await createRoom(app, jwt, categoryId, { number: '101' });
    await createRoom(app, jwt, categoryId, { number: '102' });
});

describe('GET /public/:subdomain/hotel', () => {
    it('retorna dados públicos do hotel (nome + deposit_percent)', async () => {
        const res = await request(app).get(`/public/${subdomain}/hotel`);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ subdomain });
        expect(res.body.name).toBeTruthy();
        expect(typeof res.body.deposit_percent).toBe('number');
    });

    it('retorna 404 para subdomínio inexistente', async () => {
        const res = await request(app).get('/public/hotel-que-nao-existe/hotel');
        expect(res.status).toBe(404);
    });
});

describe('GET /public/:subdomain/availability', () => {
    it('lista categorias disponíveis no período com preço', async () => {
        const res = await request(app)
            .get(`/public/${subdomain}/availability`)
            .query({ check_in: '2027-05-01', check_out: '2027-05-04', guests: 2 });

        expect(res.status).toBe(200);
        expect(res.body.nights).toBe(3);
        expect(Array.isArray(res.body.categories)).toBe(true);
        const standard = res.body.categories.find((c) => c.category_id === categoryId);
        expect(standard).toBeTruthy();
        expect(standard.available_rooms).toBe(2);
        expect(standard.total_price).toBe(450); // 3 noites × 150
    });

    it('retorna 400 sem check_in/check_out', async () => {
        const res = await request(app).get(`/public/${subdomain}/availability`);
        expect(res.status).toBe(400);
    });

    it('retorna 400 quando check_out <= check_in', async () => {
        const res = await request(app)
            .get(`/public/${subdomain}/availability`)
            .query({ check_in: '2027-05-04', check_out: '2027-05-01' });
        expect(res.status).toBe(400);
    });
});

describe('POST /public/:subdomain/bookings — fluxo completo com PIX', () => {
    let bookingId;
    let providerChargeId;

    it('cria reserva PENDING + cobrança PIX do sinal e retorna 201', async () => {
        const res = await request(app)
            .post(`/public/${subdomain}/bookings`)
            .send({
                category_id: categoryId,
                check_in: '2027-06-10',
                check_out: '2027-06-13',
                guests: 2,
                guest: { full_name: 'Maria Hóspede', email: 'maria@example.com' },
            });

        expect(res.status).toBe(201);
        expect(res.body.reservation.status).toBe('PENDING');
        expect(res.body.reservation.nights).toBe(3);
        expect(res.body.reservation.total_amount).toBe(450);
        // sinal padrão de 30% sobre 450 = 135
        expect(res.body.payment.kind).toBe('DEPOSIT');
        expect(res.body.payment.status).toBe('PENDING');
        expect(res.body.payment.amount).toBe(135);
        expect(res.body.payment.balance_due_on_checkin).toBe(315);
        expect(res.body.pix.qr_code).toBeTruthy();
        expect(res.body.pix.provider_charge_id).toBeTruthy();

        bookingId = res.body.reservation.id;
        providerChargeId = res.body.pix.provider_charge_id;
    });

    it('status inicial da reserva é não-confirmado (aguardando PIX)', async () => {
        const res = await request(app).get(`/public/${subdomain}/bookings/${bookingId}/status`);
        expect(res.status).toBe(200);
        expect(res.body.confirmed).toBe(false);
        expect(res.body.deposit.status).toBe('PENDING');
    });

    it('webhook com assinatura inválida retorna 401 e não altera o pagamento', async () => {
        const rawBody = JSON.stringify({ provider_charge_id: providerChargeId });
        const res = await postSignedWebhook(rawBody, { signature: 'sha256=' + '0'.repeat(64) });

        expect(res.status).toBe(401);

        const payment = await PaymentModel.findOne({ where: { provider_charge_id: providerChargeId } });
        expect(payment.status).toBe('PENDING');
    });

    it('webhook com assinatura inválida registra log de servidor (achado qa-redteam 21/09: rejeição era silenciosa)', async () => {
        // O caminho vizinho (secret ausente) já logava; este não logava nada —
        // um PIX_WEBHOOK_SECRET divergente do PSP em produção viraria 401 em
        // TODO callback, sem uma linha sequer no log para investigar.
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const rawBody = JSON.stringify({ provider_charge_id: providerChargeId });
            await postSignedWebhook(rawBody, { signature: 'sha256=' + '0'.repeat(64) });

            expect(errorSpy).toHaveBeenCalled();
            expect(errorSpy.mock.calls.at(-1).join(' ')).toContain('PixWebhookController');
        } finally {
            errorSpy.mockRestore();
        }
    });

    it('webhook sem cabeçalho x-pix-signature retorna 401 e não altera o pagamento', async () => {
        const rawBody = JSON.stringify({ provider_charge_id: providerChargeId });
        const res = await postSignedWebhook(rawBody, { signature: null });

        expect(res.status).toBe(401);

        const payment = await PaymentModel.findOne({ where: { provider_charge_id: providerChargeId } });
        expect(payment.status).toBe('PENDING');
    });

    it('webhook com corpo alterado depois de assinado retorna 401', async () => {
        // Assina o corpo A, mas envia o corpo B — simula um MITM/replay adulterado.
        const assinaturaDoOutroCorpo = getPixProvider().signNotification(
            JSON.stringify({ provider_charge_id: 'fake_outro_charge_qualquer' })
        );
        const rawBody = JSON.stringify({ provider_charge_id: providerChargeId });

        const res = await postSignedWebhook(rawBody, { signature: assinaturaDoOutroCorpo });
        expect(res.status).toBe(401);

        const payment = await PaymentModel.findOne({ where: { provider_charge_id: providerChargeId } });
        expect(payment.status).toBe('PENDING');
    });

    it('webhook sem PIX_WEBHOOK_SECRET configurado recusa a requisição (fail-closed)', async () => {
        const rawBody = JSON.stringify({ provider_charge_id: providerChargeId });
        // Assina ANTES de derrubar o segredo — prova que nem uma assinatura
        // genuína (válida um instante atrás) passa quando o servidor não tem
        // segredo configurado. Fail-closed: ausência de config nunca vira "aceitar".
        const signature = getPixProvider().signNotification(rawBody);

        const original = process.env.PIX_WEBHOOK_SECRET;
        delete process.env.PIX_WEBHOOK_SECRET;
        try {
            const res = await postSignedWebhook(rawBody, { signature });
            expect(res.status).toBe(401);
        } finally {
            process.env.PIX_WEBHOOK_SECRET = original;
        }

        const payment = await PaymentModel.findOne({ where: { provider_charge_id: providerChargeId } });
        expect(payment.status).toBe('PENDING');
    });

    it('webhook PIX confirma o pagamento e promove a reserva para CONFIRMED', async () => {
        const rawBody = JSON.stringify({ provider_charge_id: providerChargeId });
        const res = await postSignedWebhook(rawBody);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('confirmed');
        expect(res.body.reservation_status).toBe('CONFIRMED');
    });

    it('status após pagamento reflete CONFIRMED + depósito PAID', async () => {
        const res = await request(app).get(`/public/${subdomain}/bookings/${bookingId}/status`);
        expect(res.status).toBe(200);
        expect(res.body.confirmed).toBe(true);
        expect(res.body.deposit.status).toBe('PAID');
        expect(res.body.deposit.paid_at).toBeTruthy();
    });

    it('o status público não expõe dados sensíveis do pagamento', async () => {
        const res = await request(app).get(`/public/${subdomain}/bookings/${bookingId}/status`);
        expect(res.status).toBe(200);

        // O endpoint é público, sem autenticação. Nenhum identificador do provedor
        // de pagamento nem o payload do PIX pode aparecer em lugar algum da resposta.
        const corpo = JSON.stringify(res.body);
        expect(corpo).not.toContain('pix_qr_code');
        expect(corpo).not.toContain('provider_charge_id');
        expect(corpo).not.toContain(providerChargeId);

        // O hóspede continua vendo o que precisa para acompanhar a reserva.
        expect(res.body.deposit).toEqual({
            status: 'PAID',
            amount: expect.any(Number),
            paid_at: expect.anything()
        });
    });

    it('a query do status público restringe os atributos do Payment carregado (não confia só na serialização manual)', async () => {
        // O teste anterior garante que a RESPOSTA não vaza campo sensível — mas a resposta
        // é montada campo a campo, então passaria mesmo se a query trouxesse o Payment
        // inteiro para a memória do handler. Este teste espiona a query e falha se o
        // `attributes` do include sumir de GetBookingStatusController.js — é a rede que
        // protege a causa raiz (CA-06.5.a), não só o sintoma (CA-06.5.b).
        const spy = vi.spyOn(ReservationModel, 'findOne');

        const res = await request(app).get(`/public/${subdomain}/bookings/${bookingId}/status`);
        expect(res.status).toBe(200);

        expect(spy).toHaveBeenCalled();
        const options = spy.mock.calls.at(-1)[0];
        const paymentInclude = options.include.find((include) => include.as === 'payments');

        expect(paymentInclude.attributes).toEqual(
            expect.arrayContaining(['kind', 'status', 'amount', 'paid_at'])
        );
        expect(paymentInclude.attributes).not.toContain('pix_qr_code');
        expect(paymentInclude.attributes).not.toContain('provider_charge_id');
        expect(paymentInclude.attributes).not.toContain('provider');

        spy.mockRestore();
    });

    it('webhook é idempotente (reenvio assinado não reprocessa)', async () => {
        const rawBody = JSON.stringify({ provider_charge_id: providerChargeId });
        const res = await postSignedWebhook(rawBody);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('already_processed');
    });
});

describe('POST /public/:subdomain/bookings — validações', () => {
    it('retorna 400 sem dados do hóspede', async () => {
        const res = await request(app)
            .post(`/public/${subdomain}/bookings`)
            .send({ category_id: categoryId, check_in: '2027-07-01', check_out: '2027-07-03' });
        expect(res.status).toBe(400);
    });

    it('retorna 404 com categoria inexistente', async () => {
        const res = await request(app)
            .post(`/public/${subdomain}/bookings`)
            .send({
                category_id: '00000000-0000-0000-0000-000000000000',
                check_in: '2027-07-01',
                check_out: '2027-07-03',
                guest: { full_name: 'João', email: 'joao@example.com' },
            });
        expect(res.status).toBe(404);
    });

    // Regressão do achado 🔴 da auditoria de 27/08: hóspede já cadastrada na recepção
    // com um CPF reserva pelo site com e-mail diferente do que consta no cadastro. O
    // find-or-create antigo só olhava e-mail — o CPF ia direto pro create, batia no
    // índice único e o hóspede via "Erro interno do servidor" no ÚNICO fluxo sem
    // autenticação do sistema, com o CPF impresso no log do servidor.
    it('CPF já cadastrado com e-mail diferente reaproveita o hóspede, não quebra', async () => {
        const cpf = '52998224725';
        const cadastradaPelaRecepcao = await createGuest(app, jwt, {
            full_name: 'Maria Antiga', cpf, email: 'maria.antiga@example.com'
        });
        expect(cadastradaPelaRecepcao.id).toBeTruthy();

        const res = await request(app)
            .post(`/public/${subdomain}/bookings`)
            .send({
                category_id: categoryId,
                check_in: '2027-08-20',
                check_out: '2027-08-22',
                guest: { full_name: 'Maria Antiga', email: 'maria.nova@example.com', cpf },
            });

        expect(res.status).toBe(201);
        expect(res.body.reservation.status).toBe('PENDING');
    });

    // Regressão do achado 🟡-4 da reauditoria: e-mail casando com um hóspede e CPF
    // casando com OUTRO é situação normal numa base de hotel. Antes, o `Op.or` não
    // tinha precedência nem ORDER BY — o resultado dependia do plano de execução do
    // Postgres, apesar do comentário do código afirmar "CPF é identidade mais forte".
    it('e-mail casa com um hóspede e CPF casa com outro: CPF ganha, sempre', async () => {
        const guestA = await createGuest(app, jwt, {
            full_name: 'Dono do E-mail', email: 'compartilhado@example.com', cpf: null
        });
        const guestB = await createGuest(app, jwt, {
            full_name: 'Dono do CPF', cpf: '16899535009', email: 'outro@example.com'
        });

        const res = await request(app)
            .post(`/public/${subdomain}/bookings`)
            .send({
                category_id: categoryId,
                check_in: '2027-08-24',
                check_out: '2027-08-26',
                guest: { full_name: 'Nome Qualquer', email: guestA.email, cpf: guestB.cpf },
            });

        expect(res.status).toBe(201);

        const [[reserva]] = await sequelize.query(
            `SELECT guest_id FROM reservations WHERE id = '${res.body.reservation.id}'`
        );
        expect(reserva.guest_id).toBe(guestB.id);
        expect(reserva.guest_id).not.toBe(guestA.id);

        const [contagem] = await sequelize.query(
            `SELECT count(*) FROM guests WHERE email IN ('compartilhado@example.com', 'outro@example.com')`
        );
        expect(Number(contagem[0].count)).toBe(2); // nenhum terceiro cadastro criado
    });
});

describe('POST /webhooks/pix — validações', () => {
    // A assinatura é verificada ANTES de qualquer outra validação — mesmo os
    // testes de erro 4xx "de negócio" precisam de uma requisição assinada,
    // senão o 401 da assinatura mascararia o que o teste quer provar.
    it('retorna 400 sem provider_charge_id', async () => {
        const rawBody = JSON.stringify({});
        const res = await postSignedWebhook(rawBody);
        expect(res.status).toBe(400);
    });

    it('retorna 400 quando provider_charge_id não é string (ex.: array vira IN() no Sequelize)', async () => {
        // Achado da auditoria qa-redteam de 21/09: sem checar o tipo, um array em
        // provider_charge_id vira `WHERE provider_charge_id IN (...)` — quem tem o
        // segredo (só o PSP, agora que a assinatura é obrigatória) consegue buscar
        // várias cobranças em lote numa única chamada.
        const rawBody = JSON.stringify({ provider_charge_id: ['fake_a', 'fake_b'] });
        const res = await postSignedWebhook(rawBody);
        expect(res.status).toBe(400);
    });

    it('retorna 404 para cobrança inexistente', async () => {
        const rawBody = JSON.stringify({ provider_charge_id: 'fake_inexistente_000' });
        const res = await postSignedWebhook(rawBody);
        expect(res.status).toBe(404);
    });
});
