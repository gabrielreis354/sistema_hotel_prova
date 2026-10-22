import { formatDateBR, formatDateTimeBR, type Cents } from '@hotel/domain';
import { cn } from '@hotel/ui';
import type { BillTimeline as Timeline, TimelineKind } from '../reservationLogic.js';
import { Money } from './primitives.js';

const KIND_LABEL: Record<TimelineKind, string> = {
  lodging: 'Diária',
  consumption: 'Consumo',
  payment: 'Pagamento',
};

// Marcador da linha: forma + cor, nunca só cor. Débito é ponto cheio; crédito, anel.
const KIND_DOT: Record<TimelineKind, string> = {
  lodging: 'bg-status-booked',
  consumption: 'bg-status-cleaning',
  payment: 'border-2 border-status-occupied bg-white',
};

/**
 * Conta da reserva em linha do tempo (CA-05.2.h): diárias, consumos e pagamentos em ordem,
 * com o saldo depois de cada linha. É uma tabela — o recepcionista lê coluna de valor no
 * fechamento, e coluna que "dança" é erro de leitura.
 */
export function BillTimeline({ timeline, balanceCents }: { timeline: Timeline; balanceCents: Cents }) {
  if (timeline.entries.length === 0) {
    return <p className="text-sm text-gray-600">Sem lançamentos nesta conta.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <caption className="sr-only">Lançamentos da conta em ordem cronológica</caption>
          <thead className="border-b border-gray-200 text-gray-600">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">Quando</th>
              <th scope="col" className="py-2 pr-3 font-medium">Lançamento</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Valor</th>
              <th scope="col" className="py-2 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {timeline.entries.map((e) => (
              <tr key={e.key} className={cn('border-b border-gray-100 last:border-0', e.notCounted && 'text-gray-500')}>
                <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-gray-700">
                  {e.at ? (e.dateOnly ? formatDateBR(e.at) : formatDateTimeBR(e.at)) : 'sem data'}
                </td>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', KIND_DOT[e.kind])} aria-hidden="true" />
                    <span>
                      <span className="sr-only">{KIND_LABEL[e.kind]}: </span>
                      {e.label}
                    </span>
                  </span>
                </td>
                <td className="py-2 pr-3 text-right">
                  <Money cents={e.amountCents} />
                  {e.notCounted && <span className="sr-only"> (não abate o saldo)</span>}
                </td>
                <td className="py-2 text-right">
                  <Money cents={e.balanceCents} className="text-gray-700" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-gray-200 pt-3 text-sm sm:grid-cols-4">
        <Total label="Diárias e consumos" cents={timeline.chargesCents} />
        <Total label="Pago" cents={timeline.paidCents} />
        <Total label="Aguardando" cents={timeline.pendingCents} />
        <Total label={balanceCents < 0 ? 'A devolver' : 'Saldo'} cents={Math.abs(balanceCents)} strong />
      </dl>
    </div>
  );
}

function Total({ label, cents, strong }: { label: string; cents: Cents; strong?: boolean }) {
  return (
    <div>
      <dt className="text-gray-600">{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'text-base font-semibold' : 'font-medium')}>
        <Money cents={cents} />
      </dd>
    </div>
  );
}
