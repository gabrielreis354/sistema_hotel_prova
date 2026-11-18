import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StaffActions } from './StaffActions.js';
import type { AccountDetail } from '../accountsApi.js';

// "Receber" na conta da mesa (16/11): a recepção registra um pagamento por pagante, dividindo por valor.
function render(account: Partial<AccountDetail>, pendingCount = 0, receiving = false) {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <StaffActions
          account={{ id: 'a1', label: 'Mesa 3', items: [], ...account } as AccountDetail}
          pendingCount={pendingCount}
          totalCents={18000}
          receiving={receiving}
          onToggleReceive={() => {}}
        />
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

  // 🟡-2 do red team: com a fila deste aparelho descarregando, o saldo muda e o formulário se refaz.
  it('com lançamento na fila: Receber desabilitado, com o motivo', () => {
    const html = render({ type: 'TABLE', status: 'OPEN', reservation_id: null }, 2);
    expect(html).toMatch(/<button(?=[^>]*disabled="")(?=[^>]*aria-describedby="receive-blocked-reason")[^>]*>Receber<\/button>/);
    expect(html).toContain('Espere os lançamentos da fila chegarem ao sistema.');
  });

  it('mesa fechada: Receber continua (decisão de 16/11)', () => {
    expect(render({ type: 'TABLE', status: 'CLOSED', reservation_id: null })).toMatch(/>Receber<\/button>/);
  });

  // A mesa quitada vira PAID com o painel aberto: o botão que o esconde não pode sumir junto.
  it('conta PAID com o painel aberto: "Esconder pagamento" continua', () => {
    expect(render({ type: 'TABLE', status: 'PAID', reservation_id: null }, 0, true)).toMatch(
      /<button(?=[^>]*aria-expanded="true")[^>]*>Esconder pagamento<\/button>/,
    );
  });

  it('conta PAID com o painel fechado: sem Receber, já está quitada', () => {
    expect(render({ type: 'TABLE', status: 'PAID', reservation_id: null })).not.toContain('>Receber<');
  });

  it('conta da suíte: sem Receber (paga pela reserva)', () => {
    expect(render({ type: 'ROOM', status: 'OPEN', reservation_id: 'r1' })).not.toContain('>Receber<');
  });
});
