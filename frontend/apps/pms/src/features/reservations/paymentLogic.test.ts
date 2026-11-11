import { describe, it, expect } from 'vitest';
import { formatBRL } from '@hotel/domain';
import {
  PAYMENT_METHOD_OPTIONS,
  canReceivePayment,
  freshBalanceStep,
  paymentBody,
  readPaymentAmount,
  submitStep,
} from './paymentLogic.js';

describe('canReceivePayment — quando a recepção vê o formulário (D2)', () => {
  it('hospedado ou já saído, com saldo, e quem atende o balcão', () => {
    for (const status of ['CHECKED_IN', 'CHECKED_OUT']) {
      for (const role of ['ADMIN', 'RECEPTIONIST']) {
        expect(canReceivePayment({ status, balanceCents: 1, role }), `${status} ${role}`).toBe(true);
      }
    }
  });

  it('sem saldo a receber, não há o que registrar (quitada ou a devolver)', () => {
    expect(canReceivePayment({ status: 'CHECKED_IN', balanceCents: 0, role: 'RECEPTIONIST' })).toBe(false);
    expect(canReceivePayment({ status: 'CHECKED_OUT', balanceCents: -500, role: 'RECEPTIONIST' })).toBe(false);
  });

  it('conta que não recarregou esconde o formulário: o saldo na tela pode ser o de antes do pagamento (🟡-3 do qa-redteam)', () => {
    expect(canReceivePayment({ status: 'CHECKED_IN', balanceCents: 41250, role: 'ADMIN', billFailed: true })).toBe(false);
    expect(canReceivePayment({ status: 'CHECKED_IN', balanceCents: 41250, role: 'ADMIN', billFailed: false })).toBe(true);
  });

  it('saldo ainda não carregado não mostra o formulário', () => {
    expect(canReceivePayment({ status: 'CHECKED_IN', balanceCents: null, role: 'ADMIN' })).toBe(false);
  });

  it('allowlist de status: antes do check-in, cancelada ou desconhecido ficam de fora', () => {
    for (const status of ['PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', undefined]) {
      expect(canReceivePayment({ status, balanceCents: 1000, role: 'ADMIN' }), String(status)).toBe(false);
    }
  });

  it('allowlist de papel: garçom, papel desconhecido ou sem sessão ficam de fora', () => {
    for (const role of ['WAITER', 'MANAGER', undefined]) {
      expect(canReceivePayment({ status: 'CHECKED_IN', balanceCents: 1000, role }), String(role)).toBe(false);
    }
  });
});

describe('readPaymentAmount — o valor digitado no balcão', () => {
  it('lê o jeito brasileiro sem passar por float', () => {
    expect(readPaymentAmount('1.234,56', 200000)).toEqual({ ok: true, cents: 123456, overpaidCents: 0 });
    expect(readPaymentAmount('R$ 0,10', 1000)).toEqual({ ok: true, cents: 10, overpaidCents: 0 });
    expect(readPaymentAmount('150', 15000)).toEqual({ ok: true, cents: 15000, overpaidCents: 0 });
  });

  it('pagamento parcial é livre (D3)', () => {
    expect(readPaymentAmount('100,00', 30000)).toEqual({ ok: true, cents: 10000, overpaidCents: 0 });
  });

  it('pagamento a maior passa, mas informa quanto sobra a devolver (D3)', () => {
    expect(readPaymentAmount('350,00', 30000)).toEqual({ ok: true, cents: 35000, overpaidCents: 5000 });
  });

  it('vazio, lixo e negativo pedem o valor de novo', () => {
    for (const text of ['', '   ', 'abc', '-50', '10,999', '1e3']) {
      const result = readPaymentAmount(text, 1000);
      expect(result.ok, text).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/valor recebido/);
    }
  });

  it('zero é recusado com o motivo', () => {
    const result = readPaymentAmount('0,00', 1000);
    expect(result).toEqual({ ok: false, error: 'O valor precisa ser maior que zero.' });
  });

  it('acima do que a coluna aceita é recusado antes de ir ao servidor', () => {
    expect(readPaymentAmount('10000000000,00', 1000).ok).toBe(false);
    expect(readPaymentAmount('9999999999,99', 1000).ok).toBe(true);
  });
});

