import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StaffActions } from './StaffActions.js';
import type { AccountDetail } from '../accountsApi.js';

// "Receber" na conta da mesa (16/11): a recepção registra um pagamento por pagante, dividindo por valor.
function render(account: Partial<AccountDetail>) {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <StaffActions account={{ id: 'a1', label: 'Mesa 3', items: [], ...account } as AccountDetail} pendingCount={0} totalCents={18000} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StaffActions — receber na conta sem reserva', () => {
  it('mesa aberta: botão Receber, que abre e fecha o painel do pagamento', () => {
    expect(render({ type: 'TABLE', status: 'OPEN', reservation_id: null })).toMatch(
      /<button(?=[^>]*aria-expanded="false")(?=[^>]*aria-controls="receber-a1")[^>]*>Receber<\/button>/,
    );
  });

  it('conta da suíte: sem Receber (paga pela reserva)', () => {
    expect(render({ type: 'ROOM', status: 'OPEN', reservation_id: 'r1' })).not.toContain('>Receber<');
  });
});
