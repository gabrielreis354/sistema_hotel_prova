import { useEffect, useMemo, useRef, useState } from 'react';
import { ErrorState, Field, Input, PageHeader, SegmentedControl } from '@hotel/ui';
import { decimalToCents, formatBRL, formatDateBR, todayISO } from '@hotel/domain';
import type { Period } from './analyticsApi.js';
import { appliedPeriod, defaultPeriod, fillMonths, fillSeasonality, monthLabel, noSeasonReservations, monthlyWindow, periodError, SEASONALITY_WINDOWS } from './period.js';
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
import { PeriodSection } from './components/PeriodSection.js';
import { analyticsAvailability } from './availability.js';
import { useIsDesktop } from './useIsDesktop.js';

const nights = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function periodCaption(p: Period): string {
  return p.start === p.end ? formatDateBR(p.start) : `${formatDateBR(p.start)} a ${formatDateBR(p.end)}`;
}

/** Espera da digitação no De/Até antes de consultar (🟡3 do qa-redteam da F7). */
const PERIOD_SETTLE_MS = 600;

/**
 * O intervalo que a sazonalidade desenha de fato: do mês `months` atrás até o último mês com reserva
 * futura. "Últimos 12 meses" mostrava 14 barras (P1 do critique da F7).
 */
function seasonCaption(rows: { month: string }[]): string {
  const first = rows[0]?.month;
  const last = rows[rows.length - 1]?.month;
  return first && last ? `${monthLabel(first)} a ${monthLabel(last)}` : '';
}

/**
 * Indicadores do gerente (T-05.6, CA-05.6.b e c). Só ADMIN: quem lê indicador é o dono; a
 * recepção tem o painel Hoje (DESIGN_PMS §1).
 *
 * Celular: só os 4 números do dia, em cartões. Desktop: os cartões e duas seções, cada uma com o
 * período no título (F7 da SPEC-10): "Mês a mês" (receita e sazonalidade, 6/12/24 meses) e "No
 * período" (categoria e meios de pagamento, De/Até). As duas aplicam na hora. O ranking é de todo o
 * histórico e fica por último.
 */
