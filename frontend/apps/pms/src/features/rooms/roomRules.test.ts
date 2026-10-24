import { describe, it, expect } from 'vitest';
import {
  canWriteRooms,
  roomStatusOptions,
  roomDeleteBlockReason,
  countRoomsByCategory,
  changedRoomFields,
  sortRooms,
  formatFloor,
} from './roomRules.js';
import type { Room } from './roomsApi.js';

const enabled = (current?: Parameters<typeof roomStatusOptions>[0]) =>
  roomStatusOptions(current)
    .filter((o) => o.enabled)
    .map((o) => o.status);

describe('canWriteRooms', () => {
  it('so ADMIN escreve, como no backend', () => {
    expect(canWriteRooms('ADMIN')).toBe(true);
    expect(canWriteRooms('RECEPTIONIST')).toBe(false);
    expect(canWriteRooms('WAITER')).toBe(false);
    expect(canWriteRooms(undefined)).toBe(false);
  });
});

describe('roomStatusOptions', () => {
  it('quarto novo nasce Livre ou em Manutencao', () => {
    expect(enabled()).toEqual(['AVAILABLE', 'MAINTENANCE']);
  });

  it('Livre pode ir para Manutencao, nunca para Ocupado na mao', () => {
    expect(enabled('AVAILABLE')).toEqual(['AVAILABLE', 'MAINTENANCE']);
  });

  it('Limpeza so volta para Livre', () => {
    expect(enabled('CLEANING')).toEqual(['AVAILABLE', 'CLEANING']);
  });

  it('Manutencao so volta para Livre', () => {
    expect(enabled('MAINTENANCE')).toEqual(['AVAILABLE', 'MAINTENANCE']);
  });

  it('Ocupado fica travado ate o check-out', () => {
    expect(enabled('OCCUPIED')).toEqual(['OCCUPIED']);
  });

  it('toda opcao desabilitada traz o motivo', () => {
    for (const current of [undefined, 'AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'] as const) {
      for (const o of roomStatusOptions(current)) {
        if (!o.enabled) expect(o.reason).toBeTruthy();
      }
    }
  });

  it('sempre lista os quatro status, na ordem do dominio', () => {
    expect(roomStatusOptions('CLEANING').map((o) => o.status)).toEqual([
      'AVAILABLE',
      'OCCUPIED',
      'CLEANING',
      'MAINTENANCE',
    ]);
  });
});

describe('roomDeleteBlockReason', () => {
  it('bloqueia quarto ocupado e libera os demais', () => {
    expect(roomDeleteBlockReason('OCCUPIED')).toMatch(/check-out/);
    expect(roomDeleteBlockReason('AVAILABLE')).toBeNull();
    expect(roomDeleteBlockReason('CLEANING')).toBeNull();
  });
});

describe('changedRoomFields', () => {
  const original = { number: '101', floor: 1, category_id: 'a', status: 'AVAILABLE' } as const;

  it('corrigir o andar nao reenvia o status (nao desfaz check-in em paralelo)', () => {
    expect(changedRoomFields(original, { ...original, floor: 2 })).toEqual({ floor: 2 });
  });

  it('status so vai quando o admin o mudou', () => {
    expect(changedRoomFields(original, { ...original, status: 'MAINTENANCE' })).toEqual({ status: 'MAINTENANCE' });
  });

  it('nada mudou = objeto vazio', () => {
    expect(changedRoomFields(original, { ...original })).toEqual({});
  });

  it('andar removido vai como null, e varios campos juntos', () => {
    expect(changedRoomFields(original, { ...original, floor: null, number: '102', category_id: 'b' })).toEqual({
      floor: null,
      number: '102',
      category_id: 'b',
    });
  });
});

describe('countRoomsByCategory', () => {
  const rooms: Room[] = [
    { id: '1', number: '101', category_id: 'a' },
    { id: '2', number: '102', category_id: 'a' },
    { id: '3', number: '201', category_id: 'b' },
  ];

  it('conta quartos por categoria', () => {
    const c = countRoomsByCategory(rooms);
    expect(c.get('a')).toBe(2);
    expect(c.get('b')).toBe(1);
    expect(c.get('z')).toBeUndefined();
  });

});

describe('sortRooms', () => {
  it('ordena por andar e numero natural, sem andar por ultimo', () => {
    const rooms: Room[] = [
      { id: 'a', number: '10', floor: 1 },
      { id: 'b', number: '201', floor: 2 },
      { id: 'c', number: '2', floor: 1 },
      { id: 'd', number: 'Chalé', floor: null },
      { id: 'e', number: '001', floor: 0 },
    ];
    expect(sortRooms(rooms).map((r) => r.id)).toEqual(['e', 'c', 'a', 'b', 'd']);
  });

  it('nao muta a lista original', () => {
    const rooms: Room[] = [
      { id: 'a', number: '2', floor: 1 },
      { id: 'b', number: '1', floor: 1 },
    ];
    sortRooms(rooms);
    expect(rooms.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('formatFloor', () => {
  it('0 e terreo, ausente e traco', () => {
    expect(formatFloor(0)).toBe('Térreo');
    expect(formatFloor(3)).toBe('3º');
    expect(formatFloor(null)).toBe('—');
    expect(formatFloor(undefined)).toBe('—');
  });
});
