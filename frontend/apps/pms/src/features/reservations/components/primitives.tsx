import type { ReactNode } from 'react';

/**
 * Peças pequenas do módulo de reservas, candidatas do CATALOGO.md: nascem aqui pela regra de
 * promoção e sobem no segundo módulo que precisar. O `ErrorState` já subiu (T-05.6) e vem do
 * @hotel/ui; `ButtonLink` e `BackLink` foram para `components/links.tsx` na T-08.6.
 */

// `Money` e `Notice` subiram para o @hotel/ui na T-05.3 (painel Hoje, segundo módulo).
// Reexportados aqui para as telas de reservas não mudarem de import.
export { Money, Notice } from '@hotel/ui';

// `PageHeader` subiu para o @hotel/ui na T-08.5 (SPEC-08): reexportado para os imports não mudarem.
export { PageHeader } from '@hotel/ui';

/** Rótulo pequeno + valor, para fichas de dados. */
export function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-gray-900">{children}</dd>
    </div>
  );
}
