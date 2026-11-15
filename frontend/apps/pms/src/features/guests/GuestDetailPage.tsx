import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, PageHeader, Section, Spinner } from '@hotel/ui';
import { formatCpf, formatDateBR } from '@hotel/domain';
import type { components } from '@hotel/api-client';
import { api } from '../../lib/api.js';
import { ApiError } from '../../lib/http.js';
import { useGuest, useDeleteGuest } from './queries.js';
import { ButtonLink, ReservationStatusBadge } from '../reservations/index.js';

// GET /reservations devolve ReservationListItem (Reservation + guest/room/user resumidos),
// não o Reservation puro — usar o schema errado aqui é o mesmo erro de tipagem que os casts
// escondiam antes.
type Reservation = components['schemas']['ReservationListItem'];

/**
 * Histórico de estadias do hóspede. O backend ainda não filtra reservas por hóspede, então
 * buscamos a lista e filtramos no cliente (o seed tem poucas centenas de registros — troca
 * por `?guest_id=` quando o backend expuser).
 */
async function fetchGuestStays(guestId: string): Promise<Reservation[]> {
  const { data, error, response } = await api.GET('/reservations');
  if (error || !response.ok) throw new ApiError('Falha ao carregar reservas.', response.status);
  // GET /reservations agora é tipado como array (sem page/limit) OU { data, total, page,
  // limit } (com paginação) — ver ReservationListPage no Swagger. Esta página nunca manda
  // page/limit, então a resposta real é sempre o array; o guard cobre o union de tipos.
  const all = Array.isArray(data) ? data : (data?.data ?? []);
  return all.filter((r) => r.guest_id === guestId);
}

export function GuestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: guest, isLoading, isError } = useGuest(id);
  const del = useDeleteGuest();
  const [confirming, setConfirming] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  // Antes de qualquer return antecipado (regra dos hooks).
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const stays = useQuery({
    queryKey: ['guest-stays', id],
    queryFn: () => fetchGuestStays(id as string),
    enabled: !!id,
  });

  if (isLoading) return <Spinner />;
  if (isError || !guest) return <p className="text-sm text-status-maintenance">Hóspede não encontrado.</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={guest.full_name}
        context="Hóspede"
        action={
          <>
            <ButtonLink to={`/hospedes/${id}/editar`} variant="secondary">
              Editar
            </ButtonLink>
            {/* Excluir é irreversível e não é a ação da tela: fica discreto, e a confirmação diz o que
                vai acontecer (GUIA_UI_CORPORATIVA, regra 7). */}
            {!confirming && (
              <Button variant="ghost" className="text-status-maintenance" onClick={() => setConfirming(true)}>
                Excluir
              </Button>
            )}
          </>
        }
      />

      {confirming && (
        // O "Excluir" sai da tela ao abrir: o foco vem para a confirmação, senão cairia no body
        // (🟡-2 do qa-redteam da T-08.5), como no cancelamento da reserva.
        <div ref={confirmRef} tabIndex={-1} role="alertdialog" aria-label="Confirmar exclusão do hóspede" className="focus:outline-none">
        <Card className="space-y-3 border-status-maintenance/40 bg-status-maintenance/5 p-4">
          <p className="text-sm text-gray-800">
            Excluir o cadastro de <strong>{guest.full_name}</strong>? As reservas dele continuam, mas passam a aparecer
            como "Hóspede removido". Não dá para desfazer por aqui.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              disabled={del.isPending}
              onClick={() => {
                setDelError(null);
                del.mutate(id as string, {
                  onSuccess: () => navigate('/hospedes'),
                  onError: (e) => setDelError(e instanceof ApiError ? e.message : 'Erro ao excluir.'),
                });
              }}
            >
              {del.isPending ? 'Excluindo…' : 'Sim, excluir hóspede'}
            </Button>
            <Button variant="ghost" disabled={del.isPending} onClick={() => setConfirming(false)}>
              Manter hóspede
            </Button>
          </div>
        </Card>
        </div>
      )}

      {delError && <p className="text-sm text-status-maintenance">{delError}</p>}

      <Section title="Contato">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Info label="CPF" value={formatCpf(guest.cpf)} />
          <Info label="Telefone" value={guest.phone} />
          <Info label="E-mail" value={guest.email} />
        </div>
      </Section>

      <Section title="Histórico de estadias">
        {stays.isLoading && <Spinner />}
        {stays.isError && <p className="text-sm text-status-maintenance">Falha ao carregar estadias.</p>}
        {stays.data && stays.data.length === 0 && (
          <p className="text-sm text-gray-500">Nenhuma reserva para este hóspede.</p>
        )}
        {stays.data && stays.data.length > 0 && (
          <Card className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Entrada</th>
                  <th className="px-4 py-2 font-medium">Saída</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {stays.data.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2 tabular-nums">
                      {r.check_in_date ? formatDateBR(r.check_in_date) : '—'}
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      {r.check_out_date ? formatDateBR(r.check_out_date) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {/* Ponto e palavra (GUIA, regra 3), como no resto do app. */}
                      {r.status ? <ReservationStatusBadge status={r.status} /> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>

      <Link to="/hospedes" className="inline-block text-sm text-brand hover:underline">
        ← Voltar para hóspedes
      </Link>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      {/* gray-600: o gray-400 dava 2,5:1 sobre o branco, abaixo dos 4,5:1 (CA-08.d). */}
      <p className="text-xs uppercase tracking-wide text-gray-600">{label}</p>
      <p className="text-sm">{value || '—'}</p>
    </div>
  );
}
