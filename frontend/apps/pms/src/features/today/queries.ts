import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { todayISO } from '@hotel/domain';
import { useAuthStore } from '../../stores/auth.js';
import { getTodayAlerts, listArrivals, listInHouse } from './todayApi.js';

/**
 * Chaves do painel. As de reserva começam por ['reservations'] — o check-in/out da T-05.2
 * invalida esse prefixo e o painel recarrega sozinho. A de alertas começa por ['analytics'],
 * invalidada depois de cada ação (lista de limpeza e contagens mudam).
 * O usuário entra na chave: o cache sobrevive ao logout e outro hotel na mesma aba não pode
 * ver os dados do anterior (mesmo motivo do analyticsKeys).
 */
export const todayKeys = {
  inHouse: (scope: string) => ['reservations', 'today', scope, 'in-house'] as const,
  arrivals: (scope: string, day: string) => ['reservations', 'today', scope, 'arrivals', day] as const,
  alerts: (scope: string) => ['analytics', scope, 'alerts'] as const,
};

/**
 * Painel aberto no balcão o turno inteiro, com mais de uma pessoa operando: recarrega a cada
 * minuto e ao voltar para a aba (padrão do TanStack), para não mostrar chegada que outro
 * recepcionista já atendeu.
 */
const REFRESH = 60_000;

function useScope(): string {
  return useAuthStore((s) => s.user?.id ?? 'anon');
}

/**
 * O dia do hotel (America/Sao_Paulo), conferido a cada minuto: o painel aberto à meia-noite
 * passa para o dia seguinte sozinho, em vez de continuar mostrando as chegadas de ontem.
 */
export function useHotelToday(): string {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todayISO()), REFRESH);
    return () => window.clearInterval(timer);
  }, []);
  return today;
}

export function useInHouse() {
  const scope = useScope();
  return useQuery({ queryKey: todayKeys.inHouse(scope), queryFn: listInHouse, refetchInterval: REFRESH });
}

export function useArrivals(today: string) {
  const scope = useScope();
  return useQuery({ queryKey: todayKeys.arrivals(scope, today), queryFn: () => listArrivals(today), refetchInterval: REFRESH });
}

export function useTodayAlerts() {
  const scope = useScope();
  return useQuery({ queryKey: todayKeys.alerts(scope), queryFn: getTodayAlerts, refetchInterval: REFRESH });
}
