import { useQuery } from '@tanstack/react-query';
import type { Role } from '../../types.js';
import { useAuthStore } from '../../stores/auth.js';
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

/**
 * Papéis que podem ler `GET /tenants/me`: o espelho do backend (`roles.js`, ADMIN e RECEPTIONIST
 * passam; o WAITER só alcança o cardápio e as comandas). Allowlist: papel novo ou ausente não
 * pergunta. Sem isso o cabeçalho do garçom pedia o hotel a cada tela e recebia 403, com erro
 * vermelho no console no passo 3 do roteiro (avaliação simulada da banca, 15/11). O cabeçalho do
 * garçom fica com "Gesway".
 */
const TENANT_READERS: readonly Role[] = ['ADMIN', 'RECEPTIONIST'];

export function canReadMyTenant(role: Role | undefined): boolean {
  return role !== undefined && TENANT_READERS.includes(role);
}

/** As opções da consulta já com o papel aplicado: só pergunta quem pode ler o hotel. */
export function myTenantQuery(role: Role | undefined) {
  return { ...myTenantOptions(), enabled: canReadMyTenant(role) };
}

export function useMyTenant() {
  const role = useAuthStore((s) => s.user?.role);
  return useQuery(myTenantQuery(role));
}
