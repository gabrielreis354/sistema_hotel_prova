import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// O PaymentForm de verdade só decide no envio, que o renderToString não alcança. Aqui ele é trocado
// por um que mostra as props recebidas, para conferir o que o painel da mesa pede a ele.
vi.mock('../../reservations/index.js', () => ({
  PaymentForm: (props: { allowOverpay?: boolean; payer?: string; balanceCents: number; target: object }) => (
    <output data-props={JSON.stringify(props)} />
  ),
}));

import { ReceivePanel } from './ReceivePanel.js';
import { accountKeys } from '../queries.js';

function formProps() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(accountKeys.bill('a1'), { total: '198.00', payments_made: '0.00', balance: '198.00' });
  const html = renderToString(
    <QueryClientProvider client={client}>
      <ReceivePanel accountId="a1" panelId="receber-a1" accountStatus="CLOSED" />
    </QueryClientProvider>,
  );
  const raw = html.match(/data-props="([^"]*)"/)?.[1] ?? '{}';
  return JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
}

describe('ReceivePanel → PaymentForm', () => {
  // Decisão de 16/11 (🟡-3 do red team): na mesa não há a quem devolver; o troco não entra no sistema.
  it('na mesa, valor acima do saldo é recusado (allowOverpay false)', () => {
    expect(formProps().allowOverpay).toBe(false);
  });

  it('paga a própria conta, com o saldo dela e "o cliente" no texto', () => {
    expect(formProps()).toMatchObject({ target: { accountId: 'a1' }, balanceCents: 19800, payer: 'o cliente' });
  });
});
