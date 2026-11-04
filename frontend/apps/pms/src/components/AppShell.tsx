import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import { Button, cn } from '@hotel/ui';
import { useAuthStore } from '../stores/auth.js';
import { mobileNavForRole, navItemsForRole, type NavItem } from '../routes/nav.js';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  RECEPTIONIST: 'Recepção',
  WAITER: 'Garçom',
};

/**
 * Casca do app: navegação lateral no desktop, barra inferior no mobile (§7.1). O menu é
 * filtrado pelo papel do usuário — a mesma fonte (nav.ts) que o RequireRole usa no gate.
 * No celular, no máximo 5 abas; o que não cabe vai para "Mais" (D-3, T-05.3).
 */
export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const items = user ? navItemsForRole(user.role) : [];
  const mobile = user ? mobileNavForRole(user.role) : { primary: [], more: [] };

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

        <MobileTabs primary={mobile.primary} more={mobile.more} />
      </div>
    </div>
  );
}

const TAB = 'flex min-h-touch min-w-0 flex-1 items-center justify-center px-1 text-center text-sm leading-tight';

/** Barra inferior do celular: abas diretas + "Mais" com o restante (só se houver restante). */
function MobileTabs({ primary, more }: { primary: NavItem[]; more: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const moreRef = useRef<HTMLButtonElement>(null);
  const inMore = more.some((i) => matchPath({ path: i.to, end: false }, pathname));

  // Navegou (por um item do "Mais" ou pela barra): a folha fecha.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        moreRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      {open && (
        <>
          {/* Fundo: toque fora fecha. Não é foco de teclado — o Esc faz o mesmo. */}
          <div className="fixed inset-0 z-30 bg-gray-900/30" aria-hidden="true" onClick={() => setOpen(false)} />
          <nav
            id="menu-mais"
            aria-label="Mais opções"
            className="fixed inset-x-0 bottom-12 z-40 rounded-t-lg border-t border-gray-200 bg-white p-2 shadow-lg"
          >
            <ul>
              {more.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex min-h-touch items-center rounded-md px-4 text-base',
                        isActive ? 'bg-brand/10 font-medium text-brand' : 'text-gray-800 hover:bg-gray-100',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}

      <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-gray-200 bg-white">
        {primary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => cn(TAB, isActive ? 'font-medium text-brand' : 'text-gray-600')}
          >
            {item.label}
          </NavLink>
        ))}
        {more.length > 0 && (
          <Button
            ref={moreRef}
            variant="ghost"
            aria-expanded={open}
            aria-controls="menu-mais"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              TAB,
              'rounded-none font-normal hover:bg-transparent focus-visible:ring-inset focus-visible:ring-brand focus-visible:ring-offset-0',
              open || inMore ? 'font-medium text-brand' : 'text-gray-600',
            )}
          >
            Mais
          </Button>
        )}
      </nav>
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
