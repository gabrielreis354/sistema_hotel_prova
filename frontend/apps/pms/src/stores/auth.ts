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

const STORAGE_KEY = 'hotel-pms-auth';

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
    { name: STORAGE_KEY },
  ),
);

function isStoredUser(user: unknown): user is AuthUser {
  const candidate = user as Partial<AuthUser> | null | undefined;
  return typeof candidate?.id === 'string' && typeof candidate.role === 'string';
}

/** Sessão gravada pelo persist. Só vale completa: qualquer outra forma é deslogado (fail-safe). */
function readStoredSession(raw: string | null): Pick<AuthState, 'token' | 'user'> {
  try {
    const state = raw ? JSON.parse(raw)?.state : null;
    if (typeof state?.token === 'string' && state.token && isStoredUser(state.user)) {
      return { token: state.token, user: state.user };
    }
  } catch {
    // JSON ilegível cai no deslogado abaixo.
  }
  return { token: null, user: null };
}

/**
 * O persist grava no localStorage, mas não escuta mudanças feitas por outra aba. Sem isto, sair
 * numa aba deixava as outras logadas, com o cache na tela. `key` nula é o localStorage inteiro
 * sendo limpo. Sair ou trocar de usuário esvazia o cache. Renovar o token do mesmo usuário, não.
 */
export function syncSessionFromOtherTab(event: Pick<StorageEvent, 'key' | 'newValue'>): void {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  const session = readStoredSession(event.newValue);
  if (!session.token || useAuthStore.getState().user?.id !== session.user?.id) queryClient.clear();
  useAuthStore.setState(session);
}

if (typeof window !== 'undefined') window.addEventListener('storage', syncSessionFromOtherTab);
