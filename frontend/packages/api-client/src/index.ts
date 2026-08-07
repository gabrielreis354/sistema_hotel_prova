import createClient, { type Client } from 'openapi-fetch';
import type { paths } from './schema.js';

export interface ApiClientOptions {
  /**
   * Base das requisições. Default `/api` — o proxy de dev do Vite reescreve para o backend
   * (mesma origem no browser, sem CORS). Em produção, aponte para a origem real da API.
   */
  baseUrl?: string;
  /** Fonte do JWT. Injetado como `Authorization: Bearer` a cada request quando presente. */
  getToken?: () => string | null | undefined;
}

/**
 * Cria o cliente tipado. O token é injetado por um middleware, não fixado na criação —
 * assim o mesmo cliente acompanha login/logout sem ser recriado.
 */
export function createApiClient(options: ApiClientOptions = {}): Client<paths> {
  const { baseUrl = '/api', getToken } = options;
  const client = createClient<paths>({ baseUrl });

  if (getToken) {
    client.use({
      onRequest({ request }) {
        const token = getToken();
        if (token) request.headers.set('Authorization', `Bearer ${token}`);
        return request;
      },
    });
  }

  return client;
}

export type ApiClient = Client<paths>;
export type { paths, components } from './schema.js';
