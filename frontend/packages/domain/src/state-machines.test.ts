import { describe, it, expect } from 'vitest';
import {
  canTransitionReservation,
  canCancelReservation,
  canCheckIn,
  checkInWindow,
  canCheckOut,
  canTransitionRoom,
  ROOM_STATUS_META,
} from './state-machines.js';

describe('reserva — allowlist', () => {
  it('permite o caminho feliz', () => {
    expect(canTransitionReservation('PENDING', 'CONFIRMED')).toBe(true);
    expect(canTransitionReservation('CONFIRMED', 'CHECKED_IN')).toBe(true);
    expect(canTransitionReservation('CHECKED_IN', 'CHECKED_OUT')).toBe(true);
  });

  it('permite check-in direto de PENDING (walk-in, decisao de 24/10/2026)', () => {
    expect(canTransitionReservation('PENDING', 'CHECKED_IN')).toBe(true);
  });

  it('proibe pular etapas e reanimar estados finais', () => {
    expect(canTransitionReservation('PENDING', 'CHECKED_OUT')).toBe(false);
    expect(canTransitionReservation('CHECKED_OUT', 'CHECKED_IN')).toBe(false);
    expect(canTransitionReservation('CANCELLED', 'CONFIRMED')).toBe(false);
  });

  it('so PENDING e CONFIRMED cancelam', () => {
    expect(canCancelReservation('PENDING')).toBe(true);
    expect(canCancelReservation('CONFIRMED')).toBe(true);
    expect(canCancelReservation('CHECKED_IN')).toBe(false);
    expect(canCancelReservation('CHECKED_OUT')).toBe(false);
    expect(canCancelReservation('CANCELLED')).toBe(false);
  });

  it('atalhos de check-in/out refletem a maquina', () => {
    expect(canCheckIn('CONFIRMED')).toBe(true);
    expect(canCheckIn('PENDING')).toBe(true);
    expect(canCheckIn('CHECKED_IN')).toBe(false);
    expect(canCheckIn('CHECKED_OUT')).toBe(false);
    expect(canCheckIn('CANCELLED')).toBe(false);
    expect(canCheckOut('CHECKED_IN')).toBe(true);
    expect(canCheckOut('CONFIRMED')).toBe(false);
  });
});

describe('quarto — allowlist', () => {
  it('segue AVAILABLE -> OCCUPIED -> CLEANING -> AVAILABLE', () => {
    expect(canTransitionRoom('AVAILABLE', 'OCCUPIED')).toBe(true);
    expect(canTransitionRoom('OCCUPIED', 'CLEANING')).toBe(true);
    expect(canTransitionRoom('CLEANING', 'AVAILABLE')).toBe(true);
  });

  it('proibe pular limpeza', () => {
    expect(canTransitionRoom('OCCUPIED', 'AVAILABLE')).toBe(false);
  });

  it('limpeza pode ir para manutencao (defeito achado na limpeza — decisao de 04/11)', () => {
    expect(canTransitionRoom('CLEANING', 'MAINTENANCE')).toBe(true);
    expect(canTransitionRoom('MAINTENANCE', 'CLEANING')).toBe(false);
    expect(canTransitionRoom('CLEANING', 'OCCUPIED')).toBe(false);
  });

  it('todo status tem metadados de exibicao (label + token de cor)', () => {
    for (const meta of Object.values(ROOM_STATUS_META)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.token.length).toBeGreaterThan(0);
    }
  });
});

describe('checkInWindow — o check-in só abre dentro do período (regra de 15/11/2026)', () => {
  const hoje = '2026-11-15';
  it('entrada hoje → aberta', () => expect(checkInWindow('2026-11-15', '2026-11-17', hoje)).toBe('OPEN'));
  it('chegada atrasada dentro do período → aberta', () => expect(checkInWindow('2026-11-14', '2026-11-16', hoje)).toBe('OPEN'));
  it('entrada amanhã → cedo demais', () => expect(checkInWindow('2026-11-16', '2026-11-18', hoje)).toBe('TOO_EARLY'));
  it('saída hoje → vencida (não sobra noite)', () => expect(checkInWindow('2026-11-13', '2026-11-15', hoje)).toBe('EXPIRED'));
  it('saída em setembro → vencida', () => expect(checkInWindow('2026-09-10', '2026-09-12', hoje)).toBe('EXPIRED'));
});

