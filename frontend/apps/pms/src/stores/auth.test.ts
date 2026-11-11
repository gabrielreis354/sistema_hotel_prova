import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../lib/queryClient.js';
import { endSessionOnUnauthorized } from '../lib/api.js';
import { syncSessionFromOtherTab, useAuthStore } from './auth.js';
import type { AuthUser } from '../types.js';

// O computador da recepção é compartilhado: o cache do React Query não pode sobreviver à troca
// de sessão, senão o próximo usuário da aba vê os dados do anterior — inclusive de outro hotel
// (🔴 do qa-redteam da T-05.6, docs/qa/repasses/para_gabriel_31102026.md).

const recepcaoHotelA: AuthUser = { id: 'a-1', name: 'Ana', email: 'ana@a.test', role: 'RECEPTIONIST' };
const adminHotelB: AuthUser = { id: 'b-1', name: 'Bia', email: 'bia@b.test', role: 'ADMIN' };

const cachedQueries = () => queryClient.getQueryCache().getAll().length;

afterEach(() => {
  vi.unstubAllGlobals();
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

    endSessionOnUnauthorized({ path: '/guests', token: 'token-a' });

    expect(useAuthStore.getState().token).toBeNull();
    expect(cachedQueries()).toBe(0);
  });

  it('401 sem sessão (credencial errada no login) não mexe em nada', () => {
    queryClient.setQueryData(['login-hint'], 'qualquer');

    endSessionOnUnauthorized({ path: '/auth/login', token: null });

    expect(cachedQueries()).toBe(1);
  });

  it('senha errada no login com sessão aberta não derruba a sessão', () => {
    useAuthStore.getState().setSession('token-a', recepcaoHotelA);

    endSessionOnUnauthorized({ path: '/auth/login', token: 'token-a' });

    expect(useAuthStore.getState().token).toBe('token-a');
  });

  it('401 atrasado de um token antigo não derruba a sessão nova', () => {
    useAuthStore.getState().setSession('token-b', adminHotelB);

    endSessionOnUnauthorized({ path: '/guests', token: 'token-a' });

    expect(useAuthStore.getState().token).toBe('token-b');
  });

  it('renovar o token do mesmo usuário mantém o cache', () => {
    useAuthStore.getState().setSession('token-a', recepcaoHotelA);
    queryClient.setQueryData(['guests'], [{ id: 'g-1', name: 'Hóspede do hotel A' }]);

    useAuthStore.getState().setSession('token-a2', recepcaoHotelA);

    expect(cachedQueries()).toBe(1);
  });
});

// Sair numa aba tem que valer para todas: quem senta depois no computador da recepção não pode
// continuar na aba que ficou aberta (🔴 do qa-redteam do logout, para_gabriel_04112026.md).
describe('sessão alterada em outra aba', () => {
  const KEY = 'hotel-pms-auth';
  const stored = (token: string | null, user: AuthUser | null) => JSON.stringify({ state: { token, user }, version: 0 });

  function logadaNoHotelA() {
    useAuthStore.getState().setSession('token-a', recepcaoHotelA);
    queryClient.setQueryData(['guests'], [{ id: 'g-1', name: 'Hóspede do hotel A' }]);
  }

  it('sair em outra aba derruba a sessão e esvazia o cache aqui', () => {
    logadaNoHotelA();

    syncSessionFromOtherTab({ key: KEY, newValue: stored(null, null) });

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(cachedQueries()).toBe(0);
  });

  it('entrar com outro usuário em outra aba troca a sessão e esvazia o cache aqui', () => {
    logadaNoHotelA();

    syncSessionFromOtherTab({ key: KEY, newValue: stored('token-b', adminHotelB) });

    expect(useAuthStore.getState().user?.id).toBe('b-1');
    expect(useAuthStore.getState().token).toBe('token-b');
    expect(cachedQueries()).toBe(0);
  });

  it('renovar o token do mesmo usuário em outra aba mantém o cache', () => {
    logadaNoHotelA();

    syncSessionFromOtherTab({ key: KEY, newValue: stored('token-a2', recepcaoHotelA) });

    expect(useAuthStore.getState().token).toBe('token-a2');
    expect(cachedQueries()).toBe(1);
  });

  it('localStorage limpo (key nula) derruba a sessão', () => {
    logadaNoHotelA();

    syncSessionFromOtherTab({ key: null, newValue: null });

    expect(useAuthStore.getState().token).toBeNull();
    expect(cachedQueries()).toBe(0);
  });

  it('valor ilegível derruba a sessão em vez de mantê-la', () => {
    logadaNoHotelA();

    syncSessionFromOtherTab({ key: KEY, newValue: '{quebrado' });

    expect(useAuthStore.getState().token).toBeNull();
    expect(cachedQueries()).toBe(0);
  });

  it.each([
    ['token sem usuário', { token: 't-x' }],
    ['usuário sem papel', { token: 't-x', user: { id: 'z' } }],
    ['tipos errados', { token: 123, user: 'abc' }],
    ['token nulo com o mesmo usuário', { token: null, user: recepcaoHotelA }],
  ])('formato inesperado (%s) vale como deslogado e esvazia o cache', (_caso, state) => {
    logadaNoHotelA();

    syncSessionFromOtherTab({ key: KEY, newValue: JSON.stringify({ state, version: 0 }) });

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(cachedQueries()).toBe(0);
  });

  it('no navegador, o módulo escuta as mudanças de outra aba', async () => {
    const addEventListener = vi.fn();
    vi.stubGlobal('window', { addEventListener });
    vi.resetModules();

    const { syncSessionFromOtherTab: listener } = await import('./auth.js');

    expect(addEventListener).toHaveBeenCalledWith('storage', listener);
  });

  it('mudança em outra chave não mexe na sessão', () => {
    logadaNoHotelA();

    syncSessionFromOtherTab({ key: 'gesway-comanda-item:1', newValue: 'x' });

    expect(useAuthStore.getState().token).toBe('token-a');
    expect(cachedQueries()).toBe(1);
  });
});
