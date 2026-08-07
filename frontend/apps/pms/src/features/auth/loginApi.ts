import { api } from '../../lib/api.js';
import type { AuthUser } from '../../types.js';

export interface LoginInput {
  email: string;
  password: string;
  subdomain?: string;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

export class LoginError extends Error {
  constructor(
    message: string,
    readonly requiresSubdomain = false,
  ) {
    super(message);
    this.name = 'LoginError';
  }
}

/**
 * Autentica contra POST /auth/login. Usa o cliente tipado para a rota e o corpo; o corpo
 * da resposta 200 ainda não tem schema no Swagger (pendência para o backend documentar),
 * então tipamos o retorno localmente.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const { data, error, response } = await api.POST('/auth/login', {
    body: input,
  });

  if (response.status === 409) {
    throw new LoginError('E-mail existe em mais de um hotel — informe o subdomínio.', true);
  }
  if (error || !response.ok) {
    throw new LoginError('Credenciais inválidas.');
  }

  return data as unknown as LoginResult;
}
