import { describe, it, expect } from 'vitest';
import {
  canTransitionReservation,
  canCancelReservation,
  canCheckIn,
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

  it('proibe pular etapas e reanimar estados finais', () => {
    expect(canTransitionReservation('PENDING', 'CHECKED_IN')).toBe(false);
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
    expect(canCheckIn('PENDING')).toBe(false);
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

  it('todo status tem metadados de exibicao (label + token de cor)', () => {
    for (const meta of Object.values(ROOM_STATUS_META)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.token.length).toBeGreaterThan(0);
    }
  });
});
