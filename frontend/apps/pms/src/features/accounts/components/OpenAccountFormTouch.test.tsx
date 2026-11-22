import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OpenAccountForm } from './OpenAccountForm.js';

// 🟡-4 do qa-explorador de 22/11: o "Nome na comanda" tinha 42 px no celular, abaixo dos 48 px do
// CA-05.5.i. A busca da mesma tela já usa min-h-touch. O render no servidor não mede altura; o
// teste confere a classe do alvo de toque no próprio campo.
function inputTag(): string {
  const html = renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <OpenAccountForm openAccounts={[]} onOpened={() => {}} onCancel={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return html.match(/<input[^>]*id="account-label"[^>]*>/)?.[0] ?? '';
}

describe('OpenAccountForm — alvo de toque do nome na comanda', () => {
  it('o campo tem o alvo de 48 px (min-h-touch)', () => {
    expect(inputTag()).not.toBe('');
    expect(inputTag()).toMatch(/class="[^"]*\bmin-h-touch\b/);
  });
});
