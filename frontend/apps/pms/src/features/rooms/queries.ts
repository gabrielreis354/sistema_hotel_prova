import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth.js';
import { canWriteRooms } from './roomRules.js';
import {
  listRooms,
  getRoom,
  createRoom,
  updateRoom,
  deleteRoom,
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  type RoomInput,
  type CategoryInput,
} from './roomsApi.js';

export const roomKeys = {
  all: ['rooms'] as const,
  detail: (id: string) => ['rooms', id] as const,
};

export const categoryKeys = {
  all: ['room-categories'] as const,
  detail: (id: string) => ['room-categories', id] as const,
};

/** O papel decide se os botões de escrita ficam habilitados. Leitura da sessão, sem estado novo. */
export function useCanWriteRooms(): boolean {
  return useAuthStore((s) => canWriteRooms(s.user?.role));
}

// ─── Quartos ────────────────────────────────────────────────────────────────

export function useRooms() {
  return useQuery({ queryKey: roomKeys.all, queryFn: listRooms });
}

export function useRoom(id: string | undefined) {
  return useQuery({
    queryKey: roomKeys.detail(id ?? ''),
    queryFn: () => getRoom(id as string),
    enabled: !!id,
  });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RoomInput) => createRoom(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.all }),
  });
}

export function useUpdateRoom(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RoomInput) => updateRoom(id, input),
    // roomKeys.all é prefixo de roomKeys.detail — uma invalidação cobre lista e detalhe.
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.all }),
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRoom(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.all }),
  });
}

// ─── Categorias ─────────────────────────────────────────────────────────────

export function useCategories() {
  return useQuery({ queryKey: categoryKeys.all, queryFn: listCategories });
}

export function useCategory(id: string | undefined) {
  return useQuery({
    queryKey: categoryKeys.detail(id ?? ''),
    queryFn: () => getCategory(id as string),
    enabled: !!id,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryInput) => createCategory(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: categoryKeys.all }),
  });
}

export function useUpdateCategory(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryInput) => updateCategory(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoryKeys.all });
      // A lista de quartos traz nome e tarifa da categoria embutidos.
      qc.invalidateQueries({ queryKey: roomKeys.all });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: categoryKeys.all }),
  });
}
