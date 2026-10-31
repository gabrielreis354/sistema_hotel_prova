import { useMemo, useState, type FormEvent } from 'react';
import { Button, ErrorState, Field, Input } from '@hotel/ui';
import { decimalToCents, formatBRL, formatDateBR, todayISO } from '@hotel/domain';
import type { Period } from './analyticsApi.js';
import { defaultPeriod, fillMonths, monthLabel, monthlyWindow, periodError, SEASONALITY_WINDOWS } from './period.js';
import { buildKpis } from './kpis.js';
import { methodLabel, toShares } from './shares.js';
import {
  useOccupancy,
  usePaymentMix,
  useRevenue,
  useRevenueByCategory,
  useSeasonality,
  useTopGuests,
  TOP_GUESTS_LIMIT,
} from './queries.js';
import { Block } from './components/Block.js';
import { BarChart } from './components/BarChart.js';
import { KpiCards } from './components/KpiCards.js';
import { ShareTable } from './components/ShareTable.js';
import { TopGuests } from './components/TopGuests.js';
import { useIsDesktop } from './useIsDesktop.js';

const nights = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function periodCaption(p: Period): string {
  return p.start === p.end ? formatDateBR(p.start) : `${formatDateBR(p.start)} a ${formatDateBR(p.end)}`;
}

/**
 * Indicadores do gerente (T-05.6, CA-05.6.b e c). Só ADMIN: quem lê indicador é o dono; a
 * recepção tem o painel Hoje (DESIGN_PMS §1).
 *
 * Celular: só os 4 números do dia, em cartões. Desktop: os cartões, a receita por mês, a
 * sazonalidade, categoria × meio de pagamento e o ranking — cada bloco com o próprio período.
 */
