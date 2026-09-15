import { createApiClient } from '@hotel/api-client';
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
  onUnauthorized: () => {
    // Só derruba se havia sessão — evita interferir no 401 do próprio login (credenciais
    // inválidas), que a tela de login trata sozinha.
    if (useAuthStore.getState().token) useAuthStore.getState().logout();
  },
});
