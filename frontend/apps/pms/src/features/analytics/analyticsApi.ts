import type { paths } from '@hotel/api-client';
import { api } from '../../lib/api.js';
import { ApiError } from '../../lib/http.js';

/**
 * Indicadores do gerente (T-05.6). Hoje vêm do core (`/analytics/*`); quando a H.3 do
 * analytics-service entrar, o nginx passa a rotear o mesmo caminho para ele. Por isso a tela
 * depende só do contrato do Swagger, nunca de detalhe do serviço.
 */
type Ok<P extends keyof paths> = paths[P] extends {
  get: { responses: { 200: { content: { 'application/json': infer T } } } };
}
  ? T
  : never;

export type Occupancy = Ok<'/analytics/occupancy'>;
export type Revenue = Ok<'/analytics/revenue'>;
export type SeasonalityRow = Ok<'/analytics/seasonality'>[number];
export type CategoryRow = Ok<'/analytics/revenue-by-category'>[number];
export type PaymentMixRow = Ok<'/analytics/payment-mix'>[number];
export type TopGuestRow = Ok<'/analytics/top-guests'>[number];

/** Período de calendário no fuso do hotel, 'yyyy-MM-dd' nas duas pontas, inclusivo. */
export interface Period {
  start: string;
  end: string;
}

function fail(what: string, status: number): never {
  throw new ApiError(`Não foi possível carregar ${what}.`, status);
}

/** `date` vai sempre explícito: o padrão do backend é o dia em UTC, que depois das 21h já é amanhã. */
export async function getOccupancy(date: string): Promise<Occupancy> {
  const { data, response } = await api.GET('/analytics/occupancy', { params: { query: { date } } });
  if (!response.ok || !data) fail('a ocupação', response.status);
  return data;
}

export async function getRevenue(period: Period): Promise<Revenue> {
  const { data, response } = await api.GET('/analytics/revenue', { params: { query: period } });
  if (!response.ok || !data) fail('a receita', response.status);
  return data;
}

export async function getSeasonality(months: number): Promise<SeasonalityRow[]> {
  const { data, response } = await api.GET('/analytics/seasonality', { params: { query: { months } } });
  if (!response.ok || !data) fail('a sazonalidade', response.status);
  return data;
}

export async function getRevenueByCategory(period: Period): Promise<CategoryRow[]> {
  const { data, response } = await api.GET('/analytics/revenue-by-category', { params: { query: period } });
  if (!response.ok || !data) fail('a receita por categoria', response.status);
  return data;
}

export async function getPaymentMix(period: Period): Promise<PaymentMixRow[]> {
  const { data, response } = await api.GET('/analytics/payment-mix', { params: { query: period } });
  if (!response.ok || !data) fail('os meios de pagamento', response.status);
  return data;
}

export async function getTopGuests(limit: number): Promise<TopGuestRow[]> {
  const { data, response } = await api.GET('/analytics/top-guests', { params: { query: { limit } } });
  if (!response.ok || !data) fail('o ranking de hóspedes', response.status);
  return data;
}
