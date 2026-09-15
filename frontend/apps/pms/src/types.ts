/** Papéis de usuário do PMS. Espelha o CHECK do backend (ADMIN, RECEPTIONIST, WAITER). */
export type Role = 'ADMIN' | 'RECEPTIONIST' | 'WAITER';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}
