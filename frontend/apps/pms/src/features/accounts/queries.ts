import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listOpenAccounts,
  getAccount,
  openAccount,
  listMenu,
  getAccountBill,
  closeAccount,
  type WaiterAccountType,
} from './accountsApi.js';

export const accountKeys = {
  open: ['accounts', 'open'] as const,
  detail: (id: string) => ['accounts', id] as const,
  bill: (id: string) => ['accounts', id, 'bill'] as const,
  menu: ['products', 'menu'] as const,
};

/** Contas abertas. Atualiza sozinha: outro garçom ou a recepção abrem contas em paralelo. */
export function useOpenAccounts() {
  return useQuery({ queryKey: accountKeys.open, queryFn: listOpenAccounts, refetchInterval: 30_000 });
}

export function useAccount(id: string | undefined) {
  return useQuery({
    queryKey: accountKeys.detail(id ?? ''),
    queryFn: () => getAccount(id as string),
    enabled: !!id,
  });
}

/** Cardápio: muda pouco durante o turno. */
export function useMenu() {
  return useQuery({ queryKey: accountKeys.menu, queryFn: listMenu, staleTime: 5 * 60_000 });
}

export function useAccountBill(id: string, enabled: boolean) {
  return useQuery({ queryKey: accountKeys.bill(id), queryFn: () => getAccountBill(id), enabled });
}

export function useOpenAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, label }: { type: WaiterAccountType; label: string }) => openAccount(type, label),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.open }),
  });
}

export function useCloseAccount(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => closeAccount(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(id) });
      qc.invalidateQueries({ queryKey: accountKeys.bill(id) });
      qc.invalidateQueries({ queryKey: accountKeys.open });
    },
  });
}
