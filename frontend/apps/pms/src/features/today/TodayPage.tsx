import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateBR } from '@hotel/domain';
import { ErrorState, Notice, Spinner, cn } from '@hotel/ui';
import { ButtonLink } from '../reservations/index.js';
import { useOccupancy } from '../analytics/index.js';
import { useArrivals, useHotelToday, useInHouse, useTodayAlerts } from './queries.js';
import { arrivalRows, departureRows, formatPercent, inHouseRows, soldToday } from './todayLogic.js';
import { TodayBlock } from './components/TodayBlock.js';
import { TodayCounters, type Counter } from './components/TodayCounters.js';
import { ArrivalItem, CleaningItem, DepartureItem, InHouseItem, RowList, type Feedback } from './components/rows.js';

const NO_IDS: ReadonlySet<string> = new Set();

/**
 * Painel "Hoje" (T-05.3, CA-05.3.a a g) — a tela inicial da recepção, que o gerente também abre
 * no celular. Ordem dos blocos FIXA (D-4): números do dia, atenção, chegadas, saídas, na casa,
 * em limpeza. Cada bloco carrega e falha sozinho.
 */
export function TodayPage() {
  const today = useHotelToday();
  const inHouse = useInHouse();
  const arrivals = useArrivals(today);
  const alerts = useTodayAlerts();
  const occupancy = useOccupancy(today);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const noShowIds = alerts.data?.noShowIds ?? NO_IDS;
  const arrivalList = useMemo(() => arrivalRows(arrivals.data?.data ?? [], today, noShowIds), [arrivals.data, today, noShowIds]);
  const departureList = useMemo(() => departureRows(inHouse.data?.data ?? [], today), [inHouse.data, today]);
  const inHouseList = useMemo(() => inHouseRows(inHouse.data?.data ?? []), [inHouse.data]);
  const cleaning = alerts.data?.cleaning ?? [];

  const occ = occupancy.data;
  const counters: Counter[] = [
    {
      id: 'sold',
      label: 'Vendidos hoje',
      value: occ?.occupied !== undefined && arrivals.data ? String(soldToday(occ.occupied, arrivalList)) : null,
      hint: 'ocupados + chegadas de hoje',
    },
    { id: 'occupied', label: 'Ocupados', value: occ?.occupied !== undefined ? String(occ.occupied) : null, hint: 'agora' },
    { id: 'free', label: 'Livres', value: occ?.available !== undefined ? String(occ.available) : null, hint: 'prontos para vender' },
    { id: 'cleaning', label: 'Em limpeza', value: occ?.cleaning !== undefined ? String(occ.cleaning) : null, hint: 'saíram, não liberados' },
    {
      id: 'rate',
      label: 'Ocupação',
      value: occ?.occupancy_rate !== undefined ? formatPercent(occ.occupancy_rate) : null,
      hint: occ?.total_rooms !== undefined ? `de ${occ.total_rooms} quartos` : 'do hotel',
    },
  ];

  const noShowCount = arrivalList.filter((a) => a.noShowRisk).length;
  const lateDepartures = departureList.filter((d) => d.late).length;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Hoje</h1>
        <p className="text-sm text-gray-600 tabular-nums">{formatDateBR(today)}</p>
      </header>

      <TodayCounters
        counters={counters}
        busy={occupancy.isPending || arrivals.isPending}
        error={occupancy.error}
        onRetry={() => occupancy.refetch()}
      />

      {feedback && (
        <Notice tone={feedback.kind === 'error' ? 'error' : 'success'}>{feedback.text}</Notice>
      )}

      {/* Atenção (CA-05.3.c): o que pede ação agora, com cor + rótulo. */}
      <section aria-labelledby="atencao-titulo" className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 id="atencao-titulo" className="text-base font-semibold text-gray-900">
          Atenção
        </h2>
        {alerts.isPending ? (
          <Spinner label="Carregando alertas…" />
        ) : alerts.isError ? (
          <ErrorState message={alerts.error.message} onRetry={() => alerts.refetch()} />
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm text-gray-800 sm:flex-row sm:flex-wrap sm:gap-x-6">
            <AttentionItem tone="maintenance" count={noShowCount} href="#chegadas-titulo" one="chegada sem pagamento — risco de no-show" many="chegadas sem pagamento — risco de no-show" />
            <AttentionItem tone="cleaning" count={lateDepartures} href="#saidas-titulo" one="saída atrasada" many="saídas atrasadas" />
            <AttentionItem tone="cleaning" count={cleaning.length} href="#limpeza-titulo" one="quarto em limpeza" many="quartos em limpeza" />
            <AttentionItem tone="booked" count={alerts.data.pendingTooLong} to="/reservas" one="reserva pendente há mais de 48 h" many="reservas pendentes há mais de 48 h" />
            {noShowCount + lateDepartures + cleaning.length + alerts.data.pendingTooLong === 0 && (
              <li className="py-2 text-gray-700">Nada pedindo atenção agora.</li>
            )}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <TodayBlock
          id="chegadas"
          title="Chegadas"
          caption="Entrada hoje, ainda sem check-in — e as atrasadas"
          count={arrivals.data ? arrivalList.length : undefined}
          isLoading={arrivals.isPending}
          error={arrivals.error}
          onRetry={() => arrivals.refetch()}
          isEmpty={arrivalList.length === 0}
          empty={{
            title: 'Nenhuma chegada para hoje.',
            description: 'Quem chegar sem reserva entra por uma reserva nova.',
            action: <ButtonLink to="/reservas/nova">Nova reserva</ButtonLink>,
          }}
          truncated={arrivals.data && { shown: arrivals.data.data.length, total: arrivals.data.total }}
        >
          <RowList>
            {arrivalList.map((row) => (
              <ArrivalItem key={row.reservation.id} row={row} onResult={setFeedback} />
            ))}
          </RowList>
        </TodayBlock>

        <TodayBlock
          id="saidas"
          title="Saídas"
          caption="Saída hoje — e as atrasadas, que continuam na casa"
          count={inHouse.data ? departureList.length : undefined}
          isLoading={inHouse.isPending}
          error={inHouse.error}
          onRetry={() => inHouse.refetch()}
          isEmpty={departureList.length === 0}
          empty={{ title: 'Nenhuma saída hoje.', description: 'Os hóspedes com saída marcada para hoje aparecem aqui.' }}
          truncated={inHouse.data && { shown: inHouse.data.data.length, total: inHouse.data.total }}
        >
          <RowList>
            {departureList.map((row) => (
              <DepartureItem key={row.reservation.id} row={row} onResult={setFeedback} />
            ))}
          </RowList>
        </TodayBlock>

        <TodayBlock
          id="na-casa"
          title="Na casa"
          caption="Hóspedes com check-in feito"
          count={inHouse.data ? inHouseList.length : undefined}
          isLoading={inHouse.isPending}
          error={inHouse.error}
          onRetry={() => inHouse.refetch()}
          isEmpty={inHouseList.length === 0}
          empty={{ title: 'Nenhum hóspede na casa.', description: 'Quem fizer check-in aparece aqui.' }}
        >
          <RowList>
            {inHouseList.map((r) => (
              <InHouseItem key={r.id} reservation={r} />
            ))}
          </RowList>
        </TodayBlock>

        <TodayBlock
          id="limpeza"
          title="Em limpeza"
          caption="Quartos que saíram e ainda não voltaram para a venda"
          count={alerts.data ? cleaning.length : undefined}
          isLoading={alerts.isPending}
          error={alerts.error}
          onRetry={() => alerts.refetch()}
          isEmpty={cleaning.length === 0}
          empty={{ title: 'Nenhum quarto em limpeza.', description: 'O quarto entra aqui no check-out.' }}
        >
          <RowList>
            {cleaning.map((room) => (
              <CleaningItem key={room.id} room={room} onResult={setFeedback} />
            ))}
          </RowList>
        </TodayBlock>
      </div>
    </div>
  );
}

const DOT = { maintenance: 'bg-status-maintenance', cleaning: 'bg-status-cleaning', booked: 'bg-status-booked' } as const;

/** Uma linha da faixa de atenção: ponto + contagem + rótulo; zero não aparece. */
function AttentionItem({
  tone,
  count,
  one,
  many,
  href,
  to,
}: {
  tone: keyof typeof DOT;
  count: number;
  one: string;
  many: string;
  href?: string;
  to?: string;
}) {
  if (count === 0) return null;
  const content = (
    <>
      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DOT[tone])} aria-hidden="true" />
      <span>
        <strong className="tabular-nums">{count}</strong> {count === 1 ? one : many}
      </span>
    </>
  );
  const linkClass = 'inline-flex min-h-touch items-center gap-2 hover:underline md:min-h-0 md:py-1';
  return (
    <li>
      {to ? (
        <Link to={to} className={linkClass}>
          {content}
        </Link>
      ) : (
        <a href={href} className={linkClass}>
          {content}
        </a>
      )}
    </li>
  );
}