export function IndicatorsPage() {
  // Fixo durante a sessão da tela: o dia não "vira" no meio de uma leitura.
  const [today] = useState(todayISO);
  const todayPeriod = useMemo(() => ({ start: today, end: today }), [today]);

  const [draft, setDraft] = useState<Period>(() => defaultPeriod(today));
  const [period, setPeriod] = useState<Period>(draft);
  const draftError = periodError(draft);
  const [months, setMonths] = useState<number>(12);
  const monthWindow = useMemo(() => monthlyWindow(today, months), [today, months]);

  // Os cartões do dia valem para as duas telas; o resto só consulta onde aparece.
  const isDesktop = useIsDesktop();
  const occupancy = useOccupancy(today);
  const revenueToday = useRevenue(todayPeriod);
  const revenueByMonth = useRevenue(monthWindow, isDesktop);
  const seasonality = useSeasonality(months, isDesktop);
  const byCategory = useRevenueByCategory(period, isDesktop);
  const paymentMix = usePaymentMix(period, isDesktop);
  const topGuests = useTopGuests(isDesktop);

  const kpis = buildKpis(occupancy.data, revenueToday.data?.realized?.total);

  function apply(e: FormEvent) {
    e.preventDefault();
    if (!draftError) setPeriod(draft);
  }

  // Em centavos já aqui: o total chega como string DECIMAL e a altura da barra precisa de número.
  const byMonth = (revenueByMonth.data?.realized?.by_month ?? []).map((m) => ({
    month: m.month ?? '',
    total: decimalToCents(m.total ?? '0'),
  }));
  const monthBars = fillMonths(monthWindow, byMonth).map((m) => ({
    key: m.month,
    label: monthLabel(m.month),
    value: m.total,
    display: formatBRL(m.total),
  }));

  const seasonBars = (seasonality.data ?? []).map((m) => ({
    key: m.month ?? '',
    label: monthLabel(m.month ?? ''),
    value: m.reservations ?? 0,
    display: `${m.reservations ?? 0} reservas`,
    detail: `${nights.format(m.avg_nights ?? 0)} noites em média`,
  }));

  const categoryItems = (byCategory.data ?? []).map((c) => ({
    key: c.category ?? '',
    label: c.category ?? 'Sem categoria',
    count: c.reservations ?? 0,
    value: c.revenue ?? 0,
  }));

  const mixItems = (paymentMix.data ?? []).map((m) => ({
    key: m.method ?? '',
    label: methodLabel(m.method),
    count: m.count ?? 0,
    value: m.total ?? 0,
  }));

  const windowActions = (
    <div role="group" aria-label="Meses no gráfico" className="flex gap-1">
      {SEASONALITY_WINDOWS.map((n) => (
        <Button
          key={n}
          size="compact"
          variant={n === months ? 'primary' : 'secondary'}
          aria-pressed={n === months}
          onClick={() => setMonths(n)}
        >
          {n} meses
        </Button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Indicadores</h1>
        <p className="text-sm text-gray-500">Hoje, {formatDateBR(today)}</p>
      </header>

      <section aria-label="Números do dia" className="space-y-3">
        <KpiCards kpis={kpis} busy={occupancy.isLoading || revenueToday.isLoading} />
        {occupancy.isError && (
          <ErrorState message={occupancy.error.message} onRetry={() => occupancy.refetch()} />
        )}
        {revenueToday.isError && (
          <ErrorState message={revenueToday.error.message} onRetry={() => revenueToday.refetch()} />
        )}
        <p className="text-xs text-gray-500 md:hidden">Gráficos, tabelas e ranking ficam na tela do computador.</p>
      </section>

      {isDesktop && (
        <div className="space-y-6">
          <Block
            title="Receita recebida por mês"
            caption={`Pagamentos efetivados · ${periodCaption(monthWindow)}`}
            isLoading={revenueByMonth.isLoading}
            error={revenueByMonth.error}
            onRetry={() => revenueByMonth.refetch()}
            isEmpty={monthBars.every((b) => b.value === 0)}
            emptyText="Nenhum pagamento efetivado nesses meses."
            actions={windowActions}
          >
            <BarChart title="Receita recebida por mês" valueHeader="Recebido" bars={monthBars} />
          </Block>

          <Block
            title="Sazonalidade"
            caption={`Reservas por mês de check-in, inclusive futuras · últimos ${months} meses`}
            isLoading={seasonality.isLoading}
            error={seasonality.error}
            onRetry={() => seasonality.refetch()}
            isEmpty={seasonBars.length === 0}
            emptyText="Nenhuma reserva nesses meses."
          >
            <BarChart title="Reservas por mês de check-in" valueHeader="Reservas" detailHeader="Noites em média" bars={seasonBars} />
          </Block>

          <form onSubmit={apply} className="flex flex-wrap items-end gap-3" aria-label="Período das tabelas">
            <Field label="De" htmlFor="periodo-inicio">
              <Input
                id="periodo-inicio"
                type="date"
                value={draft.start}
                max={today}
                onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
              />
            </Field>
            <Field label="Até" htmlFor="periodo-fim">
              <Input
                id="periodo-fim"
                type="date"
                value={draft.end}
                max={today}
                onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
              />
            </Field>
            <Button type="submit" size="compact" disabled={!!draftError}>
              Aplicar período
            </Button>
            {draftError && (
              <p role="alert" className="w-full text-sm text-status-maintenance">
                {draftError}
              </p>
            )}
          </form>

          <div className="grid gap-6 lg:grid-cols-2">
            <Block
              title="Receita por categoria"
              caption={`Valor das reservas não canceladas, pela data de check-in · ${periodCaption(period)}`}
              isLoading={byCategory.isLoading}
              error={byCategory.error}
              onRetry={() => byCategory.refetch()}
              isEmpty={categoryItems.length === 0}
              emptyText="Nenhuma reserva no período."
            >
              <ShareTable
                caption="Receita por categoria de quarto"
                nameHeader="Categoria"
                countHeader="Reservas"
                rows={toShares(categoryItems)}
                values={categoryItems.map((c) => c.value)}
              />
            </Block>

            <Block
              title="Meios de pagamento"
              caption={`Pagamentos efetivados · ${periodCaption(period)}`}
              isLoading={paymentMix.isLoading}
              error={paymentMix.error}
              onRetry={() => paymentMix.refetch()}
              isEmpty={mixItems.length === 0}
              emptyText="Nenhum pagamento efetivado no período."
            >
              <ShareTable
                caption="Recebido por meio de pagamento"
                nameHeader="Meio"
                countHeader="Pagamentos"
                rows={toShares(mixItems)}
                values={mixItems.map((m) => m.value)}
              />
            </Block>
          </div>

          <Block
            title="Hóspedes frequentes"
            caption={`Os ${TOP_GUESTS_LIMIT} com maior valor em reservas não canceladas · todo o histórico`}
            isLoading={topGuests.isLoading}
            error={topGuests.error}
            onRetry={() => topGuests.refetch()}
            isEmpty={(topGuests.data ?? []).length === 0}
            emptyText="Nenhum hóspede com reserva ainda."
          >
            <TopGuests rows={topGuests.data ?? []} />
          </Block>
        </div>
      )}
    </div>
  );
}
