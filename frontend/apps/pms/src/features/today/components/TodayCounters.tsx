import { Card, ErrorState } from '@hotel/ui';

export interface Counter {
  id: string;
  label: string;
  /** null = ainda não dá para calcular (carregando ou a fonte falhou). */
  value: string | null;
  hint: string;
}

/**
 * Os números do dia no topo (CA-05.3.e, RT-12): vendidos, ocupados, livres, em limpeza e
 * ocupação. No celular é 2 colunas, visível sem rolar — é o que o gerente olha andando.
 */
export function TodayCounters({ counters, busy, error, onRetry }: { counters: Counter[]; busy: boolean; error: Error | null; onRetry: () => void }) {
  return (
    <section aria-label="Números do dia" className="space-y-2">
      {error && <ErrorState message={error.message} onRetry={onRetry} />}
      <ul aria-busy={busy} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {counters.map((c) => (
          <li key={c.id} className={c.id === 'sold' ? 'col-span-2 sm:col-span-1' : undefined}>
            <Card className="h-full px-3 py-2">
              <p className="text-xs font-medium text-gray-600">{c.label}</p>
              <p className="text-2xl font-semibold tabular-nums text-gray-900">{c.value ?? '—'}</p>
              <p className="text-xs text-gray-600">{c.hint}</p>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
