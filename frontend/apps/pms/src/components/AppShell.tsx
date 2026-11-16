import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import { Ellipsis } from 'lucide-react';
import { Button, cn } from '@hotel/ui';
import { useAuthStore } from '../stores/auth.js';
import { mobileNavForRole, navItemsForRole, type NavItem } from '../routes/nav.js';
import { useMyTenant } from '../features/tenant/index.js';

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
  // Nome do hotel no cabeçalho (T-08.2): a mesma consulta do emissor do comprovante (T-09.1), em
  // cache por uma hora. Sem resposta, o lugar dele fica com "Gesway".
  const { data: tenant } = useMyTenant();

  // minmax(0,1fr): a coluna do conteúdo encolhe com a tela; com 1fr ela crescia até a tabela mais
  // larga e a página rolava de lado em 768 px (qa-explorador de 15/11, CA-08.g).
  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      {/* Sidebar — desktop */}
      <aside className="hidden border-r border-gray-200 bg-white md:flex md:flex-col">
        {/* Marca do produto em neutro: brand é "faça isto", não enfeite (GUIA_UI_CORPORATIVA, regra 2). */}
        <div className="px-4 py-4">
          <span className="text-lg font-semibold tracking-tight text-gray-900">Gesway</span>
        </div>
        <nav aria-label="Menu" className="flex-1 space-y-1 px-2">
          {items.map((item) => (
            <NavItemLink key={item.to} item={item} />
          ))}
        </nav>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
          {/* No celular, quem está logado fica embaixo do hotel: num aparelho compartilhado o garçom
              precisa ver de quem é a sessão antes de lançar (🟡-3 do qa-redteam de 15/11). */}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-900">{tenant?.name ?? 'Gesway'}</div>
            <div className="truncate text-support text-gray-600 sm:hidden">
              {user?.name} · {user ? ROLE_LABEL[user.role] : ''}
            </div>
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <div className="hidden min-w-0 truncate text-right text-sm sm:block">
              <span className="font-medium">{user?.name}</span>
              <span className="ml-2 text-gray-500">{user ? ROLE_LABEL[user.role] : ''}</span>
            </div>
            {/* 48 px até o xl (CA-08.g); compacto só no desktop. */}
            <Button variant="ghost" className="xl:h-9 xl:min-h-0 xl:px-3 xl:text-sm" onClick={logout}>
              Sair
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 pb-20 md:pb-4">
          <Outlet />
        </main>

        <MobileTabs primary={mobile.primary} more={mobile.more} />
      </div>
    </div>
  );
}

// Aba do celular: ícone em cima, rótulo embaixo (12 px, o piso da escala) — o rótulo nunca some.
const TAB = 'flex min-h-touch min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-center text-support';

/** Barra inferior do celular: abas diretas + "Mais" com o restante (só se houver restante). */
function MobileTabs({ primary, more }: { primary: NavItem[]; more: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const moreRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const inMore = more.some((i) => matchPath({ path: i.to, end: false }, pathname));

  // Navegou (por um item do "Mais" ou pela barra): a folha fecha.
  useEffect(() => setOpen(false), [pathname]);

  // A folha abriu: o foco entra nela, no primeiro item (🟢-3 do qa-redteam da T-05.3; decisão de
  // 15/11, SPEC-08 §9). Sem isso, quem usa teclado ou leitor de tela fica atrás do fundo escuro.
  useEffect(() => {
    if (open) sheetRef.current?.querySelector<HTMLElement>('a, button')?.focus();
  }, [open]);

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
          <div
            className="sheet-backdrop fixed inset-0 z-30 bg-gray-900/30"
            aria-hidden="true"
            onClick={() => {
              setOpen(false);
              moreRef.current?.focus(); // como o Esc: o foco não cai no body
            }}
          />
          <nav
            ref={sheetRef}
            id="menu-mais"
            aria-label="Mais opções"
            className="sheet-up fixed inset-x-0 bottom-12 z-30 rounded-t-lg border-t border-gray-200 bg-white p-2 shadow-lg"
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
                    <item.icon aria-hidden="true" className="mr-3 size-5 shrink-0" strokeWidth={1.75} />
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
            <item.icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
            <span className="max-w-full truncate">{item.label}</span>
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
            <Ellipsis aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
            <span>Mais</span>
          </Button>
        )}
      </nav>
    </div>
  );
}

/**
 * Item do menu lateral (T-08.2): ícone de traço fino + rótulo. Ativo = fundo brand/10, texto
 * brand e fio de 2 px à esquerda — o fio diz "você está aqui" mesmo para quem não distingue a cor.
 */
function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          // 48 px até o xl: a barra lateral já aparece no tablet (md), onde tinha 36 px (CA-08.g).
          'flex min-h-touch items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm xl:min-h-0',
          isActive
            ? 'border-brand bg-brand/10 font-medium text-brand'
            : 'border-transparent text-gray-700 hover:bg-gray-100',
        )
      }
    >
      <item.icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.75} />
      {item.label}
    </NavLink>
  );
}
