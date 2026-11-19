import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Teste do componente sem DOM: o cliente HTTP é trocado por dublê, as queries são resolvidas
// antes (prefetch pelo mesmo queryFn da tela) e a página é renderizada em HTML. Basta para
// provar o que entra no comprovante — sem trazer jsdom só para isso.
const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ api }));
// Dublê da sessão: no render de servidor o zustand v5 lê o estado INICIAL da store (sem usuário),
// então um setState no teste não chega à tela. O papel controla se o hotel é buscado.
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string; role: string } }));
vi.mock('../../stores/auth.js', () => ({
  useAuthStore: (select: (s: typeof session) => unknown) => select(session),
}));

import { myTenantOptions } from '../tenant/index.js';
import { ReservationReceiptPage } from './ReservationReceiptPage.js';
import { reservationKeys } from './queries.js';
import { getBill, getReservation } from './reservationsApi.js';

const reservation = {
  id: 'res1',
  status: 'CHECKED_IN',
  check_in_date: '2026-11-20',
  check_out_date: '2026-11-22',
  guest: { full_name: 'Maria Oliveira', cpf: '12345678901' },
  rooms: [{ id: 'r1', number: '101' }],
};

const bill = {
  status: 'CHECKED_IN',
  check_in_date: '2026-11-20',
  check_out_date: '2026-11-22',
  room_total: 300,
  balance_due: 300,
  consumptions: [],
  payments: [],
};

function reply(status: number, body: unknown) {
  const ok = status >= 200 && status < 300;
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status, ok } };
}

function backend(tenant: { status: number; body: unknown }) {
  api.GET.mockImplementation(async (path: string) => {
    if (path === '/tenants/me') return reply(tenant.status, tenant.body);
    if (path === '/reservations/{id}') return reply(200, reservation);
    if (path === '/reservations/{id}/bill') return reply(200, bill);
    return reply(404, { error: 'rota fora do teste' });
  });
}

async function renderReceipt({ prefetchTenant = true } = {}) {
  // retryOnMount: false — sem isso, uma consulta que falhou no prefetch volta a "carregando" ao
  // montar, e o teste do 500 nunca via a página com o hotel em erro (🟡-1 do qa-redteam).
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  await Promise.all([
    client.prefetchQuery({ queryKey: reservationKeys.detail('res1'), queryFn: () => getReservation('res1') }),
    client.prefetchQuery({ queryKey: reservationKeys.bill('res1'), queryFn: () => getBill('res1') }),
    prefetchTenant ? client.prefetchQuery(myTenantOptions()) : Promise.resolve(),
  ]);
  if (prefetchTenant) expect(client.getQueryState(myTenantOptions().queryKey)?.status).not.toBe('pending');
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/reservas/res1/comprovante']}>
        <Routes>
          <Route path="/reservas/:id/comprovante" element={<ReservationReceiptPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// O Link do react-router usa useLayoutEffect, que o React avisa não rodar no servidor. Esperado
// neste tipo de teste; só esse aviso é calado, qualquer outro erro continua aparecendo.
const consoleError = console.error.bind(console);
const asRole = (role: 'ADMIN' | 'RECEPTIONIST' | 'WAITER') => {
  session.user = { id: `u-${role}`, name: 'Ana', email: 'ana@x.test', role };
};

beforeEach(() => {
  api.GET.mockReset();
  // Recepção logada: a consulta do hotel só liga para quem pode lê-lo (sem isso o teste de
  // "carregando" passava com a consulta desligada — 🟡 do qa-redteam de 16/11).
  asRole('RECEPTIONIST');
  vi.spyOn(console, 'error').mockImplementation((msg: unknown, ...rest: unknown[]) => {
    if (typeof msg === 'string' && msg.includes('useLayoutEffect does nothing on the server')) return;
    consoleError(msg, ...rest);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  session.user = null;
});

describe('ReservationReceiptPage — emissor no topo (T-09.1)', () => {
  it('mostra o nome do hotel e o CNPJ acima do comprovante (CA-09.a)', async () => {
    backend({ status: 200, body: { id: 't1', name: 'Pousada Aurora', legal_id: '12.345.678/0001-90' } });
    const html = await renderReceipt();
    expect(html).toContain('Pousada Aurora');
    expect(html).toContain('CNPJ 12.345.678/0001-90');
    expect(html.indexOf('Pousada Aurora')).toBeLessThan(html.indexOf('Comprovante de conta'));
    expect(html).toContain('Maria Oliveira');
  });

  it('sem CNPJ cadastrado, mostra só o nome', async () => {
    backend({ status: 200, body: { id: 't2', name: 'Hotel Sol', legal_id: null } });
    const html = await renderReceipt();
    expect(html).toContain('Hotel Sol');
    expect(html).not.toContain('CNPJ');
  });

  it('com /tenants/me em 500, o comprovante aparece sem cabeçalho e sem erro (CA-09.b)', async () => {
    backend({ status: 500, body: { error: 'Erro interno do servidor' } });
    const html = await renderReceipt();
    expect(api.GET).toHaveBeenCalledWith('/tenants/me');
    expect(html).toContain('Comprovante de conta');
    expect(html).toContain('Maria Oliveira');
    expect(html).toContain('Imprimir');
    expect(html).not.toContain('CNPJ');
    expect(html).not.toContain('Não foi possível');
    expect(html).not.toContain('Buscando o nome do hotel');
  });

  it('com o hotel ainda carregando, o comprovante aparece e avisa, sem bloquear a impressão', async () => {
    backend({ status: 200, body: { id: 't1', name: 'Pousada Aurora', legal_id: null } });
    const html = await renderReceipt({ prefetchTenant: false });
    expect(html).toContain('Comprovante de conta');
    expect(html).toContain('Imprimir');
    expect(html).toContain('Buscando o nome do hotel');
    expect(html).not.toContain('Pousada Aurora');
  });

  it('papel sem acesso ao hotel: não pergunta e não fica em "Buscando…" para sempre', async () => {
    asRole('WAITER');
    backend({ status: 200, body: { id: 't1', name: 'Pousada Aurora', legal_id: null } });
    const html = await renderReceipt({ prefetchTenant: false });
    expect(html).toContain('Comprovante de conta');
    expect(html).not.toContain('Buscando o nome do hotel');
    expect(api.GET).not.toHaveBeenCalledWith('/tenants/me');
  });
});
