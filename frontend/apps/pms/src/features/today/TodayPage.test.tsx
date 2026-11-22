import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { todayISO } from '@hotel/domain';

// Ligação do painel Hoje com os estados de rede (SPEC-11, T-11.4; 🟡-1 do qa-redteam de 22/11).
// Render no servidor, no padrão do GuestDetailPage.test: com o onlineManager offline, a consulta
// sai pausada (pending + paused), que é o que o balcão vê sem rede. A faixa do topo nasce depois
// da montagem (região viva) e fica para o navegador.
const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ api }));
const session = vi.hoisted(() => ({ user: { id: 'u1', role: 'RECEPTIONIST' } }));
vi.mock('../../stores/auth.js', () => ({
  useAuthStore: <T,>(select: (s: typeof session) => T) => select(session),
}));

import { TodayPage } from './TodayPage.js';
import { REFRESH, todayKeys } from './queries.js';
import { analyticsKeys } from '../analytics/queries.js';

const TODAY = todayISO();
const page = (data: unknown[]) => ({ data, total: data.length });
const ANA = { id: 'r1', status: 'CHECKED_IN', check_in_date: TODAY, check_out_date: '2099-01-02', guest: { full_name: 'Ana Hospedada' }, room: { number: '101' } };

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
}

function render(qc: QueryClient) {
  return renderToString(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => api.GET.mockReset());
afterEach(() => onlineManager.setOnline(true));

describe('TodayPage sem rede', () => {
  it('sem dado: blocos, alertas e cartões dizem sem conexão, sem "Carregando…" nem vazio falso', () => {
    onlineManager.setOnline(false);
    const html = render(client());
    expect(html).toContain('Sem conexão. A lista aparece quando a rede voltar.');
    expect(html).toContain('Sem conexão. Os alertas aparecem quando a rede voltar.');
    expect(html).toContain('Sem conexão. Os números aparecem quando a rede voltar.');
    expect(html).not.toContain('Carregando');
    expect(html).not.toContain('Nenhuma chegada para hoje.');
    expect(api.GET).not.toHaveBeenCalled();
  });

  it('com dado e o refetch falhando (Wi-Fi sem internet): a lista fica, sem trocar pelo erro (🟡-2)', async () => {
    const qc = client();
    qc.setQueryData(todayKeys.inHouse('u1'), page([ANA]));
    await qc.prefetchQuery({ queryKey: todayKeys.inHouse('u1'), queryFn: () => Promise.reject(new Error('Falha ao carregar reservas.')) });
    expect(qc.getQueryState(todayKeys.inHouse('u1'))?.status).toBe('error');
    const html = render(qc);
    expect(html).toContain('Ana Hospedada');
    expect(html).not.toContain('Falha ao carregar reservas.');
  });
});

describe('TodayPage — cartões acompanham o painel (CA-11.g)', () => {
  it('a ocupação recarrega no mesmo ritmo das outras consultas do painel', () => {
    onlineManager.setOnline(false); // sem rede: nenhuma consulta sai, só as opções ficam no cache
    const qc = client();
    render(qc);
    const occupancy = qc.getQueryCache().find({ queryKey: analyticsKeys.occupancy('u1', TODAY) });
    expect(occupancy?.options).toMatchObject({ refetchInterval: REFRESH });
  });
});
