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
 * A mensagem de cada resposta de erro do login (🟡-2 do qa-explorador de 22/11). Só o 400 e o 401
 * dizem que o e-mail ou a senha estão errados. O 429 é o limite do nginx (5 por minuto por IP, e no
 * hotel os aparelhos saem pelo mesmo IP), e o 5xx é o sistema fora: dizer "credenciais inválidas"
 * nesses casos fazia a recepção redigitar uma senha certa.
 */
export function loginErrorForStatus(status: number): LoginError {
  if (status === 409) return new LoginError('E-mail existe em mais de um hotel — informe o subdomínio.', true);
  if (status === 429) return new LoginError('Muitas tentativas de entrar neste minuto. Aguarde um minuto e tente de novo.');
  if (status >= 500) return new LoginError('O sistema não respondeu. Tente de novo em instantes.');
  return new LoginError('Credenciais inválidas.');
}

/** Autentica contra POST /auth/login — corpo e resposta (LoginResponse) tipados pelo Swagger. */
export async function login(input: LoginInput): Promise<LoginResult> {
  const { data, error, response } = await api.POST('/auth/login', {
    body: input,
  });

  if (error || !response.ok) throw loginErrorForStatus(response.status);

  return data;
}
