import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Detalhe da reserva renderizado no servidor, no padrão do ReservationReceiptPage.test.tsx: o
// cliente HTTP é dublê e as queries são resolvidas antes. Prova a hierarquia de ações da T-08.3
// (CA-08.e) na tela de verdade, não só na função (🟡-2 do qa-redteam de 15/11).
const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ api }));
// No render do servidor o zustand lê o estado inicial (sem usuário): o papel entra por dublê.
const session = vi.hoisted(() => ({ user: null as { role: string } | null }));
vi.mock('../../stores/auth.js', () => ({
  useAuthStore: <T,>(select: (s: typeof session) => T) => select(session),
}));

import { ReservationDetailPage } from './ReservationDetailPage.js';
import { reservationKeys } from './queries.js';
import { getBill, getReservation } from './reservationsApi.js';

function reply(status: number, body: unknown) {
  const ok = status >= 200 && status < 300;
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status, ok } };
}

async function renderDetail(status: string, { aba }: { aba?: 'conta' } = {}) {
  const reservation = {
    id: 'res1',
    status,
    check_in_date: '2026-11-20',
    check_out_date: '2026-11-22',
    total_amount: '300.00',
    room_id: 'r1',
    guest: { id: 'g1', full_name: 'Maria Oliveira', cpf: '12345678901' },
    rooms: [{ id: 'r1', number: '101' }],
  };
  const bill = { status, check_in_date: '2026-11-20', check_out_date: '2026-11-22', room_total: 300, balance_due: 300, consumptions: [], payments: [] };
  api.GET.mockImplementation(async (path: string) => {
    if (path === '/reservations/{id}') return reply(200, reservation);
    if (path === '/reservations/{id}/bill') return reply(200, bill);
    return reply(404, { error: 'rota fora do teste' });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  await Promise.all([
    client.prefetchQuery({ queryKey: reservationKeys.detail('res1'), queryFn: () => getReservation('res1') }),
    client.prefetchQuery({ queryKey: reservationKeys.bill('res1'), queryFn: () => getBill('res1') }),
  ]);
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[aba ? `/reservas/res1?aba=${aba}` : '/reservas/res1']}>
        <Routes>
          <Route path="/reservas/:id" element={<ReservationDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Botões primary na tela: o Button de @hotel/ui leva `bg-brand text-brand-fg` só nessa variante. */
function primaryButtons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*class="[^"]*bg-brand text-brand-fg[^"]*"[^>]*>(.*?)<\/button>/g)].map((m) =>
    (m[1] ?? '').replace(/<[^>]+>/g, '').trim(),
  );
}

const consoleError = console.error.bind(console);
beforeEach(() => {
  api.GET.mockReset();
  vi.spyOn(console, 'error').mockImplementation((msg: unknown, ...rest: unknown[]) => {
    if (typeof msg === 'string' && msg.includes('useLayoutEffect does nothing on the server')) return;
    consoleError(msg, ...rest);
  });
});
afterEach(() => vi.restoreAllMocks());

describe('ReservationDetailPage — uma ação principal (T-08.3, CA-08.e)', () => {
  it('CHECKED_IN: um único primary, o check-out', async () => {
    expect(primaryButtons(await renderDetail('CHECKED_IN'))).toEqual(['Fazer check-out']);
  });

  it('CHECKED_OUT e CANCELLED: nenhum primary, e as ações seguem visíveis com o motivo (CA-08.f)', async () => {
    for (const status of ['CHECKED_OUT', 'CANCELLED']) {
      const html = await renderDetail(status);
      expect(primaryButtons(html), status).toEqual([]);
      expect(html, status).toContain('Fazer check-in');
      expect(html, status).toContain('Cancelar reserva');
      expect(html, status).toContain('acao-cancelar-motivo');
    }
  });
});

describe('ReservationDetailPage — saldo a receber (decisão de 16/11, CA-08.e)', () => {
  afterEach(() => {
    session.user = null;
  });

  it('CHECKED_IN com saldo, recepção na aba Conta: só "Registrar pagamento" em primary', async () => {
    session.user = { role: 'RECEPTIONIST' };
    const html = await renderDetail('CHECKED_IN', { aba: 'conta' });
    expect(primaryButtons(html)).toEqual(['Registrar pagamento']);
    expect(html).toContain('Fazer check-out');
  });

  it('aba Resumo (a padrão), com saldo: o check-out segue principal — o pagamento só existe na Conta (redteam da T-08.6, 🟡2)', async () => {
    session.user = { role: 'RECEPTIONIST' };
    expect(primaryButtons(await renderDetail('CHECKED_IN'))).toEqual(['Fazer check-out']);
  });

  it('sem quem possa receber (sessão vazia): o check-out continua a principal', async () => {
    expect(primaryButtons(await renderDetail('CHECKED_IN', { aba: 'conta' }))).toEqual(['Fazer check-out']);
  });
});

describe('ReservationDetailPage — regra dos hooks', () => {
  // Um hook depois de um `return` antecipado muda a ordem dos hooks entre "carregando" e
  // "carregado" e a tela fica em branco (aconteceu em 15/11 com o foco da confirmação do
  // check-out). O render no servidor roda uma vez só e não pega isso; esta checagem pega.
  it('nenhum hook depois do primeiro return antecipado do componente', () => {
    const src = readFileSync(new URL('./ReservationDetailPage.tsx', import.meta.url), 'utf-8');
    const start = src.indexOf('export function ReservationDetailPage(');
    const end = src.indexOf('\nfunction ', start);
    const body = src.slice(start, end === -1 ? undefined : end);
    const firstReturn = body.search(/\n {2}if \([^\n]*\) return /);
    expect(firstReturn).toBeGreaterThan(0);
    const hooksAfter = body.slice(firstReturn).match(/\buse[A-Z]\w*\(/g) ?? [];
    expect(hooksAfter).toEqual([]);
  });
});
