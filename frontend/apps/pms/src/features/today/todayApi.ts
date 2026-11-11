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
  return withMessage(listReservations({ status: 'CHECKED_IN', page: 1, limit: TODAY_LIMIT }), 'os hóspedes na casa');
}

/**
 * Falha de servidor ou de rede vira uma frase do balcão — o texto cru do 500 ("Erro interno do
 * servidor") não diz o que deixou de carregar. 4xx mantém a mensagem do servidor, que explica.
 */
async function withMessage<T>(p: Promise<T>, what: string): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) throw err;
    throw new ApiError(`Não foi possível carregar ${what}. Confira a conexão e tente de novo.`, err instanceof ApiError ? err.status : 0);
  }
}

/**
 * Chegadas — reservas que ainda não entraram e se sobrepõem a hoje: entrada hoje, ou antes
 * (chegada atrasada) com a saída ainda por vir.
 */
export function listArrivals(today: string): Promise<ReservationPage> {
  return withMessage(
    listReservations({ from: today, to: today, status: 'PENDING,CONFIRMED', page: 1, limit: TODAY_LIMIT }),
    'as chegadas do dia',
  );
}

/**
 * Alertas do dia (`/analytics/alerts`), servidos pelo analytics-service desde a H.3. A leitura
 * passa por `toTodayAlerts`, que só usa os campos de que o painel precisa.
 */
export async function getTodayAlerts(): Promise<TodayAlerts> {
  const { data, response } = await api.GET('/analytics/alerts');
  if (response.status === 403) throw new ApiError('Seu perfil não vê os alertas do hotel.', 403);
  if (!response.ok || !data) throw new ApiError('Não foi possível carregar os alertas. Tente de novo.', response.status);
  return toTodayAlerts(data);
}
