import { useQuery } from '@tanstack/react-query';
import { getMyTenant } from './tenantApi.js';

export const tenantKeys = {
  me: ['tenant', 'me'] as const,
};

/**
 * Nome e CNPJ do hotel quase nunca mudam: uma hora de cache poupa a chamada a cada comprovante.
 * O cache é esvaziado no logout, então outro login nunca enxerga o hotel anterior.
 */
export function myTenantOptions() {
  return {
    queryKey: tenantKeys.me,
    queryFn: getMyTenant,
    staleTime: 60 * 60 * 1000,
  };
}

export function useMyTenant() {
  return useQuery(myTenantOptions());
}
