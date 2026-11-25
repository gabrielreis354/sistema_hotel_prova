import { useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { decimalToCents, formatDateBR, todayISO } from '@hotel/domain';
import { Button, Card, EmptyState, ErrorState, Field, Input, RoomNumber, SegmentedControl, Spinner, THead, Td, Th, Tr, cn } from '@hotel/ui';
import { useReservationList } from './queries.js';
import { PERIOD_PRESETS, pageCount, presetRange, safeNights, type PeriodPreset } from './reservationLogic.js';
import { ReservationStatusBadge } from './components/ReservationStatusBadge.js';
import { Money, PageHeader } from './components/primitives.js';
import { ButtonLink } from '../../components/links.js';

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

  const query = useReservationList({ from, to, page, limit: PAGE_SIZE });
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
    // À esquerda, como o detalhe e a nova reserva (R-7): o fluxo lista → detalhe não "pula" (🟡3 do qa-redteam da F4).
    <div className="max-w-5xl space-y-4">
      <PageHeader title="Reservas" action={<ButtonLink to="/reservas/nova" size="compact">Nova reserva</ButtonLink>} />

      <Card className="space-y-3 p-4">
        {/* Filtro, não ação: grupo segmentado com o ativo tingido (decisão de 25/11, F5). Antes o ativo era o
            verde sólido do botão principal, que diz "faça isto". */}
        <SegmentedControl
          label="Atalhos de período"
          value={activePreset ?? null}
          options={PERIOD_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
          onChange={applyPreset}
        />
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
          // Secundária: o "Nova reserva" do cabeçalho já é a ação principal (CA-08.e).
          action={
            <ButtonLink to="/reservas/nova" variant="secondary">
              Nova reserva
            </ButtonLink>
          }
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
              <THead>
                <Th>Hóspede</Th>
                <Th className="hidden sm:table-cell">Quarto</Th>
                <Th className="hidden sm:table-cell">Período</Th>
                <Th align="right" className="hidden md:table-cell">
                  Total
                </Th>
                <Th>Status</Th>
              </THead>
              <tbody>
                {result.data.map((r) => {
                  const nights = r.check_in_date && r.check_out_date ? safeNights(r.check_in_date, r.check_out_date) : null;
                  const stay = nights !== null ? ` · ${nights} ${nights === 1 ? 'diária' : 'diárias'}` : '';
                  return (
                    <Tr key={r.id}>
                      <Td>
                        {/* Celular: o quarto em destaque à esquerda, o nome e o período curto (sem o ano) em
                            duas linhas — eram 4 por reserva, e cabiam ~5 por tela (decisão de 25/11, F5). */}
                        <div className="flex items-center gap-2 sm:gap-3">
                          <RoomNumber number={r.room?.number ?? '—'} className="max-w-16 sm:hidden" />
                          {/* O link envolve as duas linhas: no celular o alvo de toque é a reserva inteira. */}
                          <Link
                            to={`/reservas/${r.id}`}
                            className="flex min-h-touch min-w-0 flex-col justify-center rounded-sm py-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand desk:min-h-0"
                          >
                            <span className="font-medium text-brand">{r.guest?.full_name ?? 'Hóspede removido'}</span>
                            <span className="block text-xs text-gray-600 tabular-nums sm:hidden">
                              {/* O quarto já está no selo à esquerda; o leitor de tela o ouve aqui. Período e
                                  diárias não se partem por dentro: se faltar espaço, só as diárias descem. */}
                              <span className="sr-only">{`Quarto ${r.room?.number ?? '—'} · `}</span>
                              <span className="whitespace-nowrap">{shortPeriod(r.check_in_date, r.check_out_date)}</span>
                              {/* O espaço fora dos dois pedaços é o ponto de quebra: colados, viravam um bloco só
                                  de ~150 px, e a tabela rolava de lado em 360 px. */}
                              {stay && (
                                <>
                                  {' '}
                                  <span className="whitespace-nowrap">{stay.trimStart()}</span>
                                </>
                              )}
                            </span>
                          </Link>
                        </div>
                      </Td>
                      <Td className="hidden tabular-nums sm:table-cell">{r.room?.number ?? '—'}</Td>
                      <Td className="hidden tabular-nums text-gray-700 sm:table-cell">
                        {period(r.check_in_date, r.check_out_date)}
                        {nights !== null && <span className="ml-1 text-gray-600">{stay}</span>}
                      </Td>
                      <Td align="right" className="hidden md:table-cell">
                        {r.total_amount ? <Money cents={decimalToCents(r.total_amount)} /> : '—'}
                      </Td>
                      <Td>
                        <ReservationStatusBadge status={r.status} />
                      </Td>
                    </Tr>
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

function valid(value: string | null): string | undefined {
  return value && ISO_RE.test(value) ? value : undefined;
}

/** "24/11 → 26/11": no celular o ano sai (a lista já é de um período curto). */
function shortPeriod(checkIn?: string, checkOut?: string): string {
  if (!checkIn || !checkOut) return '—';
  return `${formatDateBR(checkIn).slice(0, 5)} → ${formatDateBR(checkOut).slice(0, 5)}`;
}

function period(checkIn?: string, checkOut?: string): string {
  if (!checkIn || !checkOut) return '—';
  return `${formatDateBR(checkIn)} → ${formatDateBR(checkOut)}`;
}
