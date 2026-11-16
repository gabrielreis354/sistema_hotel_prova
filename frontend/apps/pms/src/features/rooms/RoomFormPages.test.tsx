import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Edição do quarto que não carrega, renderizada no servidor (padrão do ReservationDetailPage.test).
// O erro do quarto manda: 404 do quarto é "não encontrado" mesmo com as categorias carregadas, e
// falha só das categorias é "Tentar de novo" (LoadError, T-08.6).
const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ api }));

import { RoomEditPage } from './RoomFormPages.js';
import { categoryKeys, roomKeys } from './queries.js';
import { getRoom, listCategories } from './roomsApi.js';

function reply(status: number, body: unknown) {
  const ok = status >= 200 && status < 300;
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status, ok } };
}

async function renderEdit({ room, categories }: { room: number; categories: number }) {
  api.GET.mockImplementation(async (p: string) => {
    if (p === '/rooms/{id}') return reply(room, room === 200 ? { id: 'q1', number: '101', status: 'AVAILABLE', category_id: 'c1' } : { error: 'x' });
    if (p === '/room-categories') return reply(categories, categories === 200 ? [{ id: 'c1', name: 'Std', price_per_night: '100.00' }] : { error: 'x' });
    return reply(404, { error: 'rota fora do teste' });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  await Promise.all([
    client.prefetchQuery({ queryKey: roomKeys.detail('q1'), queryFn: () => getRoom('q1') }),
    client.prefetchQuery({ queryKey: categoryKeys.all, queryFn: listCategories }),
  ]);
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/quartos/q1/editar']}>
        <Routes>
          <Route path="/quartos/:id/editar" element={<RoomEditPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RoomEditPage — quarto que não carrega', () => {
  it('404 do quarto, categorias em dia: "não encontrado", sem "Tentar de novo"', async () => {
    const html = await renderEdit({ room: 404, categories: 200 });
    expect(html).toContain('Quarto não encontrado');
    expect(html).not.toContain('Tentar de novo');
  });

  it('quarto em dia, categorias com 500: "Tentar de novo", nunca "não encontrado"', async () => {
    const html = await renderEdit({ room: 200, categories: 500 });
    expect(html).toContain('Tentar de novo');
    expect(html).not.toContain('não encontrado');
  });
});
