import { api } from '../../lib/api.js';
import { ApiError } from '../../lib/http.js';
import { listReservations, type ReservationPage } from '../reservations/index.js';
import { toTodayAlerts, type TodayAlerts } from './todayLogic.js';

/**
 * Teto por bloco. O conjunto já vem recortado pelo servidor (situação e dia), então o limite
 * natural é o número de quartos do hotel; passar disso o bloco avisa, em vez de esconder.
 */
export const TODAY_LIMIT = 100;

/**
 * Hóspedes na casa — `status=CHECKED_IN` SEM período: o hóspede com saída vencida (atrasada)
 * sairia de uma janela de datas e sumiria do painel. Alimenta "Saídas" e "Na casa".
 */
export function listInHouse(): Promise<ReservationPage> {
  return listReservations({ status: 'CHECKED_IN', page: 1, limit: TODAY_LIMIT });
}

/**
 * Chegadas — reservas que ainda não entraram e se sobrepõem a hoje: entrada hoje, ou antes
 * (chegada atrasada) com a saída ainda por vir.
 */
export function listArrivals(today: string): Promise<ReservationPage> {
  return listReservations({ from: today, to: today, status: 'PENDING,CONFIRMED', page: 1, limit: TODAY_LIMIT });
}

/**
 * Alertas do dia (`/analytics/alerts`). Hoje vêm do core; com a H.3 o nginx manda o mesmo
 * caminho ao analytics-service. A leitura passa por `toTodayAlerts`, que só usa os campos
 * iguais nos dois contratos.
 */
export async function getTodayAlerts(): Promise<TodayAlerts> {
  const { data, response } = await api.GET('/analytics/alerts');
  if (response.status === 403) throw new ApiError('Seu perfil não vê os alertas do hotel.', 403);
  if (!response.ok || !data) throw new ApiError('Não foi possível carregar os alertas.', response.status);
  return toTodayAlerts(data);
}
