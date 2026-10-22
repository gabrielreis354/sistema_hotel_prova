import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@hotel/ui';

/** Moldura das telas de cadastro e edição: volta, título, conteúdo. */
export function FormShell({
  title,
  backTo,
  backLabel,
  children,
}: {
  title: string;
  backTo: string;
  backLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link to={backTo} className="inline-flex min-h-touch items-center text-sm text-brand hover:underline md:min-h-0">
        ← {backLabel}
      </Link>
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

/** Registro que sumiu (404): diz o provável motivo e devolve à lista. */
export function NotFound({ title, backTo, backLabel }: { title: string; backTo: string; backLabel: string }) {
  return (
    <EmptyState
      title={title}
      description="Pode ter sido excluído por outra pessoa."
      action={
        <Link to={backTo} className="text-sm font-medium text-brand hover:underline">
          {backLabel}
        </Link>
      }
    />
  );
}
