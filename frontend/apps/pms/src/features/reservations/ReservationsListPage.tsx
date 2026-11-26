import { useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { decimalToCents, formatDateBR, todayISO } from '@hotel/domain';
import { Button, Card, EmptyState, ErrorState, Field, Input, RoomNumber, SegmentedControl, Spinner, THead, Table, Td, Th, Tr, cn } from '@hotel/ui';
import { useReservationList } from './queries.js';
import { PERIOD_PRESETS, pageCount, presetRange, safeNights, shortPeriod, type PeriodPreset } from './reservationLogic.js';
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
    // Lista na coluna inteira, como o Hoje e os Indicadores (R-7 revista em 26/11). O detalhe segue com 1024 px.
    <div className="space-y-4">
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
          {/* O Table do @hotel/ui rola dentro do cartão (overflow-x-auto): com overflow-hidden, a 768 px o Status
              saía cortado ("Hos…"), justo a coluna que decide a ação (critique da F5, P1). As colunas só abrem no
              lg: no tablet a barra lateral come 236 px e sobram ~466 px, menos que um celular deitado; até lá a
              reserva fica nas duas linhas do celular. */}
          <div
            className={cn(
              'transition-opacity duration-150 motion-reduce:transition-none',
              query.isPlaceholderData && 'opacity-60',
            )}
          >
            <Table caption={`Reservas de ${formatDateBR(from)} a ${formatDateBR(to)}`}>
              <THead>
                <Th>Hóspede</Th>
                <Th className="hidden lg:table-cell">Quarto</Th>
                <Th className="hidden lg:table-cell">Período</Th>
                <Th align="right" className="hidden lg:table-cell">
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
                        {/* Abaixo do lg: o quarto em destaque à esquerda, o nome e o período curto em duas linhas
                            (decisão de 25/11, F5). O link envolve o selo e as duas linhas: o número do quarto é o
                            maior alvo da linha e também abre a reserva (🟡4 do qa-redteam da F5). */}
                        <Link
                          to={`/reservas/${r.id}`}
                          className="group flex min-h-touch min-w-0 items-center gap-2 rounded-sm py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand desk:min-h-0"
                        >
                          <RoomNumber number={r.room?.number ?? '—'} className="max-w-16 lg:hidden" />
                          <span className="flex min-w-0 flex-col">
                            <span className="font-medium text-brand group-hover:underline">{r.guest?.full_name ?? 'Hóspede removido'}</span>
                            <span className="block text-xs text-gray-600 tabular-nums lg:hidden">
                              {/* O selo é aria-hidden; o leitor de tela ouve o quarto aqui. Período e diárias não se
                                  partem por dentro: se faltar espaço, só as diárias descem. */}
                              <span className="sr-only">{`Quarto ${r.room?.number ?? '—'} · `}</span>
                              <span className="whitespace-nowrap">{shortPeriod(r.check_in_date, r.check_out_date, from, to)}</span>
                              {/* O espaço fora dos dois pedaços é o ponto de quebra: colados, viravam um bloco só
                                  de ~150 px, e a tabela rolava de lado em 360 px. */}
                              {stay && (
                                <>
                                  {' '}
                                  <span className="whitespace-nowrap">{stay.trimStart()}</span>
                                </>
                              )}
                            </span>
                          </span>
                        </Link>
                      </Td>
                      <Td className="hidden tabular-nums lg:table-cell">{r.room?.number ?? '—'}</Td>
                      <Td className="hidden whitespace-nowrap tabular-nums text-gray-700 lg:table-cell">
                        {period(r.check_in_date, r.check_out_date)}
                        {nights !== null && <span className="ml-1 text-gray-600">{stay}</span>}
                      </Td>
                      <Td align="right" className="hidden lg:table-cell">
                        {r.total_amount ? <Money cents={decimalToCents(r.total_amount)} /> : '—'}
                      </Td>
                      <Td className="whitespace-nowrap">
                        <ReservationStatusBadge status={r.status} />
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

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

function period(checkIn?: string, checkOut?: string): string {
  if (!checkIn || !checkOut) return '—';
  return `${formatDateBR(checkIn)} → ${formatDateBR(checkOut)}`;
}
