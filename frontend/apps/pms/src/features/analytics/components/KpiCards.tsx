import { Card } from '@hotel/ui';
import type { Kpi } from '../kpis.js';

/**
 * Os 4 números do dia (RT-48). No celular é a tela inteira (CA-05.6.c): 2 × 2, número grande,
 * sem gráfico. `busy` marca a região enquanto as fontes carregam.
 */
export function KpiCards({ kpis, busy }: { kpis: Kpi[]; busy: boolean }) {
  return (
    <ul aria-busy={busy} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((k) => (
        <li key={k.id}>
          <Card className="h-full p-4">
            <p className="text-sm text-gray-500">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</p>
            <p className="mt-1 text-xs text-gray-500">{k.hint}</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}
