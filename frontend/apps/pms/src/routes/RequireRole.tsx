import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.js';
import { homeForRole } from './roleHome.js';
import type { Role } from '../types.js';

/**
 * Gate de papel. Se o usuário não tem o papel exigido, volta para o home dele (não mostra
 * 403 cru — evita becos sem saída). O backend continua sendo a autoridade real de permissão.
 */
export function RequireRole({ allow }: { allow: Role[] }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />;
  return <Outlet />;
}
