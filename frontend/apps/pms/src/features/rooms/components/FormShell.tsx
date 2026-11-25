import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@hotel/ui';

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
      <Link to={backTo} className="inline-flex min-h-touch items-center text-sm text-brand hover:underline desk:min-h-0">
        ← {backLabel}
      </Link>
      <PageHeader title={title} />
      {children}
    </div>
  );
}
