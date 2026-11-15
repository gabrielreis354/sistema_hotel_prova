import { chromium, type Page } from '@playwright/test';
import { API_URL, APP_URL, COMPOSE_PROJECT, PASSWORD, USERS } from './src/env';
import { AUTH_STORAGE_KEY, LOGIN_LIMIT_HINT } from './src/helpers';

/**
 * Roda uma vez, antes do roteiro:
 *
 * 1. Confere que o compose está no ar e semeado. Sem isso, cada um dos 7 passos morreria por
 *    timeout e o relatório não diria a causa; aqui o roteiro para na hora, com a mensagem certa.
 * 2. Aquece o Vite. No primeiro acesso, o Vite descobre dependências, otimiza e recarrega a
 *    página. Em 15/11 esse recarregamento caiu no meio do passo 1 e derrubou os 7 passos da
 *    primeira rodada. Aqui percorremos as telas do roteiro até uma volta inteira passar sem
 *    recarregamento.
 */
export default async function globalSetup(): Promise<void> {
  const session = await assertBackendUp();
  await warmUpVite(session);
}

const subir = `Suba o ambiente antes (frontend/e2e/README.md): COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT} ./start.sh compose-up --build, depois migrate, seed (ALLOW_SEED=1) e outbox-initial-load.`;

type StoredSession = { token: string; user: unknown };

/** Health do nginx e um login do admin pela API: prova que o banco foi semeado e que a senha confere. */
async function assertBackendUp(): Promise<StoredSession> {
  // O roteiro grava dados "E2E" no Hotel Aurora: só no compose descartável desta máquina, nunca no
  // ambiente da apresentação nem em servidor remoto.
  const host = new URL(API_URL).hostname;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
    throw new Error(`[e2e] E2E_API_URL=${API_URL} não é local. O roteiro só roda contra o compose descartável (${COMPOSE_PROJECT}) desta máquina.`);
  }
  try {
    const r = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    throw new Error(`[e2e] A API não responde em ${API_URL}/health (${(e as Error).message}). ${subir}`);
  }
  const r = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: USERS.admin, password: PASSWORD }),
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 429) throw new Error(`[e2e] Login recusado com 429. ${LOGIN_LIMIT_HINT}`);
  if (!r.ok) {
    throw new Error(
      `[e2e] A API está no ar, mas o login de ${USERS.admin} deu HTTP ${r.status}. O banco foi semeado? A senha é a de E2E_PASSWORD? ${subir}`,
    );
  }
  return (await r.json()) as StoredSession;
}

/** Telas que o roteiro abre. O UUID zerado só carrega o módulo da tela de reserva. */
const ROUTES = [
  '/login',
  '/',
  '/quartos/categorias/nova',
  '/quartos/novo',
  '/reservas/nova',
  '/reservas/00000000-0000-0000-0000-000000000000',
  '/comanda',
  '/indicadores',
];

async function warmUpVite({ token, user }: StoredSession): Promise<void> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL: APP_URL });
    // Entra com o JWT do login acima, no formato do persist do app (apps/pms/src/stores/auth.ts):
    // um login pela tela aqui gastaria a cota de login do nginx que os passos vão usar.
    await context.addInitScript(
      ([key, value]) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      },
      [AUTH_STORAGE_KEY, JSON.stringify({ state: { token, user }, version: 0 })] as const,
    );
    const page = await context.newPage();
    let loads = 0;
    page.on('load', () => (loads += 1));

    for (let pass = 1; pass <= 4; pass += 1) {
      let reloaded = false;
      for (const route of ROUTES) {
        if (await settle(page, route, () => loads)) reloaded = true;
      }
      if (!reloaded) return;
    }
    throw new Error('[e2e] O Vite continuou recarregando a página depois de 4 voltas pelas telas do roteiro.');
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith('[e2e]')) throw e;
    throw new Error(`[e2e] Falha ao aquecer o Vite em ${APP_URL}: ${msg.split('\n')[0]}`);
  } finally {
    await browser.close();
  }
}

/**
 * Abre a rota e espera a rede assentar. Devolve true se a página recarregou sozinha depois do
 * carregamento (o sinal de que o Vite otimizou dependência nova).
 */
async function settle(page: Page, route: string, loads: () => number): Promise<boolean> {
  await page.goto(route, { waitUntil: 'load', timeout: 60_000 });
  const before = loads();
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  return loads() > before;
}
