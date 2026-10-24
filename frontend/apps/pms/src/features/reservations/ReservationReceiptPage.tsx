import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RESERVATION_STATUS_LABEL, formatDateBR, formatDateTimeBR } from '@hotel/domain';
import { Button, Spinner } from '@hotel/ui';
import { useBill, useReservation } from './queries.js';
import { buildBillTimeline, isReservationStatus, maskCpf, officialBalanceCents, safeNights } from './reservationLogic.js';
import { ErrorState, Money } from './components/primitives.js';

/**
 * Comprovante da conta para entregar no check-out (CA-05.2.k). Rota fora do AppShell, de
 * propósito: a página impressa sai só com o comprovante, sem menu nem cabeçalho do sistema,
 * e sem mexer na casca. A impressão (ou "Salvar como PDF" do navegador) usa o próprio diálogo
 * do sistema — nada de gerar PDF no cliente.
 */
export function ReservationReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const reservation = useReservation(id);
  const bill = useBill(id);

  if (reservation.isPending || bill.isPending) {
    return (
      <div className="p-6">
        <Spinner label="Montando comprovante…" />
      </div>
    );
  }
  if (reservation.isError || bill.isError || !reservation.data || !bill.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-6">
        <ErrorState message="Não foi possível montar o comprovante." onRetry={() => { reservation.refetch(); bill.refetch(); }} />
        <Link to={`/reservas/${id}`} className="text-sm text-brand hover:underline">
          ← Voltar à reserva
        </Link>
      </div>
    );
  }

  const r = reservation.data;
  const timeline = buildBillTimeline(bill.data);
  const balance = officialBalanceCents(bill.data);
  const nights = r.check_in_date && r.check_out_date ? safeNights(r.check_in_date, r.check_out_date) : null;
  const rooms = r.rooms && r.rooms.length > 0 ? r.rooms : r.room ? [r.room] : [];
  const cpfMasked = maskCpf(r.guest?.cpf);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-4 print:hidden">
        <Link to={`/reservas/${id}?aba=conta`} className="text-sm text-brand hover:underline">
          ← Voltar à reserva
        </Link>
        <Button onClick={() => window.print()}>Imprimir</Button>
      </div>

      <article className="mx-auto max-w-2xl space-y-6 p-6 text-gray-900 print:max-w-none print:p-0">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-gray-500">Comprovante de conta</p>
          <h1 className="text-xl font-semibold">{r.guest?.full_name ?? 'Hóspede'}</h1>
          <p className="text-sm text-gray-700 tabular-nums">
            Quarto {rooms.map((x) => x.number).join(', ') || '—'} ·{' '}
            {r.check_in_date && r.check_out_date ? `${formatDateBR(r.check_in_date)} a ${formatDateBR(r.check_out_date)}` : '—'}
            {nights !== null && ` · ${nights} ${nights === 1 ? 'diária' : 'diárias'}`}
          </p>
          <p className="text-sm text-gray-700">
            Situação: {isReservationStatus(r.status) ? RESERVATION_STATUS_LABEL[r.status] : r.status}
            {/* CPF mascarado: minimização (LGPD art. 6º, III) — o papel fica na mesa e no lixo. */}
            {cpfMasked ? ` · CPF ${cpfMasked}` : ''}
          </p>
        </header>

        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-300 text-gray-600">
            <tr>
              <th scope="col" className="py-1.5 pr-3 font-medium">Data</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Descrição</th>
              <th scope="col" className="py-1.5 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {timeline.entries.map((e) => (
              <tr key={e.key} className="border-b border-gray-100">
                <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">
                  {e.at ? (e.dateOnly ? formatDateBR(e.at) : formatDateTimeBR(e.at)) : '—'}
                </td>
                <td className="py-1.5 pr-3">{e.label}</td>
                <td className="py-1.5 text-right">
                  <Money cents={e.amountCents} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto max-w-xs space-y-1 text-sm">
          <Line label="Diárias e consumos"><Money cents={timeline.chargesCents} /></Line>
          <Line label="Pago"><Money cents={timeline.paidCents} /></Line>
          {timeline.pendingCents > 0 && (
            <Line label="Aguardando confirmação"><Money cents={timeline.pendingCents} /></Line>
          )}
          <div className="flex justify-between border-t border-gray-300 pt-1 text-base font-semibold">
            <dt>{balance < 0 ? 'A devolver' : 'Saldo'}</dt>
            <dd><Money cents={Math.abs(balance)} /></dd>
          </div>
        </dl>

        <footer className="border-t border-gray-200 pt-3 text-xs text-gray-500">
          Emitido em {formatDateTimeBR(new Date())} (horário de Brasília). Documento sem valor fiscal.
        </footer>
      </article>
    </div>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-700">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
