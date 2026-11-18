import { execFileSync } from 'node:child_process';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { API_URL, APP_URL, COMPOSE_PROJECT, PASSWORD, REPO_ROOT } from './env';

/** Chamada à API pelo nginx. Resposta fora de 2xx vira erro com o corpo, para o relatório dizer o porquê. */
export async function api<T = any>(token: string | null, method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const b = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(b)?.slice(0, 200)}`);
  return b as T;
}

/**
 * O nginx limita o login a 5 por minuto por IP, com rajada de 3 (docker/nginx/default.conf). Por
 * isso o roteiro entra uma vez por usuário, pela tela, e reaproveita o JWT que o app gravou: são
 * 4 logins por rodada, contando o do globalSetup.
 */
export const LOGIN_LIMIT_HINT =
  'O nginx limita /auth/login a 5 por minuto por IP (docker/nginx/default.conf): espere um minuto e rode de novo.';

/** Chave do persist da sessão do app-pms (apps/pms/src/stores/auth.ts). */
export const AUTH_STORAGE_KEY = 'hotel-pms-auth';

/** Lista que a API devolve ora crua, ora em `{ data }`. */
export const rows = <T>(res: T[] | { data: T[] }): T[] => (Array.isArray(res) ? res : res.data);

/** `docker compose -p <projeto> ...` a partir da raiz do repositório. */
export const compose = (...args: string[]): string =>
  execFileSync('docker', ['compose', '-p', COMPOSE_PROJECT, ...args], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

export const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** CPF válido e novo a cada chamada: o cadastro do balcão recusa CPF repetido no hotel. */
export function cpf(): string {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const len of [9, 10]) {
    const s = d.slice(0, len).reduce((acc, n, i) => acc + n * (len + 1 - i), 0);
    d.push(((s * 10) % 11) % 10);
  }
  const t = d.join('');
  return `${t.slice(0, 3)}.${t.slice(3, 6)}.${t.slice(6, 9)}-${t.slice(9)}`;
}

export type Session = { context: BrowserContext; page: Page; token: string };

/**
 * Abre um contexto, entra pela tela de login e devolve a página já autenticada, com o JWT que o
 * app gravou (as conferências pela API usam o mesmo, sem um segundo login). Erro de JavaScript na
 * página vai para `errors`: o roteiro falha se aparecer algum.
 */
export async function session(
  browser: Browser,
  email: string,
  errors: string[],
  viewport = { width: 1280, height: 900 },
): Promise<Session> {
  const mobile = viewport.width < 500;
  const context = await browser.newContext({ viewport, baseURL: APP_URL, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${email}: ${e.message}`));
  await page.goto('/login');
  await page.getByLabel(/e-mail/i).fill(email);
  // Nome exato: o login da T-10.1 (#181) tem o botão "Mostrar senha", e /senha/i acha os dois
  // (o campo e o botão), o que quebra o fill no modo estrito do Playwright.
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  const [login] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Entrar' }).click(),
  ]);
  if (login.status() === 429) throw new Error(`[e2e] login de ${email} recusado com 429. ${LOGIN_LIMIT_HINT}`);
  if (!login.ok()) throw new Error(`[e2e] login de ${email} pela tela deu HTTP ${login.status()}.`);
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
  const raw = await page.evaluate((key) => localStorage.getItem(key), AUTH_STORAGE_KEY);
  const token = raw ? (JSON.parse(raw) as { state?: { token?: string } }).state?.token : undefined;
  if (!token) throw new Error(`[e2e] o app não gravou a sessão de ${email} em ${AUTH_STORAGE_KEY}.`);
  return { context, page, token };
}
