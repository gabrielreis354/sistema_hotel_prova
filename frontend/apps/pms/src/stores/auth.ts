import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'hotel-pms-auth' },
  ),
);
