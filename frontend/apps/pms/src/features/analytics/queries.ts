import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth.js';
import {
  getOccupancy,
  getRevenue,
  getSeasonality,
  getRevenueByCategory,
  getPaymentMix,
  getTopGuests,
  type Period,
} from './analyticsApi.js';

/** Quantos hóspedes o ranking mostra. É dado pessoal: o mínimo que serve para fidelização (RT-51). */
export const TOP_GUESTS_LIMIT = 10;

/**
 * Toda chave começa pelo usuário logado. O cache sobrevive ao logout, e sem isso o ADMIN de
 * outro hotel que entrasse na mesma aba em até 5 min veria os números (e o ranking de
 * hóspedes) do hotel anterior sem nova consulta. O usuário pertence a um hotel só, então a
 * chave também separa os hotéis.
 */
export const analyticsKeys = {
  occupancy: (scope: string, date: string) => ['analytics', scope, 'occupancy', date] as const,
  revenue: (scope: string, p: Period) => ['analytics', scope, 'revenue', p.start, p.end] as const,
  seasonality: (scope: string, months: number) => ['analytics', scope, 'seasonality', months] as const,
  byCategory: (scope: string, p: Period) => ['analytics', scope, 'revenue-by-category', p.start, p.end] as const,
  paymentMix: (scope: string, p: Period) => ['analytics', scope, 'payment-mix', p.start, p.end] as const,
  topGuests: (scope: string) => ['analytics', scope, 'top-guests', TOP_GUESTS_LIMIT] as const,
};

/**
 * Um hook por bloco da tela: cada um carrega, falha e tenta de novo sozinho. Indicador não é
 * tempo real — 5 min de cache evita refazer seis consultas agregadas a cada troca de aba.
 * `enabled` desliga os blocos que a tela não mostra (o celular só tem os cartões do dia).
 */
const STALE = 5 * 60_000;

function useScope(): string {
  return useAuthStore((s) => s.user?.id ?? 'anon');
}

export function useOccupancy(date: string) {
  const scope = useScope();
  return useQuery({ queryKey: analyticsKeys.occupancy(scope, date), queryFn: () => getOccupancy(date), staleTime: STALE });
}

export function useRevenue(period: Period, enabled = true) {
  const scope = useScope();
  return useQuery({ queryKey: analyticsKeys.revenue(scope, period), queryFn: () => getRevenue(period), staleTime: STALE, enabled });
}

export function useSeasonality(months: number, enabled = true) {
  const scope = useScope();
  return useQuery({ queryKey: analyticsKeys.seasonality(scope, months), queryFn: () => getSeasonality(months), staleTime: STALE, enabled });
}

export function useRevenueByCategory(period: Period, enabled = true) {
  const scope = useScope();
  return useQuery({ queryKey: analyticsKeys.byCategory(scope, period), queryFn: () => getRevenueByCategory(period), staleTime: STALE, enabled });
}

export function usePaymentMix(period: Period, enabled = true) {
  const scope = useScope();
  return useQuery({ queryKey: analyticsKeys.paymentMix(scope, period), queryFn: () => getPaymentMix(period), staleTime: STALE, enabled });
}

export function useTopGuests(enabled = true) {
  const scope = useScope();
  return useQuery({ queryKey: analyticsKeys.topGuests(scope), queryFn: () => getTopGuests(TOP_GUESTS_LIMIT), staleTime: STALE, enabled });
}
