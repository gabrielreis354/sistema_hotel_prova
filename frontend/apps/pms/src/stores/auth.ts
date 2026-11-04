import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { queryClient } from '../lib/queryClient.js';
import type { AuthUser } from '../types.js';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => void;
}

/**
 * Sessão persistida em localStorage — o JWT tem que atravessar o turno (o garçom não
 * pode perder a comanda porque a aba recarregou). O backend é a autoridade; se o token
 * expirar, a próxima request volta 401 e a UI derruba a sessão.
 *
 * O computador da recepção é compartilhado: trocar de usuário esvazia o cache do React Query,
 * senão o próximo vê os dados do anterior, inclusive de outro hotel. O id do usuário é UUID
 * global, então trocar de usuário cobre trocar de hotel. Renovar o token do mesmo usuário
 * mantém o cache.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setSession: (token, user) => {
        if (get().user?.id !== user.id) queryClient.clear();
        set({ token, user });
      },
      logout: () => {
        queryClient.clear();
        set({ token: null, user: null });
      },
    }),
    { name: 'hotel-pms-auth' },
  ),
);