describe('paymentBody — o que vai ao POST /payments', () => {
  it('paga pela reserva (D1) com o valor em texto decimal (D5)', () => {
    expect(paymentBody('res-1', 123456, 'DINHEIRO')).toEqual({
      reservation_id: 'res-1',
      amount: '1234.56',
      method: 'DINHEIRO',
    });
    expect(paymentBody('res-1', 5, 'PIX').amount).toBe('0.05');
    // Sempre duas casas: por float, 100 reais viraria "100" e 10 centavos "0.1" (achado da mutação).
    expect(paymentBody('res-1', 10000, 'PIX').amount).toBe('100.00');
    expect(paymentBody('res-1', 10, 'PIX').amount).toBe('0.10');
  });

  it('não manda paid_at: o servidor grava a hora do registro', () => {
    expect(paymentBody('res-1', 100, 'PIX')).not.toHaveProperty('paid_at');
  });
});

describe('PAYMENT_METHOD_OPTIONS', () => {
  it('oferece os quatro métodos que a API aceita, com rótulo', () => {
    expect(PAYMENT_METHOD_OPTIONS.map((m) => m.id).sort()).toEqual(
      ['CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO', 'PIX'],
    );
    for (const m of PAYMENT_METHOD_OPTIONS) expect(m.label.length).toBeGreaterThan(0);
  });
});

describe('submitStep — o que o envio do formulário faz (D3, 🟡-1 do qa-redteam)', () => {
  const ok = (cents: number, overpaidCents = 0) => ({ ok: true as const, cents, overpaidCents });

  it('valor inválido ou sem método: mostra o erro', () => {
    expect(submitStep({ reading: { ok: false, error: 'x' }, method: 'PIX', confirming: false })).toEqual({ kind: 'error', error: 'x' });
    expect(submitStep({ reading: ok(100), method: null, confirming: false })).toEqual({
      kind: 'error',
      error: 'Escolha como o hóspede pagou.',
    });
  });

  it('dentro do saldo: envia', () => {
    expect(submitStep({ reading: ok(100), method: 'PIX', confirming: false })).toEqual({ kind: 'send', cents: 100 });
  });

  it('a maior: primeiro pede confirmação', () => {
    expect(submitStep({ reading: ok(500, 100), method: 'PIX', confirming: false })).toEqual({ kind: 'confirm', overpaidCents: 100 });
  });

  it('com a confirmação aberta, um novo Enter no campo NÃO grava: só "Sim, registrar" grava', () => {
    expect(submitStep({ reading: ok(500, 100), method: 'PIX', confirming: true })).toEqual({ kind: 'wait' });
    expect(submitStep({ reading: ok(100), method: 'PIX', confirming: true })).toEqual({ kind: 'wait' });
  });
});

describe('freshBalanceStep — o saldo conferido no servidor antes de gravar (🔴 do qa-explorador de 11/11)', () => {
  it('saldo igual ao da tela: grava', () => {
    expect(freshBalanceStep({ shownCents: 26197, fresh: { ok: true, balanceCents: 26197 } })).toEqual({ kind: 'send' });
  });

  it('outro balcão registrou um pagamento: não grava e mostra o saldo novo (o cenário do relatório)', () => {
    const step = freshBalanceStep({ shownCents: 26197, fresh: { ok: true, balanceCents: 16197 } });
    expect(step.kind).toBe('stop');
    if (step.kind !== 'stop') return;
    expect(step.text).toContain(formatBRL(16197));
    expect(step.text).toContain('Nada foi registrado');
  });

  it('um consumo entrou no meio (saldo maior): também não grava', () => {
    const step = freshBalanceStep({ shownCents: 10000, fresh: { ok: true, balanceCents: 10001 } });
    expect(step.kind).toBe('stop');
    if (step.kind === 'stop') expect(step.text).toContain(formatBRL(10001));
  });

  it('a conta já foi quitada em outro registro: não grava e diz que está quitada', () => {
    const step = freshBalanceStep({ shownCents: 26197, fresh: { ok: true, balanceCents: 0 } });
    expect(step).toEqual({ kind: 'stop', text: 'A conta já foi quitada em outro registro. Nada foi registrado.' });
  });

  it('a conta já tem valor a devolver: não grava e mostra quanto', () => {
    const step = freshBalanceStep({ shownCents: 26197, fresh: { ok: true, balanceCents: -10000 } });
    expect(step.kind).toBe('stop');
    if (step.kind === 'stop') {
      expect(step.text).toContain(formatBRL(10000));
      expect(step.text).toContain('a devolver');
    }
  });

  it('não deu para conferir (rede, 5xx): não grava — fail-safe', () => {
    const step = freshBalanceStep({ shownCents: 26197, fresh: { ok: false } });
    expect(step.kind).toBe('stop');
    if (step.kind === 'stop') {
      expect(step.text).toContain('Não foi possível conferir o saldo');
      expect(step.text).toContain('Nada foi registrado');
    }
  });
});
