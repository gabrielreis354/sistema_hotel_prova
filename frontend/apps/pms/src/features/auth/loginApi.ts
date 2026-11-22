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
 * A mensagem de cada resposta de erro do login (🟡-2 do qa-explorador de 22/11). Lista fechada (🟡-2
 * do red team de 22/11): só o 400 e o 401 dizem que o e-mail ou a senha estão errados. O 429 é o
 * limite do nginx (5 por minuto por IP, e no hotel os aparelhos saem pelo mesmo IP); o 5xx é o
 * sistema com problema; qualquer outro (um 404 de build sem VITE_API_URL, por exemplo) fica com a
 * frase genérica. Dizer "credenciais inválidas" nesses casos fazia a recepção redigitar uma senha certa.
 */
export function loginErrorForStatus(status: number): LoginError {
  if (status === 400 || status === 401) return new LoginError('Credenciais inválidas.');
  if (status === 409) return new LoginError('E-mail existe em mais de um hotel — informe o subdomínio.', true);
  if (status === 429) return new LoginError('Muitas tentativas de entrar a partir desta rede. Aguarde um minuto e tente de novo.');
  if (status >= 500) return new LoginError('O sistema está com problema agora. Tente de novo em instantes.');
  return new LoginError('Não foi possível entrar. Tente novamente.');
}

/** Autentica contra POST /auth/login — corpo e resposta (LoginResponse) tipados pelo Swagger. */
export async function login(input: LoginInput): Promise<LoginResult> {
  const { data, error, response } = await api.POST('/auth/login', {
    body: input,
  });

  if (error || !response.ok) throw loginErrorForStatus(response.status);

  return data;
}
