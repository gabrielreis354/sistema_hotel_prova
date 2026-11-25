import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDaysISO, formatDateBR, todayISO } from '@hotel/domain';
import { Button, Card, Field, Input } from '@hotel/ui';
import type { Guest } from '../guests/index.js';
import { ApiError } from '../../lib/http.js';
import { useAvailableRooms, useCreateReservation } from './queries.js';
import { RoomConflictError } from './reservationsApi.js';
import { pastCheckInError, quoteStay, roomConflictMessage, safeNights } from './reservationLogic.js';
import { GuestPicker } from './components/GuestPicker.js';
import { RoomPicker } from './components/RoomPicker.js';
import { Money, Notice, PageHeader } from './components/primitives.js';
import { BackLink } from '../../components/links.js';

/**
 * Nova reserva no balcão (CA-05.2.c, l, m). Uma página só, em três blocos — período,
 * hóspede, quarto — e o resumo com valor e diárias SEMPRE visível antes de confirmar.
 * Nada navega no meio do caminho: cadastrar o hóspede não apaga datas nem quarto.
 */
export function NewReservationPage() {
  const navigate = useNavigate();
  const today = todayISO();
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(addDaysISO(today, 1));
  const [guest, setGuest] = useState<Guest | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const nights = safeNights(checkIn, checkOut);
  // Entrada passada nem lista quartos nem soma diárias: o aviso fica no campo (QA 24/11).
  const pastError = pastCheckInError(checkIn, today);
  const rangeOk = nights !== null && nights > 0;
  const datesOk = rangeOk && !pastError;
  const available = useAvailableRooms(checkIn, checkOut, datesOk);
  const create = useCreateReservation();

  // Só vale o que está livre AGORA, na ordem em que foi escolhido. Mudou a data ou perdeu a
  // corrida: o quarto que deixou de estar livre sai da seleção sozinho.
  const selectedRooms = useMemo(() => {
    const list = available.data ?? [];
    return selectedIds.flatMap((id) => list.filter((r) => r.id === id));
  }, [available.data, selectedIds]);

  const quote = quoteStay(selectedRooms, checkIn, checkOut);

  const blockers: string[] = [];
  if (pastError) blockers.push(pastError);
  else if (!rangeOk) blockers.push(nights === null ? 'Informe as datas de entrada e saída.' : 'A saída precisa ser depois da entrada.');
  if (!guest) blockers.push('Escolha ou cadastre o hóspede.');
  if (datesOk && selectedRooms.length === 0) blockers.push('Escolha ao menos um quarto livre.');
  if (datesOk && selectedRooms.length > 0 && !quote.ok) blockers.push(quote.reason);

  // "Isabela Castro · 2 diárias · 202, 203": a última conferência antes do toque, na barra do celular.
  const readySummary = [
    guest?.full_name,
    nights !== null && nights > 0 ? `${nights} ${nights === 1 ? 'diária' : 'diárias'}` : null,
    selectedRooms.map((r) => r.number).filter(Boolean).join(', ') || null,
  ]
    .filter(Boolean)
    .join(' · ');

  useEffect(() => {
    if (submitError) errorRef.current?.focus();
  }, [submitError]);

  function toggleRoom(id: string) {
    setSubmitError(null);
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function changeCheckIn(value: string) {
    setSubmitError(null);
    setCheckIn(value);
    // Entrada empurrada para depois da saída: a saída acompanha, mantendo uma noite.
    const n = safeNights(value, checkOut);
    if (n !== null && n <= 0) setCheckOut(addDaysISO(value, 1));
  }

  function confirm() {
    const [main, ...extras] = selectedRooms;
    if (!guest?.id || !main?.id || blockers.length > 0) return;
    setSubmitError(null);
    create.mutate(
      {
        guest_id: guest.id,
        room_id: main.id,
        extra_room_ids: extras.flatMap((r) => (r.id ? [r.id] : [])),
        check_in_date: checkIn,
        check_out_date: checkOut,
      },
      {
        onSuccess: (r) => navigate(r.id ? `/reservas/${r.id}` : '/reservas'),
        onError: (err) => {
          if (err instanceof RoomConflictError) {
            const lost = new Set(err.roomIds);
            setSelectedIds((ids) => ids.filter((id) => !lost.has(id)));
            // O balcão fala em número de quarto, não em "este quarto".
            const named = roomConflictMessage(selectedRooms, err.roomIds);
            if (named) {
              setSubmitError(named);
              return;
            }
          }
          setSubmitError(err instanceof ApiError ? err.message : 'Erro inesperado. Tente novamente.');
        },
      },
    );
  }

  return (
    // À esquerda, como o detalhe (R-7). A volta é o link do topo, como no detalhe: o botão "Voltar à lista"
    // ocupava o lugar que nas outras telas é da ação principal (linha de base de 24/11, F4).
    <div className="max-w-5xl space-y-4">
      <BackLink to="/reservas">← Reservas</BackLink>
      <PageHeader title="Nova reserva" />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="space-y-4">
          <Section step={1} title="Período">
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <Field label="Entrada" error={pastError ?? undefined}>
                <Input
                  type="date"
                  value={checkIn}
                  min={today}
                  aria-invalid={!!pastError}
                  onChange={(e) => changeCheckIn(e.target.value)}
                />
              </Field>
              <Field label="Saída">
                <Input
                  type="date"
                  value={checkOut}
                  min={checkIn ? addDaysISO(checkIn, 1) : undefined}
                  aria-invalid={!rangeOk}
                  onChange={(e) => {
                    setSubmitError(null);
                    setCheckOut(e.target.value);
                  }}
                />
              </Field>
            </div>
            <p className="text-sm text-gray-600 tabular-nums">
              {rangeOk ? `${nights} ${nights === 1 ? 'diária' : 'diárias'}` : 'A saída precisa ser depois da entrada.'}
            </p>
          </Section>

          <Section step={2} title="Hóspede">
            <GuestPicker selected={guest} onSelect={setGuest} />
          </Section>

          <Section step={3} title="Quarto">
            {datesOk ? (
              <>
                <p className="text-sm text-gray-600">
                  Livres de {formatDateBR(checkIn)} a {formatDateBR(checkOut)}. O primeiro escolhido é o principal; os
                  outros entram como quartos extras da mesma reserva.
                </p>
                <RoomPicker
                  rooms={available.data}
                  isPending={available.isPending}
                  isError={available.isError}
                  onRetry={() => available.refetch()}
                  selectedIds={selectedIds}
                  onToggle={toggleRoom}
                />
              </>
            ) : (
              <p className="text-sm text-gray-600">Defina o período para ver os quartos livres.</p>
            )}
          </Section>
        </div>

        <aside className="lg:sticky lg:top-4" aria-label="Resumo da reserva">
          <Card className="space-y-3 p-4">
            <h2 className="text-section text-gray-800">Resumo</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Hóspede">{guest?.full_name ?? '—'}</Row>
              <Row label="Período">
                {datesOk ? `${formatDateBR(checkIn)} → ${formatDateBR(checkOut)}` : '—'}
              </Row>
              <Row label="Diárias">{datesOk ? nights : '—'}</Row>
            </dl>

            {quote.ok && (
              <ul className="space-y-1 border-t border-gray-100 pt-3 text-sm">
                {quote.lines.map((l) => (
                  <li key={l.roomId} className="flex justify-between gap-2">
                    <span className="text-gray-700">
                      Quarto {l.number} · <Money cents={l.unitCents} /> × {quote.nights}
                    </span>
                    <Money cents={l.subtotalCents} />
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-baseline justify-between border-t border-gray-200 pt-3">
              <span className="text-sm font-medium text-gray-800">Valor da estadia</span>
              {quote.ok ? (
                <Money cents={quote.totalCents} className="text-lg font-semibold" />
              ) : (
                <span className="text-sm text-gray-500">—</span>
              )}
            </div>

            {blockers.length > 0 && (
              <ul id="confirm-blockers" className="space-y-1 text-sm text-gray-600">
                {blockers.map((b) => (
                  <li key={b}>• {b}</li>
                ))}
              </ul>
            )}

            {submitError && (
              <Notice ref={errorRef} tone="error">
                {submitError}
              </Notice>
            )}

            {/* No celular e no tablet o "Confirmar" mora na barra fixa de baixo; aqui só a partir do lg. */}
            <Button
              block
              className="hidden lg:inline-flex"
              disabled={blockers.length > 0 || create.isPending}
              aria-describedby={blockers.length > 0 ? 'confirm-blockers' : undefined}
              onClick={confirm}
            >
              {create.isPending ? 'Reservando…' : 'Confirmar reserva'}
            </Button>
            <p className="text-xs text-gray-500">
              O valor é a prévia pela tarifa da categoria. O total gravado vem do servidor na confirmação.
            </p>
          </Card>
        </aside>
      </div>

      {/* Abaixo do lg, o valor e o "Confirmar" ficam presos acima da barra do celular (critique da F4, P2):
          no fim da página, o administrador rolava 8 quartos para ver o total e o que faltava. O mesmo
          encaixe do total da comanda (--tabbar da casca); no md a barra de baixo some e ela desce até o fim,
          como a conta (md:bottom-0; antes ficava solta 54 px acima, 🟡1 do qa-redteam da F5).
          Com bloqueio, a barra diz o que falta em até duas linhas, nunca só o valor com o botão cinza; pronta,
          diz para quem e quantas diárias, para não confirmar às cegas (critique da F5, P1). A lista inteira
          dos bloqueios continua no resumo. */}
      <div
        data-area="confirmar-celular"
        className="sticky bottom-[calc(var(--tabbar,3rem)+max(6px,env(safe-area-inset-bottom)))] z-10 -mx-4 flex items-center gap-3 border-t border-gray-200 bg-white px-4 py-3 md:bottom-0 md:-mx-8 md:px-8 lg:hidden"
      >
        <div className="min-w-0 flex-1">
          {blockers.length > 0 ? (
            <>
              <p className="text-xs text-gray-600 tabular-nums">
                {quote.ok ? (
                  <>
                    Valor da estadia <Money cents={quote.totalCents} className="font-semibold text-gray-800" />
                  </>
                ) : (
                  'Falta para confirmar'
                )}
              </p>
              <p className="line-clamp-2 text-sm font-medium text-gray-800">{blockers[0]}</p>
            </>
          ) : (
            <>
              <p className="truncate text-xs text-gray-600" title={readySummary}>
                {readySummary}
              </p>
              {quote.ok && <Money cents={quote.totalCents} className="text-lg font-semibold" />}
            </>
          )}
        </div>
        <Button
          className="shrink-0"
          disabled={blockers.length > 0 || create.isPending}
          aria-describedby={blockers.length > 0 ? 'confirm-blockers' : undefined}
          onClick={confirm}
        >
          {create.isPending ? 'Reservando…' : 'Confirmar reserva'}
        </Button>
      </div>
    </div>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-section text-gray-800">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-xs text-brand tabular-nums">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-600">{label}</dt>
      <dd className="text-right font-medium tabular-nums text-gray-900">{children}</dd>
    </div>
  );
}
