import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReceivePanel } from './ReceivePanel.js';
import { accountKeys } from '../queries.js';

// Painel "Receber" da mesa, do balcão e do day-use (16/11). 🟢-1 do red team: ele não tinha teste.
function render(bill: { balance: string; payments_made?: string }, accountStatus = 'OPEN') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(accountKeys.bill('a1'), { total: '198.00', payments_made: '0.00', ...bill });
  return renderToString(
    <QueryClientProvider client={client}>
      <ReceivePanel accountId="a1" panelId="receber-a1" accountStatus={accountStatus} />
    </QueryClientProvider>,
  );
}

const text = (html: string) => html.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;| /g, ' ');

describe('ReceivePanel', () => {
  it('com saldo: mostra o saldo e o formulário já preenchido com ele', () => {
    const html = render({ balance: '198.00' });
    expect(text(html)).toMatch(/Saldo a receber: R\$ 198,00\./);
    expect(html).toMatch(/<input[^>]*value="198,00"/);
    expect(html).toContain('Registrar pagamento');
  });

  it('com pagamento parcial: diz quanto já foi pago e o que falta', () => {
    const t = text(render({ balance: '78.00', payments_made: '120.00' }));
    expect(t).toMatch(/Saldo a receber: R\$ 78,00 · já pago: R\$ 120,00/);
  });

  it('saldo zero, conta aberta: nada a receber, pode fechar', () => {
    const t = text(render({ balance: '0.00' }, 'OPEN'));
    expect(t).toContain('Nada a receber. A conta pode ser fechada.');
    expect(t).not.toContain('Registrar pagamento');
  });

  // Ajuste de 16/11: a mesa fechada que quita vira PAID, e o painel diz isso, não "pode ser fechada".
  it('saldo zero, conta PAID: conta quitada', () => {
    const t = text(render({ balance: '0.00' }, 'PAID'));
    expect(t).toContain('Nada a receber. Conta quitada.');
    expect(t).not.toContain('pode ser fechada');
  });

  it('saldo negativo: mostra o crédito, sem formulário', () => {
    const t = text(render({ balance: '-2.00' }, 'PAID'));
    expect(t).toMatch(/Crédito do cliente: R\$ 2,00\. Conta quitada\./);
    expect(t).not.toContain('Registrar pagamento');
  });
});
