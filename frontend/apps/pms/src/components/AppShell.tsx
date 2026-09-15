import { NavLink, Outlet } from 'react-router-dom';
import { Button, cn } from '@hotel/ui';
import { useAuthStore } from '../stores/auth.js';
import { navItemsForRole } from '../routes/nav.js';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  RECEPTIONIST: 'Recepção',
  WAITER: 'Garçom',
};

/**
 * Casca do app: navegação lateral no desktop, barra inferior no mobile (§7.1). O menu é
 * filtrado pelo papel do usuário — a mesma fonte (nav.ts) que o RequireRole usa no gate.
 */
export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const items = user ? navItemsForRole(user.role) : [];

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      {/* Sidebar — desktop */}
      <aside className="hidden border-r border-gray-200 bg-white md:flex md:flex-col">
        <div className="px-4 py-4 text-lg font-semibold text-brand">Hotel PMS</div>
        <nav className="flex-1 space-y-1 px-2">
          {items.map((item) => (
            <NavItemLink key={item.to} to={item.to} label={item.label} />
          ))}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
          <div className="text-sm">
            <span className="font-medium">{user?.name}</span>
            <span className="ml-2 text-gray-500">{user ? ROLE_LABEL[user.role] : ''}</span>
          </div>
          <Button variant="ghost" size="compact" onClick={logout}>
            Sair
          </Button>
        </header>

        <main className="flex-1 p-4 pb-20 md:pb-4">
          <Outlet />
        </main>

        {/* Bottom tabs — mobile */}
        <nav className="fixed inset-x-0 bottom-0 flex border-t border-gray-200 bg-white md:hidden">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-touch flex-1 items-center justify-center text-sm',
                  isActive ? 'text-brand font-medium' : 'text-gray-500',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

function NavItemLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'block rounded-md px-3 py-2 text-sm',
          isActive ? 'bg-brand/10 text-brand font-medium' : 'text-gray-700 hover:bg-gray-100',
        )
      }
    >
      {label}
    </NavLink>
  );
}
