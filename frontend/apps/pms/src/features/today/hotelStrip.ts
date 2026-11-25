/**
 * Fita do hotel do painel Hoje (SPEC-10, F3; protótipo aprovado pelo Sirlande em 22/11): todos os
 * quartos por andar, cada um com o tom do estado. Sem React e sem rede, testada em hotelStrip.test.ts.
 *
 * Fonte: os quartos do core (GET /rooms) cruzados com as chegadas e os hóspedes na casa, que o painel
 * já busca. Não depende do analytics: com ele fora, a recepção continua vendo o hotel.
 */
import type { StatusTone } from '@hotel/domain';
import type { ArrivalRow, TodayReservation } from './todayLogic.js';

/** O que a fita lê de um quarto (o `Room` do OpenAPI cabe aqui). */
export interface StripRoomInput {
  id?: string;
  number?: string;
  floor?: number | null;
  status?: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'CLEANING';
  category?: { name?: string } | null;
}

/** Os 5 estados da fita. "booked" é "Chega hoje": disponível, mas com chegada marcada nele. */
export type StripTone = Extract<StatusTone, 'occupied' | 'booked' | 'cleaning' | 'maintenance' | 'free'>;

export interface StripRoom {
  id: string;
  number: string;
  category: string;
  tone: StripTone;
  /** Quem está no quarto (ocupado) ou chega nele (Chega hoje). */
  guest?: string;
  reservationId?: string;
  checkIn?: string;
  checkOut?: string;
  /** Chegada atrasada: a entrada era antes de hoje e o hóspede ainda não veio. */
  late?: boolean;
  /** Ocupado com saída hoje ou já vencida: o pico das 7h às 11h (critique da F3, P1-c). */
  departing?: boolean;
  /** A saída já passou e o hóspede continua (saída atrasada). */
  departureLate?: boolean;
}

export interface StripFloor {
  label: string;
  rooms: StripRoom[];
}

export interface HotelStrip {
  floors: StripFloor[];
  counts: Record<StripTone, number>;
  total: number;
  /** Ocupados sobre o total, em %. O total conta a manutenção, como o analytics (pendência do Weslley). */
  occupancyRate: number;
  /** Quartos ocupados com saída hoje ou vencida. */
  departing: number;
}

/** Ordem da legenda: do que pede ação ao que está parado. */
export const STRIP_TONES: readonly StripTone[] = ['occupied', 'booked', 'cleaning', 'maintenance', 'free'];

export const STRIP_LABEL: Record<StripTone, string> = {
  occupied: 'Ocupado',
  booked: 'Chega hoje',
  cleaning: 'Em limpeza',
  maintenance: 'Manutenção',
  free: 'Livre',
};

const BY_STATUS: Record<NonNullable<StripRoomInput['status']>, StripTone> = {
  OCCUPIED: 'occupied',
  CLEANING: 'cleaning',
  MAINTENANCE: 'maintenance',
  AVAILABLE: 'free',
};

function floorLabel(floor: number | null): string {
  if (floor === null) return 'Sem andar';
  return floor === 0 ? 'Térreo' : `${floor}º andar`;
}

function stay(r: TodayReservation): Pick<StripRoom, 'guest' | 'reservationId' | 'checkIn' | 'checkOut'> {
  return { guest: r.guest?.full_name, reservationId: r.id, checkIn: r.check_in_date, checkOut: r.check_out_date };
}

/**
 * Monta a fita. O status do core manda: a chegada só pinta de "Chega hoje" um quarto AVAILABLE. A
 * chegada atrasada também segura o quarto, porque ainda pode chegar (janela do check-in, 15/11), e
 * por isso sai do "Livre": livre é livre para vender (decisão de 22/11).
 */
export function hotelStrip(
  rooms: readonly StripRoomInput[],
  arrivals: readonly ArrivalRow[],
  inHouse: readonly TodayReservation[],
  today = '',
): HotelStrip {
  // Duas chegadas no mesmo quarto acontecem: a listagem traz a vencida, e o conflito não barra a seguinte.
  // A do prazo vence a atrasada, qualquer que seja a ordem da lista (🟡2 do qa-redteam da F3).
  const arrivalByRoom = new Map<string, ArrivalRow>();
  for (const a of arrivals) {
    const id = a.reservation.room?.id;
    if (!id) continue;
    const current = arrivalByRoom.get(id);
    if (!current || (current.late && !a.late)) arrivalByRoom.set(id, a);
  }
  const stayByRoom = new Map<string, TodayReservation>();
  for (const r of inHouse) if (r.status === 'CHECKED_IN' && r.room?.id) stayByRoom.set(r.room.id, r);

  const counts: Record<StripTone, number> = { occupied: 0, booked: 0, cleaning: 0, maintenance: 0, free: 0 };
  const byFloor = new Map<number | null, StripRoom[]>();

  for (const room of rooms) {
    if (!room.id || !room.status) continue;
    let item: StripRoom = { id: room.id, number: room.number ?? '—', category: room.category?.name ?? '', tone: BY_STATUS[room.status] };
    const arrival = arrivalByRoom.get(room.id);
    if (item.tone === 'free' && arrival) {
      item = { ...item, tone: 'booked', ...stay(arrival.reservation), late: arrival.late };
    } else if (item.tone === 'occupied') {
      const guest = stayByRoom.get(room.id);
      if (guest) {
        item = { ...item, ...stay(guest) };
        const out = guest.check_out_date;
        if (today && out && out <= today) item = { ...item, departing: true, departureLate: out < today };
      }
    }
    counts[item.tone] += 1;
    const floor = room.floor ?? null;
    byFloor.set(floor, [...(byFloor.get(floor) ?? []), item]);
  }

  const floors = [...byFloor.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b))
    .map(([floor, list]) => ({
      label: floorLabel(floor),
      rooms: list.sort((x, y) => x.number.localeCompare(y.number, 'pt-BR', { numeric: true })),
    }));

  const total = floors.reduce((n, f) => n + f.rooms.length, 0);
  const departing = floors.reduce((n, f) => n + f.rooms.filter((r) => r.departing).length, 0);
  return { floors, counts, total, occupancyRate: total === 0 ? 0 : (counts.occupied / total) * 100, departing };
}
