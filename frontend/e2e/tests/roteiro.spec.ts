import { expect, test } from '@playwright/test';
import { USERS } from '../src/env';
import { addDays, api, compose, cpf, rows, session, TODAY, type Session } from '../src/helpers';

/**
 * Roteiro de demonstração da banca (docs/PLANO_FECHAMENTO_MVP_15NOV2026.md §3, docs/roteiro/),
 * pela tela, um teste por passo. Porte do ensaio de 14/11. Cada rodada grava dados próprios (tag
 * do relógio, CPF novo), para o roteiro rodar de novo no mesmo ambiente sem colisão. Tudo o que
 * ele cria leva o prefixo "E2E", para ninguém confundir com dado de demonstração.
 *
 * Só roda no ambiente descartável (gesway-ensaio), nunca no da apresentação: ver o README.
 */

const tag = String(Date.now()).slice(-6);
const ROOM = `E2E${tag}`;
const CATEGORY = `E2E Categoria ${tag}`;
const GUEST = `E2E Hospede ${tag}`;
const TABLE = `E2E Mesa ${tag}`;
// Produto pelo nome, não pela posição: a ordem do cardápio depende da collation do Postgres.
const PRODUCT = 'Caipirinha';

type Room = { id: string; number: string; status: string };
type Category = { id: string; name: string };
type Account = { id: string; label: string; reservation_id: string | null; items?: { quantity: number }[] };
type Bill = { status: string; total: string; payments_made: string; balance: string };
type Payment = { reservation_id: string | null; amount: string; status: string };

const ctx: { cat?: Category; room?: Room; resId?: string; siteRes?: string } = {};
const errors: string[] = [];
let admin: Session;
let recep: Session;
let garcom: Session;
let tkAdmin: string;
let tkRecep: string;

/** Unidades gravadas no servidor numa conta (itens excluídos já ficam de fora). */
async function units(find: (a: Account) => boolean): Promise<number> {
  const conta = rows(await api<Account[]>(tkRecep, 'GET', '/accounts')).find(find);
  if (!conta) return 0;
  const detalhe = await api<Account>(tkRecep, 'GET', `/accounts/${conta.id}`);
  return (detalhe.items ?? []).reduce((s, i) => s + Number(i.quantity), 0);
}

