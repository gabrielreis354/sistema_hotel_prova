import { describe, expect, it } from 'vitest';
import { hotelStrip, type StripRoomInput } from './hotelStrip.js';
import type { ArrivalRow, TodayReservation } from './todayLogic.js';

const room = (id: string, number: string, floor: number | null, status: StripRoomInput['status'], category = 'Standard'): StripRoomInput => ({
  id,
  number,
  floor,
  status,
  category: { name: category },
});
const res = (id: string, roomId: string, guest: string, extra: Partial<TodayReservation> = {}): TodayReservation => ({
  id,
  status: 'CHECKED_IN',
  check_in_date: '2026-11-24',
  check_out_date: '2026-11-27',
  guest: { full_name: guest },
  room: { id: roomId },
  ...extra,
});
const arrival = (r: TodayReservation, late = false): ArrivalRow => ({ reservation: r, late, noShowRisk: false });

const ROOMS = [
  room('a', '101', 1, 'AVAILABLE'),
  room('b', '102', 1, 'AVAILABLE'),
  room('c', '103', 1, 'OCCUPIED'),
  room('d', '201', 2, 'CLEANING'),
  room('e', '210', 2, 'MAINTENANCE'),
  room('f', '202', 2, 'AVAILABLE'),
];

describe('fita do hotel (SPEC-10 F3, protótipo de 22/11)', () => {
  const chegada = res('r1', 'b', 'Wesley Freitas', { status: 'CONFIRMED', check_in_date: '2026-11-25' });
  const strip = hotelStrip(ROOMS, [arrival(chegada)], [res('r2', 'c', 'Felipe Rocha')]);

  it('cada quarto ganha o tom do estado; disponível com chegada vira "Chega hoje"', () => {
    const tom = Object.fromEntries(strip.floors.flatMap((f) => f.rooms).map((r) => [r.number, r.tone]));
    expect(tom).toEqual({ '101': 'free', '102': 'booked', '103': 'occupied', '201': 'cleaning', '202': 'free', '210': 'maintenance' });
  });

  it('"Livre" é livre para vender: o quarto da chegada sai dele (decisão de 22/11)', () => {
    expect(strip.counts).toEqual({ occupied: 1, booked: 1, cleaning: 1, maintenance: 1, free: 2 });
    expect(strip.total).toBe(6);
  });

  it('andares em ordem, quartos em ordem natural dentro do andar', () => {
    expect(strip.floors.map((f) => f.label)).toEqual(['1º andar', '2º andar']);
    expect(strip.floors[1]!.rooms.map((r) => r.number)).toEqual(['201', '202', '210']);
  });

  it('o quarto traz o hóspede e as datas de quem está nele ou chega nele', () => {
    const quartos = Object.fromEntries(strip.floors.flatMap((f) => f.rooms).map((r) => [r.number, r]));
    expect(quartos['103']).toMatchObject({ guest: 'Felipe Rocha', reservationId: 'r2', checkIn: '2026-11-24', checkOut: '2026-11-27' });
    expect(quartos['102']).toMatchObject({ guest: 'Wesley Freitas', reservationId: 'r1', category: 'Standard' });
    expect(quartos['101']!.guest).toBeUndefined();
  });

  it('a chegada atrasada também segura o quarto (não é livre para vender) e fica marcada', () => {
    const s = hotelStrip(ROOMS, [arrival(chegada, true)], []);
    const q = s.floors.flatMap((f) => f.rooms).find((r) => r.number === '102')!;
    expect(q.tone).toBe('booked');
    expect(q.late).toBe(true);
  });

  it('a chegada não pinta um quarto que não está disponível (o status do core manda)', () => {
    const s = hotelStrip(ROOMS, [arrival(res('r3', 'd', 'Ana', { status: 'CONFIRMED' }))], []);
    expect(s.floors.flatMap((f) => f.rooms).find((r) => r.number === '201')!.tone).toBe('cleaning');
  });

  it('quarto sem andar vai para um grupo próprio, no fim; térreo é "Térreo"', () => {
    const s = hotelStrip([room('x', 'A1', null, 'AVAILABLE'), room('y', '01', 0, 'AVAILABLE'), room('z', '101', 1, 'AVAILABLE')], [], []);
    expect(s.floors.map((f) => f.label)).toEqual(['Térreo', '1º andar', 'Sem andar']);
  });

  it('ocupação agora: ocupados sobre o total, como o analytics (manutenção entra no total)', () => {
    expect(strip.occupancyRate).toBeCloseTo((1 / 6) * 100);
    expect(hotelStrip([], [], []).occupancyRate).toBe(0);
  });
});

describe('ressalvas do red team e do critique da F3 (25/11)', () => {
  const TODAY = '2026-11-25';

  it('🟡2: duas chegadas no mesmo quarto, a do prazo vence a atrasada, em qualquer ordem', () => {
    const atrasada = arrival(res('velha', 'b', 'Antiga', { status: 'CONFIRMED', check_in_date: '2026-11-20' }), true);
    const hoje = arrival(res('nova', 'b', 'Nova', { status: 'CONFIRMED', check_in_date: TODAY }));
    for (const lista of [[atrasada, hoje], [hoje, atrasada]]) {
      const q = hotelStrip(ROOMS, lista, [], TODAY).floors.flatMap((f) => f.rooms).find((r) => r.number === '102')!;
      expect(q).toMatchObject({ reservationId: 'nova', late: false });
    }
  });

  it('P1-c: ocupado com saída hoje ou vencida fica marcado (sem criar um sexto estado) e é contado', () => {
    const sai = res('s', 'c', 'Gabriela', { check_out_date: TODAY });
    const s = hotelStrip(ROOMS, [], [sai], TODAY);
    const q = s.floors.flatMap((f) => f.rooms).find((r) => r.number === '103')!;
    expect(q).toMatchObject({ tone: 'occupied', departing: true, departureLate: false });
    expect(s.departing).toBe(1);
    const vencida = hotelStrip(ROOMS, [], [res('s', 'c', 'G', { check_out_date: '2026-11-24' })], TODAY);
    expect(vencida.floors.flatMap((f) => f.rooms).find((r) => r.number === '103')).toMatchObject({ departing: true, departureLate: true });
    const fica = hotelStrip(ROOMS, [], [res('s', 'c', 'G', { check_out_date: '2026-11-27' })], TODAY);
    expect(fica.departing).toBe(0);
  });

  it('só CHECKED_IN conta como quem está no quarto (o filtro não pode sumir)', () => {
    const s = hotelStrip(ROOMS, [], [res('x', 'c', 'Fantasma', { status: 'CHECKED_OUT' })], TODAY);
    expect(s.floors.flatMap((f) => f.rooms).find((r) => r.number === '103')!.guest).toBeUndefined();
  });
});
