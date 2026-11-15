import { expect, test } from '@playwright/test';
import { USERS } from '../src/env';
import { addDays, api, compose, cpf, rows, session, TODAY, type Session } from '../src/helpers';

/**
 * Roteiro de demonstração da banca (docs/PLANO_FECHAMENTO_MVP_15NOV2026.md §3, docs/roteiro/),
 * pela tela, um teste por passo. Porte do ensaio de 14/11. Cada rodada grava dados próprios (tag
 * do relógio, CPF novo), para o roteiro rodar de novo no mesmo ambiente sem colisão.
 */

const tag = String(Date.now()).slice(-6);
const ROOM = `E${tag}`;
const CATEGORY = `Ensaio ${tag}`;
const GUEST = `Hospede Ensaio ${tag}`;

type Room = { id: string; number: string; status: string };
type Category = { id: string; name: string };
type Account = { id: string; reservation_id: string | null; items?: { quantity: number }[] };

const ctx: { cat?: Category; room?: Room; resId?: string } = {};
const errors: string[] = [];
let admin: Session;
let recep: Session;
let garcom: Session;
let tkAdmin: string;
let tkRecep: string;

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
    await page.getByLabel('E-mail').fill(`ensaio${tag}@example.com`);
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
    const { page, context } = garcom;
    await page.goto('/comanda');
    const suite = page.getByRole('list', { name: 'Contas abertas' }).getByRole('link', { name: new RegExp(`${ROOM}|${CATEGORY}`) });
    await suite.first().click();
    const menu = page.getByRole('region', { name: 'Cardápio' });
    await menu.waitFor();
    const produto = menu.getByRole('button').filter({ hasText: /R\$/ }).first();
    await produto.click();
    await page.waitForTimeout(1_500);
    await context.setOffline(true);
    await produto.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: testInfo.outputPath('p3_comanda_sem_rede.png') });
    await context.setOffline(false);

    // Dois toques no mesmo produto dentro dos 5 s de "desfazer" somam na mesma linha (queueCore.ts).
    // Conferido pela API, como a recepção: a conta da suíte é a da reserva do passo 2.
    const unidades = async () => {
      const conta = rows(await api<Account[]>(tkRecep, 'GET', '/accounts')).find((a) => a.reservation_id === ctx.resId);
      if (!conta) return 0;
      const detalhe = await api<Account>(tkRecep, 'GET', `/accounts/${conta.id}`);
      return (detalhe.items ?? []).reduce((s, i) => s + Number(i.quantity), 0);
    };
    await expect.poll(unidades, { message: 'esperava 2 unidades na suíte depois da rede voltar', timeout: 20_000 }).toBeGreaterThanOrEqual(2);

    // Mesa
    await page.goto('/comanda');
    await page.getByRole('button', { name: 'Abrir conta' }).first().click();
    await page.getByRole('group', { name: 'Tipo da conta' }).getByRole('button', { name: 'Mesa' }).click();
    await page.getByLabel('Nome na comanda').fill(`Mesa ${tag}`);
    await page.locator('form', { has: page.getByLabel('Nome na comanda') }).locator('button[type="submit"]').first().click();
    await page.getByRole('region', { name: 'Cardápio' }).getByRole('button').filter({ hasText: /R\$/ }).first().click();
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: testInfo.outputPath('p3_mesa.png') });
  });

  test('4. Recepção abre o painel do dia', async ({}, testInfo) => {
    const { page } = recep;
    await page.goto('/');
    await expect(page.getByText(GUEST).first()).toBeVisible();
    await page.waitForTimeout(2_000);
    await page.screenshot({ path: testInfo.outputPath('p4_painel.png'), fullPage: true });
    const falha = (await page.locator('body').innerText()).match(/não (foi possível|carreg)[^\n]{0,80}|erro[^\n]{0,80}/i);
    expect(falha?.[0], 'painel com falha visível').toBeUndefined();
  });

  test('5. Check-out: conta, pagamento e fechamento', async ({}, testInfo) => {
    const { page } = recep;
    await page.goto(`/reservas/${ctx.resId}`);
    await page.getByRole('tab', { name: /conta/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Registrar pagamento' })).toBeVisible();
    await expect(page.locator('#painel-conta'), 'consumo do garçom na linha do tempo').toContainText('Caipirinha');
    await page.getByText('Dinheiro', { exact: true }).click();
    await page.getByRole('button', { name: 'Registrar pagamento' }).click();
    await expect(page.getByText(/registrad/i).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('p5_conta_paga.png'), fullPage: true });
    await page.getByRole('button', { name: /fazer check-out/i }).first().click();
    // A confirmação aparece conforme o saldo; sem ela, o check-out já seguiu.
    await page.getByRole('button', { name: /confirmar check-out/i }).first().click({ timeout: 5_000 }).catch(() => {});
    await expect(page.getByText(/check-out feito/i).first()).toBeVisible();
    const r = await api<{ status: string }>(tkRecep, 'GET', `/reservations/${ctx.resId}`);
    const room = await api<Room>(tkRecep, 'GET', `/rooms/${ctx.room!.id}`);
    expect({ reserva: r.status, quarto: room.status }).toEqual({ reserva: 'CHECKED_OUT', quarto: 'CLEANING' });
  });

  test('6. Hóspede reserva direto e paga o sinal por PIX (simulado)', async () => {
    // O pagamento é simulado assinando o webhook com o segredo do provedor fake. Com o sandbox
    // real (Asaas), quem paga é o app do banco: esse passo é manual.
    const provider = compose('exec', '-T', 'backend', 'printenv', 'PIX_PROVIDER').trim();
    test.skip(
      provider !== 'fake',
      `PIX_PROVIDER=${provider || '(vazio)'}: o passo 6 só é automático com o provedor fake. No sandbox real ele é manual (docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md).`,
    );

    const res = await api<{
      reservation: { id: string; status: string };
      pix?: { provider_charge_id?: string };
      payment?: { provider_charge_id?: string; amount?: string };
    }>(null, 'POST', '/public/aurora/bookings', {
      category_id: ctx.cat!.id,
      check_in: addDays(TODAY, 10),
      check_out: addDays(TODAY, 12),
      guests: 1,
      guest: { full_name: `Site Ensaio ${tag}`, email: `site${tag}@example.com`, cpf: cpf() },
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
  });

  test('7. Gerente abre os indicadores (analytics-service)', async ({}, testInfo) => {
    const { page } = admin;
    const calls: string[] = [];
    const onResponse = (r: { url(): string; status(): number }) => {
      // Só a API (/api/analytics/ no proxy do Vite): os módulos de src/features/analytics/ também casariam com /analytics/.
      const path = new URL(r.url()).pathname;
      if (path.startsWith('/api/analytics/')) calls.push(`${r.status()} ${path}`);
    };
    page.on('response', onResponse);
    try {
      await page.waitForTimeout(5_000); // tempo para o outbox entregar os eventos dos passos 1 a 6
      await page.goto('/indicadores');
      await expect(page.getByRole('heading', { name: 'Indicadores' })).toBeVisible();
      await page.waitForTimeout(4_000);
      await page.screenshot({ path: testInfo.outputPath('p7_indicadores.png'), fullPage: true });
    } finally {
      page.off('response', onResponse);
    }
    expect(calls.length, 'nenhuma chamada a /analytics/').toBeGreaterThan(0);
    expect([...new Set(calls.filter((c) => !c.startsWith('2')))], 'chamadas a /analytics/ falhando').toEqual([]);
  });
});