test.describe.serial('Roteiro de demonstração', () => {
  test.beforeAll(async ({ browser }) => {
    admin = await session(browser, USERS.admin, errors);
    recep = await session(browser, USERS.recep, errors);
    garcom = await session(browser, USERS.garcom, errors, { width: 375, height: 812 });
    tkAdmin = admin.token;
    tkRecep = recep.token;
  });

  test.afterAll(async () => {
    for (const s of [admin, recep, garcom]) await s?.context.close();
  });

  // Erro de JavaScript em qualquer página aberta reprova o passo em que apareceu.
  test.afterEach(() => {
    const found = errors.splice(0);
    expect(found, `erros de JavaScript na página: ${found.join(' | ')}`).toEqual([]);
  });

  test('1. Admin cadastra categoria e quarto', async ({}, testInfo) => {
    const { page } = admin;
    await page.goto('/quartos/categorias/nova');
    await page.getByLabel('Nome').fill(CATEGORY);
    await page.getByLabel('Capacidade (pessoas)').fill('2');
    await page.getByLabel('Diária (R$)').fill('200,00');
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.endsWith('/nova'), { timeout: 15_000 });
    ctx.cat = rows(await api<Category[]>(tkAdmin, 'GET', '/room-categories')).find((c) => c.name === CATEGORY);
    expect(ctx.cat, 'categoria não gravada').toBeTruthy();

    await page.goto('/quartos/novo');
    await page.getByLabel('Número').fill(ROOM);
    const categoria = page.getByLabel('Categoria');
    const value = await categoria.locator('option', { hasText: CATEGORY }).getAttribute('value');
    await categoria.selectOption(value!);
    await page.getByLabel('Andar (opcional)').fill('1');
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.endsWith('/novo'), { timeout: 15_000 });
    ctx.room = rows(await api<Room[]>(tkAdmin, 'GET', '/rooms')).find((r) => r.number === ROOM);
    expect(ctx.room, 'quarto não gravado').toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath('p1_quartos.png') });
  });

  test('2. Recepção cria reserva, vê o valor e faz check-in', async ({}, testInfo) => {
    const { page } = recep;
    await page.goto('/reservas/nova');
    await page.getByLabel('Entrada').fill(TODAY);
    await page.getByLabel('Saída').fill(addDays(TODAY, 2));
    await page.getByRole('button', { name: /novo hóspede|cadastrar/i }).first().click();
    await page.getByLabel('Nome completo').fill(GUEST);
    await page.getByLabel('CPF').fill(cpf());
    await page.getByLabel('E-mail').fill(`e2e${tag}@example.com`);
    const guestForm = page.locator('form', { has: page.getByLabel('Nome completo') });
    await guestForm.locator('button[type="submit"]').first().click();
    await page.getByRole('button', { name: new RegExp(ROOM) }).click();
    const resumo = page.getByRole('complementary', { name: 'Resumo da reserva' });
    await expect(resumo.getByText(/R\$\s*400,00/).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('p2_nova_reserva.png') });
    await page.getByRole('button', { name: 'Confirmar reserva' }).click();
    await page.waitForURL(/\/reservas\/[0-9a-f-]{36}/, { timeout: 15_000 });
    ctx.resId = page.url().match(/reservas\/([0-9a-f-]{36})/)![1];
    await page.getByRole('button', { name: /fazer check-in/i }).first().click();
    await expect(page.getByText(/check-in feito/i).first()).toBeVisible();
    const r = await api<{ status: string }>(tkRecep, 'GET', `/reservations/${ctx.resId}`);
    expect(r.status).toBe('CHECKED_IN');
  });

  test('3. Garçom lança consumo na suíte e numa mesa, inclusive sem rede', async ({}, testInfo) => {
    test.setTimeout(150_000);
    const { page, context } = garcom;
    const suiteUnits = () => units((a) => a.reservation_id === ctx.resId);
    // A fila só envia depois da janela de desfazer (UNDO_MS = 5 s, apps/pms/src/features/accounts/queueCore.ts)
    // e, sem rede, tenta de novo com espera crescente até 30 s.
    const sent = { timeout: 45_000, intervals: [1_000] };

    await page.goto('/comanda');
    const suite = page.getByRole('list', { name: 'Contas abertas' }).getByRole('link', { name: new RegExp(`${ROOM}|${CATEGORY}`) });
    await suite.first().click();
    const menu = page.getByRole('region', { name: 'Cardápio' });
    const produto = menu.getByRole('button', { name: new RegExp(PRODUCT) });
    const itens = page.getByRole('region', { name: 'Itens lançados' });

    // 1º toque, com rede: sai depois da janela de desfazer.
    await produto.click();
    await expect.poll(suiteUnits, { message: '1º toque deveria chegar ao servidor', ...sent }).toBe(1);

    // 2º toque sem rede. A janela de desfazer vence com o aparelho offline, o envio falha de fato
    // e o lançamento fica "Na fila". O servidor continua com 1 unidade.
    await context.setOffline(true);
    await produto.click();
    await expect(itens.getByText('Na fila'), 'sem rede, o lançamento deveria ficar na fila').toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: testInfo.outputPath('p3_comanda_sem_rede.png') });
    expect(await suiteUnits(), 'sem rede, nada deveria ter chegado ao servidor').toBe(1);

    // Rede de volta: a fila reenvia com o mesmo client_item_id. Exatamente 2, nunca mais
    // (duplicação é o que a fila offline existe para impedir).
    await context.setOffline(false);
    await expect.poll(suiteUnits, { message: 'o reenvio deveria gravar o 2º toque', ...sent }).toBe(2);
    await expect(itens.getByText(/Na fila|Enviando|Aguardando envio/)).toHaveCount(0, { timeout: 15_000 });
    expect(await suiteUnits(), 'o reenvio não pode duplicar o item').toBe(2);

    // Mesa
    await page.goto('/comanda');
    await page.getByRole('button', { name: 'Abrir conta' }).first().click();
    await page.getByRole('group', { name: 'Tipo da conta' }).getByRole('button', { name: 'Mesa' }).click();
    await page.getByLabel('Nome na comanda').fill(TABLE);
    await page.locator('form', { has: page.getByLabel('Nome na comanda') }).locator('button[type="submit"]').first().click();
    await page.getByRole('region', { name: 'Cardápio' }).getByRole('button', { name: new RegExp(PRODUCT) }).click();
    await expect
      .poll(() => units((a) => a.label.includes(TABLE)), { message: 'o lançamento da mesa deveria chegar ao servidor', ...sent })
      .toBe(1);
    await page.screenshot({ path: testInfo.outputPath('p3_mesa.png') });
  });

  test('4. Recepção abre o painel do dia', async ({}, testInfo) => {
    const { page } = recep;
    await page.goto('/');
    const naCasa = page.locator('section', { has: page.locator('#na-casa-titulo') });
    await expect(naCasa.getByText(GUEST)).toBeVisible();
    // A faixa "Atenção" só mostra a lista quando os alertas carregaram sem erro (TodayPage.tsx).
    await expect(page.locator('section[aria-labelledby="atencao-titulo"] ul')).toBeVisible();
    // Todos os blocos carregados (sem spinner) e nenhum ErrorState (role="alert", @hotel/ui).
    await expect(page.getByText(/^Carregando .*…$/)).toHaveCount(0);
    await expect(page.getByRole('alert'), 'painel com falha visível').toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('p4_painel.png'), fullPage: true });
  });

  test('5. Check-out: conta, pagamento e fechamento', async ({}, testInfo) => {
    const { page } = recep;
    await page.goto(`/reservas/${ctx.resId}`);
    await page.getByRole('tab', { name: /conta/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Registrar pagamento' })).toBeVisible();
    await expect(page.locator('#painel-conta'), 'consumo do garçom na linha do tempo').toContainText(PRODUCT);
    await page.getByText('Dinheiro', { exact: true }).click();
    await page.getByRole('button', { name: 'Registrar pagamento' }).click();
    // O texto exato do sucesso (PaymentForm.tsx). As falhas também dizem "registrado"
    // ("Nada foi registrado."), por isso nada de regex frouxa.
    await expect(page.getByText(/^Pagamento de R\$\s*[\d.,]+ em Dinheiro registrado\.$/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('p5_conta_paga.png'), fullPage: true });
    // O check-out sempre pede confirmação (openCheckOut, ReservationDetailPage.tsx).
    await page.getByRole('button', { name: /fazer check-out/i }).first().click();
    await page.getByRole('button', { name: /confirmar check-out/i }).first().click();
    await expect(page.getByText(/check-out feito/i).first()).toBeVisible();

    const r = await api<{ status: string }>(tkRecep, 'GET', `/reservations/${ctx.resId}`);
    const room = await api<Room>(tkRecep, 'GET', `/rooms/${ctx.room!.id}`);
    expect({ reserva: r.status, quarto: room.status }).toEqual({ reserva: 'CHECKED_OUT', quarto: 'CLEANING' });

    // O backend aceita check-out com saldo em aberto: o pagamento e o saldo zero são conferidos aqui.
    const conta = rows(await api<Account[]>(tkRecep, 'GET', '/accounts')).find((a) => a.reservation_id === ctx.resId);
    expect(conta, 'conta da suíte').toBeTruthy();
    const bill = await api<Bill>(tkRecep, 'GET', `/accounts/${conta!.id}/bill`);
    const pagos = rows(await api<Payment[]>(tkRecep, 'GET', '/payments')).filter(
      (p) => p.reservation_id === ctx.resId && p.status === 'PAID',
    );
    const pagoTotal = pagos.reduce((s, p) => s + Math.round(Number(p.amount) * 100), 0);
    expect({ status: bill.status, saldo: bill.balance, pago: pagoTotal }).toEqual({
      status: 'PAID',
      saldo: '0.00',
      pago: Math.round(Number(bill.total) * 100),
    });
  });

  test('6. Hóspede reserva direto e paga o sinal por PIX (simulado)', async () => {
    // O pagamento é simulado assinando o webhook com o segredo do provedor fake. Com o sandbox
    // real (Asaas), quem paga é o app do banco: esse passo é manual.
    const manual = 'No sandbox real ele é manual (docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md).';
    let provider: string;
    try {
      provider = compose('exec', '-T', 'backend', 'printenv', 'PIX_PROVIDER').trim();
    } catch (e) {
      const why = (e as { stderr?: Buffer }).stderr?.toString().trim().split('\n')[0] || (e as Error).message.split('\n')[0];
      test.skip(
        true,
        `docker compose não alcança o backend do projeto (${why}). Confira COMPOSE_PROJECT_NAME e o CLI do docker. ${manual}`,
      );
      return;
    }
    test.skip(provider !== 'fake', `PIX_PROVIDER=${provider || '(vazio)'}: o passo 6 só é automático com o provedor fake. ${manual}`);

    const res = await api<{
      reservation: { id: string; status: string };
      pix?: { provider_charge_id?: string };
      payment?: { provider_charge_id?: string; amount?: string };
    }>(null, 'POST', '/public/aurora/bookings', {
      category_id: ctx.cat!.id,
      check_in: addDays(TODAY, 10),
      check_out: addDays(TODAY, 12),
      guests: 1,
      guest: { full_name: `E2E Site ${tag}`, email: `e2e-site${tag}@example.com`, cpf: cpf() },
    });
    const chargeId = res.pix?.provider_charge_id ?? res.payment?.provider_charge_id;
    expect(res.reservation.status).toBe('PENDING');
    expect(chargeId, 'reserva pública sem cobrança PIX').toBeTruthy();

    compose('exec', '-T', 'backend', 'node', 'scripts/simular_pagamento_pix.js', chargeId!);
    await expect
      .poll(async () => (await api<{ status: string }>(tkRecep, 'GET', `/reservations/${res.reservation.id}`)).status, {
        message: 'o webhook do PIX deveria confirmar a reserva',
        timeout: 15_000,
      })
      .toBe('CONFIRMED');
    ctx.siteRes = res.reservation.id;
  });

  test('7. Gerente abre os indicadores (analytics-service)', async ({}, testInfo) => {
    const { page } = admin;
    // O outbox leva ao analytics as reservas dos passos 2 e 6 na categoria nova do passo 1. A
    // receita por categoria só mostra essa categoria depois que os eventos chegaram.
    const esperadas = ctx.siteRes ? 2 : 1;
    const query = `start=${TODAY}&end=${addDays(TODAY, 12)}`;
    await expect
      .poll(
        async () => {
          const linhas = await api<{ category: string | null; reservations: number }[]>(
            tkAdmin,
            'GET',
            `/analytics/revenue-by-category?${query}`,
          );
          return linhas.find((l) => l.category === CATEGORY)?.reservations ?? 0;
        },
        { message: `o analytics deveria contar ${esperadas} reserva(s) na ${CATEGORY}`, timeout: 60_000, intervals: [1_000] },
      )
      .toBe(esperadas);

    // A tela: todas as chamadas a /api/analytics/ voltam 2xx. Só a API conta, não os módulos de
    // src/features/analytics/ que o Vite serve.
    const calls: string[] = [];
    const onResponse = (r: { url(): string; status(): number }) => {
      const path = new URL(r.url()).pathname;
      if (path.startsWith('/api/analytics/')) calls.push(`${r.status()} ${path}`);
    };
    page.on('response', onResponse);
    try {
      const first = page.waitForResponse((r) => new URL(r.url()).pathname.startsWith('/api/analytics/'));
      await page.goto('/indicadores');
      await expect(page.getByRole('heading', { name: 'Indicadores' })).toBeVisible();
      await first;
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: testInfo.outputPath('p7_indicadores.png'), fullPage: true });
    } finally {
      page.off('response', onResponse);
    }
    expect(calls.length, 'nenhuma chamada a /api/analytics/').toBeGreaterThan(0);
    expect([...new Set(calls.filter((c) => !c.startsWith('2')))], 'chamadas a /api/analytics/ falhando').toEqual([]);
  });
});
