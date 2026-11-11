import { createApiClient, type UnauthorizedRequest } from '@hotel/api-client';
import { useAuthStore } from '../stores/auth.js';

// Em dev, `/api` cai no proxy do Vite (mesma origem). Em produção, defina VITE_API_URL
// com a origem real da API — senão o build sobe apontando para `/api`, que não existe fora do proxy.
const baseUrl = import.meta.env.VITE_API_URL ?? '/api';

/**
 * Cliente único da aplicação. O token é lido do store a cada request (getState fora de
 * React), então login/logout refletem sem recriar o cliente. Em 401 (token expirado), a
 * sessão é derrubada — o guard de rota leva o usuário de volta ao login.
 */
export const api = createApiClient({
  baseUrl,
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: endSessionOnUnauthorized,
});

/**
 * 401 no token da sessão atual = token vencido: derruba a sessão pelo `logout()`, que também
 * esvazia o cache. O 401 do login é credencial errada, que a tela de login trata sozinha. O 401
 * de um token antigo é resposta atrasada de outra sessão. Nenhum dos dois derruba a atual, que
 * cairia em todas as abas.
 */
export function endSessionOnUnauthorized(failed: UnauthorizedRequest): void {
  const { token, logout } = useAuthStore.getState();
  if (failed.path !== '/auth/login' && token && failed.token === token) logout();
}
