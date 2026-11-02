import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth.js';
import { canWriteRooms, countRoomsByCategory } from './roomRules.js';
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
  type RoomUpdateBody,
  type CategoryInput,
  type Room,
  type RoomCategory,
} from './roomsApi.js';

export const roomKeys = {
  all: ['rooms'] as const,
  detail: (id: string) => ['rooms', id] as const,
};

/**
 * Depois de gravar, a tela volta para a lista, que estava desmontada (query inativa). Por
 * padrão o TanStack só marca inativa como velha e a lista apareceria com o status antigo por
 * um instante — no balcão isso é informação errada. `refetchType: 'all'` busca já, e o
 * onSuccess da mutação espera essa busca antes de navegar.
 */
const fresh = { refetchType: 'all' } as const;

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
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.all, ...fresh }),
  });
}

export function useUpdateRoom(id: string) {
  const qc = useQueryClient();
  return useMutation({
    // Só as mudanças (changedRoomFields); `number` entra apenas na mensagem de 409.
    mutationFn: ({ changes, number }: { changes: RoomUpdateBody; number?: string }) =>
      updateRoom(id, changes, number),
    // roomKeys.all é prefixo de roomKeys.detail — uma invalidação cobre lista e detalhe.
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.all, ...fresh }),
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRoom(id),
    // Tira o quarto só da lista em cache (exact). Invalidar o prefixo rebuscaria o detalhe ainda
    // montado na tela e voltaria 404 do registro apagado; a lista rebusca sozinha ao montar.
    onSuccess: (_d, id) => {
      qc.setQueryData<Room[]>(roomKeys.all, (old) => old?.filter((r) => r.id !== id));
    },
  });
}

/**
 * Quantos quartos usam a categoria, segundo a lista de quartos que JÁ está em cache — sem
 * disparar busca. Só serve de dica na tela; a recusa de verdade é o 409 do backend.
 * null = a lista não foi carregada nesta sessão.
 */
export function useCachedRoomsUsingCategory(categoryId: string): number | null {
  const rooms = useQueryClient().getQueryData<Room[]>(roomKeys.all);
  return rooms ? (countRoomsByCategory(rooms).get(categoryId) ?? 0) : null;
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
    onSuccess: () => qc.invalidateQueries({ queryKey: categoryKeys.all, ...fresh }),
  });
}

export function useUpdateCategory(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryInput) => updateCategory(id, input),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: categoryKeys.all, ...fresh }),
        // A lista de quartos traz nome e tarifa da categoria embutidos.
        qc.invalidateQueries({ queryKey: roomKeys.all, ...fresh }),
      ]),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    // Mesmo motivo do useDeleteRoom.
    onSuccess: (_d, id) => {
      qc.setQueryData<RoomCategory[]>(categoryKeys.all, (old) => old?.filter((c) => c.id !== id));
    },
  });
}
