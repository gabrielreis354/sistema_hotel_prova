import { afterEach, describe, expect, it } from 'vitest';
import { queryClient } from '../lib/queryClient.js';
import { endSessionOnUnauthorized } from '../lib/api.js';
import { useAuthStore } from './auth.js';
import type { AuthUser } from '../types.js';

// O computador da recepção é compartilhado: o cache do React Query não pode sobreviver à troca
// de sessão, senão o próximo usuário da aba vê os dados do anterior — inclusive de outro hotel
// (🔴 do qa-redteam da T-05.6, docs/qa/repasses/para_gabriel_31102026.md).

const recepcaoHotelA: AuthUser = { id: 'a-1', name: 'Ana', email: 'ana@a.test', role: 'RECEPTIONIST' };
const adminHotelB: AuthUser = { id: 'b-1', name: 'Bia', email: 'bia@b.test', role: 'ADMIN' };

const cachedQueries = () => queryClient.getQueryCache().getAll().length;

afterEach(() => {
  useAuthStore.setState({ token: null, user: null });
  queryClient.clear();
});

describe('sessão e cache do React Query', () => {
  it('logout esvazia o cache', () => {
    useAuthStore.getState().setSession('token-a', recepcaoHotelA);
    queryClient.setQueryData(['guests'], [{ id: 'g-1', name: 'Hóspede do hotel A' }]);

    useAuthStore.getState().logout();

    expect(cachedQueries()).toBe(0);
  });

  it('entrar com outro usuário sem passar pelo logout também esvazia o cache', () => {
    useAuthStore.getState().setSession('token-a', recepcaoHotelA);
    queryClient.setQueryData(['guests'], [{ id: 'g-1', name: 'Hóspede do hotel A' }]);

    useAuthStore.getState().setSession('token-b', adminHotelB);

    expect(queryClient.getQueryData(['guests'])).toBeUndefined();
  });

  it('401 com sessão aberta (token vencido) derruba a sessão e esvazia o cache', () => {
    useAuthStore.getState().setSession('token-a', recepcaoHotelA);
    queryClient.setQueryData(['guests'], [{ id: 'g-1', name: 'Hóspede do hotel A' }]);

    endSessionOnUnauthorized();

    expect(useAuthStore.getState().token).toBeNull();
    expect(cachedQueries()).toBe(0);
  });

  it('401 sem sessão (credencial errada no login) não mexe em nada', () => {
    queryClient.setQueryData(['login-hint'], 'qualquer');

    endSessionOnUnauthorized();

    expect(cachedQueries()).toBe(1);
  });

  it('renovar o token do mesmo usuário mantém o cache', () => {
    useAuthStore.getState().setSession('token-a', recepcaoHotelA);
    queryClient.setQueryData(['guests'], [{ id: 'g-1', name: 'Hóspede do hotel A' }]);

    useAuthStore.getState().setSession('token-a2', recepcaoHotelA);

    expect(cachedQueries()).toBe(1);
  });
});
