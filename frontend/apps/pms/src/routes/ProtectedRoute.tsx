import { Fragment } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.js';

/**
 * Bloqueia rotas autenticadas: sem token, manda para /login. A `key` remonta as telas quando o
 * usuário muda em outra aba. Esvaziar o cache não basta: tela montada segue mostrando os dados
 * do usuário anterior, mesmo de outro hotel.
 */
export function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.user?.id);
  if (!token) return <Navigate to="/login" replace />;
  return (
    <Fragment key={userId}>
      <Outlet />
    </Fragment>
  );
}
