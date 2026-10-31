import { useQuery } from '@tanstack/react-query';
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

export const analyticsKeys = {
  occupancy: (date: string) => ['analytics', 'occupancy', date] as const,
  revenue: (p: Period) => ['analytics', 'revenue', p.start, p.end] as const,
  seasonality: (months: number) => ['analytics', 'seasonality', months] as const,
  byCategory: (p: Period) => ['analytics', 'revenue-by-category', p.start, p.end] as const,
  paymentMix: (p: Period) => ['analytics', 'payment-mix', p.start, p.end] as const,
  topGuests: ['analytics', 'top-guests', TOP_GUESTS_LIMIT] as const,
};

/**
 * Um hook por bloco da tela: cada um carrega, falha e tenta de novo sozinho. Indicador não é
 * tempo real — 5 min de cache evita refazer seis consultas agregadas a cada troca de aba.
 */
const STALE = 5 * 60_000;

export function useOccupancy(date: string) {
  return useQuery({ queryKey: analyticsKeys.occupancy(date), queryFn: () => getOccupancy(date), staleTime: STALE });
}

export function useRevenue(period: Period) {
  return useQuery({ queryKey: analyticsKeys.revenue(period), queryFn: () => getRevenue(period), staleTime: STALE });
}

export function useSeasonality(months: number) {
  return useQuery({ queryKey: analyticsKeys.seasonality(months), queryFn: () => getSeasonality(months), staleTime: STALE });
}

export function useRevenueByCategory(period: Period) {
  return useQuery({ queryKey: analyticsKeys.byCategory(period), queryFn: () => getRevenueByCategory(period), staleTime: STALE });
}

export function usePaymentMix(period: Period) {
  return useQuery({ queryKey: analyticsKeys.paymentMix(period), queryFn: () => getPaymentMix(period), staleTime: STALE });
}

export function useTopGuests() {
  return useQuery({ queryKey: analyticsKeys.topGuests, queryFn: () => getTopGuests(TOP_GUESTS_LIMIT), staleTime: STALE });
}
