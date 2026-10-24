import { useEffect, type ReactNode } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { decimalToCents, formatDateBR, todayISO } from '@hotel/domain';
import { Button, Card, EmptyState, Field, Input, Spinner, cn } from '@hotel/ui';
import { useReservationList } from './queries.js';
import { PERIOD_PRESETS, pageCount, presetRange, safeNights, type PeriodPreset } from './reservationLogic.js';
import { ReservationStatusBadge } from './components/ReservationStatusBadge.js';
import { ButtonLink, ErrorState, Money, PageHeader } from './components/primitives.js';

const PAGE_SIZE = 20;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lista de reservas (CA-05.2.a). Período e página moram na URL: voltar do detalhe devolve o
 * recepcionista para o mesmo recorte, e o link pode ser colado para o colega.
 * O recorte e a paginação são do SERVIDOR (?from=&to=&page=&limit=) — nada de baixar o tenant.
 */
export function ReservationsListPage() {
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const fallback = presetRange('next7', today);
  const from = valid(params.get('de')) ?? fallback.from;
  const to = valid(params.get('ate')) ?? fallback.to;
  const page = Math.max(1, Number.parseInt(params.get('pagina') ?? '1', 10) || 1);
  const rangeOk = from <= to;

  const query = useReservationList({ from, to, page, limit: PAGE_SIZE }, rangeOk);
  const result = rangeOk ? query.data : undefined;
  const pages = result ? pageCount(result.total, result.limit) : 1;

  function update(next: { de?: string; ate?: string; pagina?: number }) {
    const merged = new URLSearchParams(params);
    if (next.de !== undefined) merged.set('de', next.de);
    if (next.ate !== undefined) merged.set('ate', next.ate);
    // Mudou o período: volta para a primeira página.
    merged.set('pagina', String(next.pagina ?? 1));
    setParams(merged, { replace: true });
  }

  function applyPreset(id: PeriodPreset) {
    const r = presetRange(id, today);
    update({ de: r.from, ate: r.to });
  }

  // ?pagina além da última (link antigo, reserva cancelada que encolheu a lista): volta para a
  // última página válida em vez de mostrar uma tabela vazia com "Página 99 de 2".
  const outOfRange = !!result && result.total > 0 && page > pages;
  useEffect(() => {
    if (!outOfRange) return;
    const merged = new URLSearchParams(params);
    merged.set('pagina', String(pages));
    setParams(merged, { replace: true });
  }, [outOfRange, pages, params, setParams]);

  const activePreset = PERIOD_PRESETS.find((p) => {
    const r = presetRange(p.id, today);
    return r.from === from && r.to === to;
  })?.id;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Reservas" action={<ButtonLink to="/reservas/nova">Nova reserva</ButtonLink>} />

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Atalhos de período">
          {PERIOD_PRESETS.map((p) => (
            <Button
              key={p.id}
              size="compact"
              variant={activePreset === p.id ? 'primary' : 'secondary'}
              aria-pressed={activePreset === p.id}
              onClick={() => applyPreset(p.id)}
              className="min-h-touch md:min-h-0"
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Field label="De">
            <Input type="date" value={from} onChange={(e) => valid(e.target.value) && update({ de: e.target.value })} />
          </Field>
          <Field label="Até">
            <Input
              type="date"
              value={to}
              min={from}
              aria-invalid={!rangeOk}
              onChange={(e) => valid(e.target.value) && update({ ate: e.target.value })}
            />
          </Field>
        </div>
        <p className="text-sm text-gray-600">
          {rangeOk
            ? 'Mostra as reservas com estadia dentro do período — inclusive quem já está na casa.'
            : 'A data final precisa ser igual ou depois da inicial.'}
        </p>
      </Card>

      {rangeOk && query.isPending && <Spinner label="Carregando reservas…" />}

      {rangeOk && query.isError && (
        <ErrorState message="Não foi possível carregar as reservas." onRetry={() => query.refetch()} />
      )}

      {result && result.total === 0 && (
        <EmptyState
          title="Nenhuma reserva neste período"
          description="Amplie o período nos atalhos acima ou crie uma reserva para o hóspede no balcão."
          action={<ButtonLink to="/reservas/nova">Nova reserva</ButtonLink>}
        />
      )}

      {result && result.total > 0 && !outOfRange && (
        <>
          <Card
            className={cn(
              'overflow-hidden transition-opacity duration-150 motion-reduce:transition-none',
              query.isPlaceholderData && 'opacity-60',
            )}
          >
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Reservas de {formatDateBR(from)} a {formatDateBR(to)}</caption>
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
                <tr>
                  <Th>Hóspede</Th>
                  <Th>Quarto</Th>
                  <Th className="hidden sm:table-cell">Período</Th>
                  <Th className="hidden text-right md:table-cell">Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((r) => {
                  const nights = r.check_in_date && r.check_out_date ? safeNights(r.check_in_date, r.check_out_date) : null;
                  return (
                    <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <Link
                          to={`/reservas/${r.id}`}
                          className="flex min-h-touch items-center font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:min-h-0 md:py-1"
                        >
                          {r.guest?.full_name ?? 'Hóspede removido'}
                        </Link>
                        {/* No celular o período vem embaixo do nome — a coluna some. */}
                        <span className="block text-xs text-gray-600 tabular-nums sm:hidden">
                          {period(r.check_in_date, r.check_out_date)}
                        </span>
                      </td>
                      <td className="px-4 py-2 tabular-nums">{r.room?.number ?? '—'}</td>
                      <td className="hidden px-4 py-2 tabular-nums text-gray-700 sm:table-cell">
                        {period(r.check_in_date, r.check_out_date)}
                        {nights !== null && (
                          <span className="ml-1 text-gray-500">· {nights} {nights === 1 ? 'diária' : 'diárias'}</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-2 text-right md:table-cell">
                        {r.total_amount ? <Money cents={decimalToCents(r.total_amount)} /> : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <ReservationStatusBadge status={r.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Paginação">
            <p className="text-sm text-gray-600 tabular-nums">
              Página {result.page} de {pages} · {result.total} {result.total === 1 ? 'reserva' : 'reservas'}
            </p>
            {/* Uma página só: os botões não têm o que fazer e só ocupariam o polegar. */}
            {pages > 1 && <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                aria-label="Página anterior"
                onClick={() => update({ pagina: page - 1 })}
              >
                ← Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={page >= pages}
                aria-label="Próxima página"
                onClick={() => update({ pagina: page + 1 })}
              >
                Próxima →
              </Button>
            </div>}
          </nav>
        </>
      )}
    </div>
  );
}

/** Cabeçalho de coluna. Candidato ao `Table` do CATALOGO.md, que hóspedes também vai usar. */
function Th({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <th scope="col" className={cn('px-4 py-2 font-medium', className)}>
      {children}
    </th>
  );
}

function valid(value: string | null): string | undefined {
  return value && ISO_RE.test(value) ? value : undefined;
}

function period(checkIn?: string, checkOut?: string): string {
  if (!checkIn || !checkOut) return '—';
  return `${formatDateBR(checkIn)} → ${formatDateBR(checkOut)}`;
}
