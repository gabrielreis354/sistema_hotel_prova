import type { ReactNode } from 'react';
import { cn } from './cn.js';

/** Contêiner de conteúdo — cartão branco padrão. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white', className)}>{children}</div>
  );
}

/** Spinner de carregamento acessível. */
export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-gray-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand" />
      {label}
    </div>
  );
}

/**
 * Estado vazio com ação sugerida (§10: todo estado vazio traz o próximo passo). `action`
 * costuma ser um Button.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
