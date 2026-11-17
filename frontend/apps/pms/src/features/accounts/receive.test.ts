import { describe, expect, it } from 'vitest';
import { canReceive } from './receive.js';

// Pagamento da mesa e do day-use (combinado com o Gabriel em 16/11): a conta sem reserva não tinha
// tela de pagamento. Lista do que PODE receber (fail-safe): tipo novo fica de fora até alguém decidir.
describe('canReceive — quais contas recebem pagamento na própria tela', () => {
  it.each(['TABLE', 'DIRECT', 'DAY_USE'])('%s aberta, sem reserva: recebe', (type) => {
    expect(canReceive({ type, status: 'OPEN', reservation_id: null })).toBe(true);
  });

  it('conta da suíte (ROOM) não: ela é paga pela reserva, onde o crédito cobre todas as contas (D-45)', () => {
    expect(canReceive({ type: 'ROOM', status: 'OPEN', reservation_id: 'r1' })).toBe(false);
  });

  it('ROOM não recebe aqui nem sem reserva: o tipo, sozinho, já fica fora da lista', () => {
    expect(canReceive({ type: 'ROOM', status: 'OPEN', reservation_id: null })).toBe(false);
  });

  it('qualquer conta com reserva não: o pagamento vai pela reserva', () => {
    expect(canReceive({ type: 'DAY_USE', status: 'OPEN', reservation_id: 'r1' })).toBe(false);
  });

  it('INTERNAL não: consumo interno nunca é receita (o backend recusa)', () => {
    expect(canReceive({ type: 'INTERNAL', status: 'OPEN', reservation_id: null })).toBe(false);
  });

  it.each(['CLOSED', 'PAID'])('conta %s não recebe por esta tela', (status) => {
    expect(canReceive({ type: 'TABLE', status, reservation_id: null })).toBe(false);
  });

  it('tipo desconhecido fica de fora (allowlist)', () => {
    expect(canReceive({ type: 'NOVO', status: 'OPEN', reservation_id: null })).toBe(false);
    expect(canReceive({})).toBe(false);
  });
});
