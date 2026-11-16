import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Ficha do hóspede renderizada no servidor, no padrão do ReservationDetailPage.test.tsx: o
// cliente HTTP é dublê e as queries são resolvidas antes. Prende os achados 🟡-1 e 🟡-4 do
// qa-explorador de 16/11. Foco e corte da tabela no celular precisam de navegador: ficam na
// conferência manual (o app ainda não tem jsdom).
const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ api }));
// No render do servidor o zustand lê o estado inicial (sem usuário), então setState não chega à
// tela: o papel entra por dublê do store.
const session = vi.hoisted(() => ({ user: null as { role: string } | null }));
vi.mock('../../stores/auth.js', () => ({
  useAuthStore: <T,>(select: (s: typeof session) => T) => select(session),
}));

import { GuestDetailPage } from './GuestDetailPage.js';
import { guestKeys } from './queries.js';
import { getGuest } from './guestsApi.js';
import type { Role } from '../../types.js';

function reply(status: number, body: unknown) {
  const ok = status >= 200 && status < 300;
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status, ok } };
}

const GUEST = { id: 'g1', full_name: 'Maria Oliveira', cpf: '12345678901', phone: null, email: null };

async function renderGuest({ role, guestStatus = 200 }: { role: Role; guestStatus?: number }) {
  session.user = { role };
  api.GET.mockImplementation(async (path: string) => {
    if (path === '/guests/{id}') return reply(guestStatus, guestStatus === 200 ? GUEST : { error: 'x' });
    if (path === '/reservations') return reply(200, []);
    return reply(404, { error: 'rota fora do teste' });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  await client.prefetchQuery({ queryKey: guestKeys.detail('g1'), queryFn: () => getGuest('g1') });
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/hospedes/g1']}>
        <Routes>
          <Route path="/hospedes/:id" element={<GuestDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** O <button> cujo texto é exatamente `label`, com os atributos. */
function button(html: string, label: string): string | undefined {
  return [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].find(
    (m) => (m[2] ?? '').replace(/<[^>]+>/g, '').trim() === label,
  )?.[1];
}

const consoleError = console.error.bind(console);
beforeEach(() => {
  api.GET.mockReset();
  vi.spyOn(console, 'error').mockImplementation((msg: unknown, ...rest: unknown[]) => {
    if (typeof msg === 'string' && msg.includes('useLayoutEffect does nothing on the server')) return;
    consoleError(msg, ...rest);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  session.user = null;
});

describe('GuestDetailPage — Excluir só para o administrador (🟡-1, CA-08.f)', () => {
  it('recepção: Excluir na tela, desabilitado, com o motivo', async () => {
    const attrs = await renderGuest({ role: 'RECEPTIONIST' }).then((html) => button(html, 'Excluir'));
    expect(attrs).toBeDefined();
    expect(attrs).toMatch(/disabled=""/);
    expect(attrs).toMatch(/title="Só o administrador exclui hóspedes\."/);
    expect(attrs).toMatch(/aria-describedby="/);
  });

  it('recepção: o motivo aparece em texto na tela, não só em title ou sr-only (redteam de 16/11, 🟡-1)', async () => {
    const html = await renderGuest({ role: 'RECEPTIONIST' });
    const id = button(html, 'Excluir')?.match(/aria-describedby="([^"]+)"/)?.[1];
    // A tag inteira (atributos antes e depois do id) e o texto dela.
    const reason = html.match(new RegExp(`<[a-z]+([^>]*id="${id}"[^>]*)>([^<]*)<`));
    expect(reason?.[2]).toBe('Só o administrador exclui hóspedes.');
    expect(reason?.[1]).not.toContain('sr-only');
  });

  it('admin: Excluir habilitado', async () => {
    const attrs = await renderGuest({ role: 'ADMIN' }).then((html) => button(html, 'Excluir'));
    expect(attrs).toBeDefined();
    expect(attrs).not.toMatch(/disabled=""/);
  });
});

describe('GuestDetailPage — hóspede que não carrega (🟡-4)', () => {
  it('404: aviso de não encontrado e o caminho de volta, sem "Tentar de novo"', async () => {
    const html = await renderGuest({ role: 'RECEPTIONIST', guestStatus: 404 });
    expect(html).toContain('Hóspede não encontrado');
    expect(html).toContain('role="alert"');
    expect(html).toContain('href="/hospedes"');
    expect(html).not.toContain('Tentar de novo');
  });

  it('404: a volta tem alvo de toque, é a única saída da tela (redteam de 16/11, 🟡-2, CA-08.g)', async () => {
    const html = await renderGuest({ role: 'RECEPTIONIST', guestStatus: 404 });
    expect(html).toMatch(/<a[^>]*class="[^"]*min-h-touch[^"]*"[^>]*href="\/hospedes"|<a[^>]*href="\/hospedes"[^>]*class="[^"]*min-h-touch/);
  });

  it('500: não diz "não encontrado"; oferece Tentar de novo e a volta', async () => {
    const html = await renderGuest({ role: 'RECEPTIONIST', guestStatus: 500 });
    expect(html).not.toContain('não encontrado');
    expect(html).toContain('Tentar de novo');
    expect(html).toContain('href="/hospedes"');
  });
});

describe('GuestDetailPage — regra dos hooks', () => {
  it('nenhum hook depois do primeiro return antecipado do componente', () => {
    const src = readFileSync(new URL('./GuestDetailPage.tsx', import.meta.url), 'utf-8');
    const start = src.indexOf('export function GuestDetailPage(');
    const end = src.indexOf('\nfunction ', start);
    const body = src.slice(start, end === -1 ? undefined : end);
    const firstReturn = body.search(/\n {2}if \([^\n]*\) return/);
    expect(firstReturn).toBeGreaterThan(0);
    const hooksAfter = body.slice(firstReturn).match(/\buse[A-Z]\w*\(/g) ?? [];
    expect(hooksAfter).toEqual([]);
  });
});
