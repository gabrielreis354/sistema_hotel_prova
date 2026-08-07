import { createApiClient } from '@hotel/api-client';
import { useAuthStore } from '../stores/auth.js';

/**
 * Cliente único da aplicação. O token é lido do store a cada request (getState fora de
 * React), então login/logout refletem sem recriar o cliente. baseUrl `/api` cai no proxy
 * do Vite em dev.
 */
export const api = createApiClient({
  getToken: () => useAuthStore.getState().token,
});
