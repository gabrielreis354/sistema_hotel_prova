import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@hotel/ui';

const TABS = [
  { to: '/quartos', label: 'Quartos', end: true },
  { to: '/quartos/categorias', label: 'Categorias', end: false },
] as const;

/**
 * Cabeçalho das duas listas do módulo: título, troca Quartos ↔ Categorias e a ação principal.
 * Categorias moram dentro de Quartos para não ocupar mais uma aba na barra inferior do celular.
 */
export function RoomsHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        {action}
      </div>
      <nav aria-label="Quartos e categorias" className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                '-mb-px inline-flex min-h-touch items-center border-b-2 px-4 text-sm md:min-h-0 md:py-2',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                isActive ? 'border-brand font-medium text-brand' : 'border-transparent text-gray-600 hover:text-gray-900',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
