import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// A lista da comanda com duas contas abertas, sem rede nem fila.
vi.mock('./queries.js', () => ({
  useOpenAccounts: () => ({
    data: [
      { id: 'a1', label: 'Mesa 3', opened_at: '2026-11-26T15:10:00Z' },
      { id: 'a2', label: 'Suíte 106', opened_at: '2026-11-22T17:00:00Z' },
    ],
    isLoading: false,
    isError: false,
    fetchStatus: 'idle',
    refetch: () => undefined,
  }),
}));
vi.mock('./queueStore.js', () => ({ useQueueEntries: () => [], useQueueRunner: () => undefined }));

const { AccountsListPage } = await import('./AccountsListPage.js');

/** Os botões "Abrir conta" renderizados, com as classes do botão e do invólucro de cada um. */
function openButtons() {
  const html = renderToString(
    <MemoryRouter>
      <AccountsListPage />
    </MemoryRouter>,
  );
  // Sem DOM no ambiente de teste: o invólucro de cada botão vem logo antes dele no HTML.
  return [...html.matchAll(/<div class="([^"]*)"><button[^>]*class="([^"]*)"[^>]*>Abrir conta<\/button>/g)].map((m) => ({
    parent: m[1] ?? '',
    own: m[2] ?? '',
  }));
}

// O e2e roda em 1280 px e só passa pelo botão do cabeçalho; este teste protege o do pé, que o garçom
// usa no celular (🟡2 do qa-redteam da largura das listas, 26/11).
describe('AccountsListPage — "Abrir conta" em cada largura (R-7 revista em 26/11)', () => {
  it('tem um botão no cabeçalho (só no lg+) e outro no pé (só abaixo do lg)', () => {
    const botoes = openButtons();
    expect(botoes).toHaveLength(2);
    const [cabecalho, pe] = botoes;
    expect(cabecalho?.parent.split(' ')).toEqual(expect.arrayContaining(['hidden', 'lg:flex']));
    expect(pe?.parent.split(' ')).toContain('lg:hidden');
    expect(pe?.parent).toContain('sticky');
  });
});
