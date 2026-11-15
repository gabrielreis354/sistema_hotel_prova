import { useQuery } from '@tanstack/react-query';
import { getMyTenant } from './tenantApi.js';

export const tenantKeys = {
  me: ['tenant', 'me'] as const,
};

/**
 * Nome e CNPJ do hotel quase nunca mudam: uma hora sem refazer a chamada, e o dado fica no
 * cache mesmo sem ninguém usando (`gcTime: Infinity`). Sem isso, o padrão de 5 minutos
 * descartava o hotel entre um comprovante e outro, e a impressão rápida saía sem emissor
 * (🟡-2 do qa-redteam de 15/11). O cache é esvaziado no logout, então outro login nunca
 * enxerga o hotel anterior.
 */
export function myTenantOptions() {
  return {
    queryKey: tenantKeys.me,
    queryFn: getMyTenant,
    staleTime: 60 * 60 * 1000,
    gcTime: Infinity,
  };
}

export function useMyTenant() {
  return useQuery(myTenantOptions());
}