export function IndicatorsPage() {
  // Fixo durante a sessão da tela: o dia não "vira" no meio de uma leitura.
  const [today] = useState(todayISO);
  const todayPeriod = useMemo(() => ({ start: today, end: today }), [today]);

  const [draft, setDraft] = useState<Period>(() => defaultPeriod(today));
  const [period, setPeriod] = useState<Period>(draft);
  // O De/Até espera a digitação parar (🟡3 do qa-redteam da F7): o campo de data do Chrome avisa a
  // cada segmento digitado, e "15/10" passava por "15/11" e "15/01", cada um virando consulta e o
  // alerta trocando a cada tecla. Escolher no calendário também espera, o que não se percebe.
  const [draftError, setDraftError] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPeriod((current) => appliedPeriod(current, draft));
      setDraftError(periodError(draft));
    }, PERIOD_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);
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

  // O analytics fora do ar inteiro: um aviso só, com uma tentativa para todas as fontes (P3 do audit
  // da F2). No celular só os números do dia consultam; no computador, todas.
  const sources = isDesktop
    ? [occupancy, revenueToday, revenueByMonth, seasonality, byCategory, paymentMix, topGuests]
    : [occupancy, revenueToday];
  // Com memória: a queda vale até alguma fonte responder, e os erros de bloco esperam enquanto nada
  // respondeu (🟡1 e 🟡2 do qa-redteam da F7). Mesmas entradas, mesma saída: refazer o render não muda.
  const wasDown = useRef(false);
  const { down, settling } = analyticsAvailability(wasDown.current, sources);
  wasDown.current = down;
  const retrying = down && sources.some((q) => q.isFetching);
  const retryAll = () => sources.forEach((q) => void q.refetch());
  // Enquanto se decide entre queda geral e parcial, o bloco que já falhou mostra carregando.
  const blockState = (q: { isLoading: boolean; isError: boolean; error: Error | null }) => ({
    isLoading: q.isLoading || (settling && q.isError),
    error: settling ? null : q.error,
  });

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

  // Todos os meses da janela do backend, com o mês sem reserva em zero (achado 3 da revisão de 15/11).
  const seasonMonths = fillSeasonality(today, months, seasonality.data ?? []);
  const seasonBars = seasonMonths.map((m) => ({
    key: m.month,
    label: monthLabel(m.month),
    value: m.reservations,
    display: `${m.reservations} ${m.reservations === 1 ? 'reserva' : 'reservas'}`,
    detail: m.reservations === 0 || m.avg_nights === null ? '—' : `${nights.format(m.avg_nights)} noites em média`,
  }));

  const categoryItems = (byCategory.data ?? []).map((c) => ({
    key: c.category_id ?? 'sem-categoria',
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

  const monthsControl = (
    // Filtro, não ação: o grupo segmentado da lista de reservas (F5), com o ativo tingido.
    <SegmentedControl
      label="Meses no gráfico"
      value={String(months)}
      options={SEASONALITY_WINDOWS.map((n) => ({ value: String(n), label: `${n} meses` }))}
      onChange={(v) => setMonths(Number(v))}
    />
  );

  const periodControl = (
    <div role="group" aria-label="Período das tabelas" className="flex flex-wrap items-end gap-3">
      <Field label="De" htmlFor="periodo-inicio">
        <Input
          id="periodo-inicio"
          type="date"
          value={draft.start}
          max={today}
          aria-invalid={!!draftError || undefined}
          aria-describedby={draftError ? 'periodo-erro' : undefined}
          onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
        />
      </Field>
      <Field label="Até" htmlFor="periodo-fim">
        <Input
          id="periodo-fim"
          type="date"
          value={draft.end}
          max={today}
          aria-invalid={!!draftError || undefined}
          aria-describedby={draftError ? 'periodo-erro' : undefined}
          onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
        />
      </Field>
      {/* Sem "Aplicar": a data válida já consulta. A inválida diz o motivo e as tabelas ficam no
          período anterior, que o subtítulo de cada uma continua mostrando. */}
      {/* Região sempre montada e educada (status), não alert: o leitor de tela lê uma vez, quando a
          digitação para. Fundo branco: o vermelho sobre o areia da página dava 4,39:1 (critique B). */}
      <p
        id="periodo-erro"
        role="status"
        className="w-full rounded-md bg-white px-2 py-1 text-sm text-status-maintenance empty:bg-transparent empty:p-0"
      >
        {draftError && `${draftError} As tabelas seguem em ${periodCaption(period)}.`}
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Indicadores" context={`Hoje, ${formatDateBR(today)}`} />

      {down && (
        <ErrorState
          message={`Os indicadores estão fora do ar agora. Reservas, contas e comanda seguem funcionando.${retrying ? ' Tentando de novo…' : ''}`}
          onRetry={retryAll}
        />
      )}

      <section aria-label="Números do dia" className="space-y-3">
        <KpiCards kpis={kpis} busy={occupancy.isLoading || revenueToday.isLoading} />
        {!down && !settling && occupancy.isError && (
          <ErrorState message={occupancy.error.message} onRetry={() => occupancy.refetch()} />
        )}
        {!down && !settling && revenueToday.isError && (
          <ErrorState message={revenueToday.error.message} onRetry={() => revenueToday.refetch()} />
        )}
        <p className="text-xs text-gray-600 md:hidden">Gráficos, tabelas e ranking ficam na tela do computador.</p>
      </section>

      {/* Fora do ar inteiro, os blocos não têm o que mostrar: o aviso do topo basta. */}
      {isDesktop && !down && (
        <div className="space-y-8">
          <PeriodSection title="Mês a mês" control={monthsControl}>
            <Block
              title="Receita recebida por mês"
              caption={`Pagamentos efetivados · ${periodCaption(monthWindow)}`}
              {...blockState(revenueByMonth)}
              onRetry={() => revenueByMonth.refetch()}
              isEmpty={monthBars.every((b) => b.value === 0)}
              emptyText="Nenhum pagamento efetivado nesses meses."
              emptyHint="Escolha mais meses acima."
            >
              <BarChart title="Receita recebida por mês" valueHeader="Recebido" bars={monthBars} />
            </Block>

            <Block
              title="Sazonalidade"
              caption={`Reservas por mês de check-in, inclusive futuras · ${seasonCaption(seasonMonths)}`}
              {...blockState(seasonality)}
              onRetry={() => seasonality.refetch()}
              isEmpty={noSeasonReservations(seasonMonths)}
              emptyText="Nenhuma reserva nesses meses."
              emptyHint="Escolha mais meses acima."
            >
              <BarChart title="Reservas por mês de check-in" valueHeader="Reservas" detailHeader="Noites em média" bars={seasonBars} />
            </Block>
          </PeriodSection>

          <PeriodSection title="No período" control={periodControl}>
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <Block
                title="Receita por categoria"
                caption={`Valor das reservas não canceladas, pela data de check-in · ${periodCaption(period)}`}
                {...blockState(byCategory)}
                onRetry={() => byCategory.refetch()}
                isEmpty={categoryItems.length === 0}
                emptyText="Nenhuma reserva no período."
                emptyHint="Troque as datas De e Até."
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
                {...blockState(paymentMix)}
                onRetry={() => paymentMix.refetch()}
                isEmpty={mixItems.length === 0}
                emptyText="Nenhum pagamento efetivado no período."
                emptyHint="Troque as datas De e Até."
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
          </PeriodSection>

          <PeriodSection title="Todo o histórico" control={null}>
            <Block
              title="Hóspedes frequentes"
              caption={`Os ${TOP_GUESTS_LIMIT} com maior valor em reservas não canceladas`}
              {...blockState(topGuests)}
              onRetry={() => topGuests.refetch()}
              isEmpty={(topGuests.data ?? []).length === 0}
              emptyText="Nenhum hóspede com reserva ainda."
            >
              <TopGuests rows={topGuests.data ?? []} />
            </Block>
          </PeriodSection>
        </div>
      )}
    </div>
  );
}
