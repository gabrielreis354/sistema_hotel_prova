import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listGuests,
  getGuest,
  createGuest,
  updateGuest,
  deleteGuest,
  type GuestInput,
} from './guestsApi.js';

export const guestKeys = {
  all: ['guests'] as const,
  detail: (id: string) => ['guests', id] as const,
};

export function useGuests() {
  return useQuery({ queryKey: guestKeys.all, queryFn: listGuests });
}

export function useGuest(id: string | undefined) {
  return useQuery({
    queryKey: guestKeys.detail(id ?? ''),
    queryFn: () => getGuest(id as string),
    enabled: !!id,
  });
}

export function useCreateGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GuestInput) => createGuest(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: guestKeys.all }),
  });
}

export function useUpdateGuest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GuestInput) => updateGuest(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: guestKeys.all });
      qc.invalidateQueries({ queryKey: guestKeys.detail(id) });
    },
  });
}

export function useDeleteGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteGuest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: guestKeys.all }),
  });
}
