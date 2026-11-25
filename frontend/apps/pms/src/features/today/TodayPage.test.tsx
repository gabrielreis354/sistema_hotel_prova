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
import { roomKeys } from '../rooms/queries.js';

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
    expect(html).toContain('Sem conexão. Os quartos aparecem quando a rede voltar.');
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
    // O onlineManager diz online, então a faixa do topo não aparece: o próprio bloco avisa que o
    // dado pode estar velho, senão a recepção atende uma chegada que outro já atendeu (revisão de 22/11).
    expect(html).toContain('Não foi possível atualizar');
  });

  it('com dado e o refetch em dia: nenhum aviso de dado velho', () => {
    const qc = client();
    qc.setQueryData(todayKeys.inHouse('u1'), page([ANA]));
    const html = render(qc);
    expect(html).toContain('Ana Hospedada');
    expect(html).not.toContain('Não foi possível atualizar');
  });
});

/** Todas as consultas do painel com dado e o último refetch falhando (Wi-Fi sem internet). */
async function allStale(qc: QueryClient) {
  const fail = () => Promise.reject(new Error('Falha no refetch.'));
  const seeded: Array<[readonly unknown[], unknown]> = [
    [todayKeys.inHouse('u1'), page([ANA])],
    [todayKeys.arrivals('u1', TODAY), page([])],
    [todayKeys.alerts('u1'), { noShowIds: new Set<string>(), cleaning: [], pendingTooLong: 0 }],
    [roomKeys.all, [{ id: 'q1', number: '101', floor: 1, status: 'OCCUPIED', category: { name: 'Standard' } }]],
  ];
  for (const [key, data] of seeded) {
    qc.setQueryData(key, data);
    await qc.prefetchQuery({ queryKey: key, queryFn: fail });
  }
}

const notices = (html: string) => html.split('Não foi possível atualizar').length - 1;

describe('TodayPage — dado velho com o aparelho online', () => {
  it('fita, Atenção, Chegadas, Saídas, Na casa e Em limpeza avisam, cada um no seu bloco', async () => {
    const qc = client();
    await allStale(qc);
    expect(notices(render(qc))).toBe(6);
  });

  it('sem rede, nenhum bloco repete o aviso: a faixa do topo já explica', async () => {
    const qc = client();
    await allStale(qc);
    onlineManager.setOnline(false);
    expect(notices(render(qc))).toBe(0);
  });
});

describe('TodayPage — a fita acompanha o painel (CA-11.g)', () => {
  it('os quartos da fita recarregam no mesmo ritmo das outras consultas do painel', () => {
    onlineManager.setOnline(false); // sem rede: nenhuma consulta sai, só as opções ficam no cache
    const qc = client();
    render(qc);
    const quartos = qc.getQueryCache().find({ queryKey: roomKeys.all });
    expect(quartos?.options).toMatchObject({ refetchInterval: REFRESH });
  });

  it('a fita não depende do analytics: o painel não busca mais a ocupação dele', () => {
    onlineManager.setOnline(false);
    const qc = client();
    render(qc);
    expect(qc.getQueryCache().findAll({ queryKey: ['analytics'] }).map((q) => q.queryKey[2])).toEqual(['alerts']);
  });
});

describe('TodayPage — fita e Atenção com fontes faltando (qa-redteam da F3)', () => {
  const QUARTOS = [
    { id: 'q1', number: '101', floor: 1, status: 'AVAILABLE', category: { name: 'Standard' } },
    { id: 'q2', number: '102', floor: 1, status: 'MAINTENANCE', category: { name: 'Standard' } },
  ];

  it('🟡1: sem as chegadas a fita não monta, em vez de mostrar o quarto reservado como "Livre"', () => {
    onlineManager.setOnline(false);
    const qc = client();
    qc.setQueryData(roomKeys.all, QUARTOS);
    qc.setQueryData(todayKeys.inHouse('u1'), page([]));
    const html = render(qc);
    expect(html).not.toContain('Quarto 101, Livre');
    expect(html).toContain('Sem conexão. Os quartos aparecem quando a rede voltar.');
  });

  it('🟡4: com o analytics fora, o chip da manutenção (que vem do core) continua no Atenção', async () => {
    const qc = client();
    qc.setQueryData(roomKeys.all, QUARTOS);
    qc.setQueryData(todayKeys.inHouse('u1'), page([]));
    qc.setQueryData(todayKeys.arrivals('u1', TODAY), page([]));
    await qc.prefetchQuery({ queryKey: todayKeys.alerts('u1'), queryFn: () => Promise.reject(new Error('Analytics fora.')) });
    const html = render(qc);
    expect(html).toContain('Analytics fora.');
    expect(html).toContain('quarto em manutenção');
    expect(html).not.toContain('Nada pedindo atenção agora.');
  });
});
