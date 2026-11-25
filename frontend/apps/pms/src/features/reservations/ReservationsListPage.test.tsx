// Lista de reservas na identidade da SPEC-10 (F5, 25/11), renderizada no servidor com o cache preenchido.
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { todayISO } from '@hotel/domain';

vi.mock('../../lib/api.js', () => ({ api: { GET: vi.fn() } }));

import { ReservationsListPage } from './ReservationsListPage.js';
import { reservationKeys } from './queries.js';
import { presetRange } from './reservationLogic.js';

// O mesmo PAGE_SIZE da página.
const PAGE = 20;

function render() {
  const { from, to } = presetRange('next7', todayISO());
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(reservationKeys.list({ from, to, page: 1, limit: PAGE }), {
    data: [
      { id: 'r1', status: 'CHECKED_IN', check_in_date: '2026-11-24', check_out_date: '2026-11-26', total_amount: '300.00', guest: { full_name: 'Ana Hospedada' }, room: { number: '101' } },
    ],
    total: 1,
    page: 1,
    limit: PAGE,
  });
  return renderToString(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ReservationsListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('lista de reservas (SPEC-10, F5)', () => {
  it('atalhos de período num grupo segmentado: o ativo tingido, não o primário sólido', () => {
    const html = render();
    const grupo = html.slice(html.indexOf('aria-label="Atalhos de período"'), html.indexOf('</div>', html.indexOf('aria-label="Atalhos de período"')));
    expect(grupo).toMatch(/aria-pressed="true"[^>]*bg-brand\/10|bg-brand\/10[^>]*aria-pressed="true"/);
    expect(grupo).not.toMatch(/ bg-brand /);
  });

  it('celular: o quarto em destaque e uma linha curta "Quarto 101 · 24/11 → 26/11 · 2 diárias" dentro do link', () => {
    const html = render();
    expect(html).toContain('aria-hidden="true" title="101"');
    const link = html.match(/<a [^>]*href="\/reservas\/r1"[^>]*>([^]*?)<\/a>/)?.[1] ?? '';
    expect(link).toContain('Ana Hospedada');
    expect(link).toContain('Quarto 101 · 24/11 → 26/11 · 2 diárias');
  });

  it('a tabela é a do @hotel/ui: legenda e cabeçalho legível', () => {
    const html = render();
    expect(html).toMatch(/<caption class="sr-only">Reservas de /);
    expect(html).toMatch(/<thead class="[^"]*text-gray-600/);
  });
});

describe('nova reserva no celular (critique da F4, P2)', async () => {
  const { readFileSync } = await import('node:fs');
  const fonte = readFileSync(new URL('./NewReservationPage.tsx', import.meta.url), 'utf-8');

  it('abaixo do lg, o "Confirmar" fica numa barra presa acima da barra do celular, com o valor', () => {
    const barra = fonte.slice(fonte.indexOf('data-area="confirmar-celular"'));
    expect(barra).toMatch(/className="sticky bottom-\[calc\(var\(--tabbar,3rem\)\+max\(6px,env\(safe-area-inset-bottom\)\)\)\][^"]*lg:hidden/);
    expect(barra).toContain('quote.totalCents');
    expect(barra).toContain("'Confirmar reserva'");
  });

  it('um "Confirmar" visível por largura: o do resumo só a partir do lg', () => {
    expect(fonte.match(/'Confirmar reserva'/g)).toHaveLength(2);
    expect(fonte).toMatch(/className="hidden lg:inline-flex"\s+disabled=\{blockers\.length > 0/);
  });
});
