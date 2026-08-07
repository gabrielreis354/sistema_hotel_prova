import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Spinner } from '@hotel/ui';
import { formatDateBR, RESERVATION_STATUS_LABEL, type ReservationStatus } from '@hotel/domain';
import type { components } from '@hotel/api-client';
import { api } from '../../lib/api.js';
import { ApiError } from '../../lib/http.js';
import { useGuest, useDeleteGuest } from './queries.js';

type Reservation = components['schemas']['Reservation'];

/**
 * Histórico de estadias do hóspede. O backend ainda não filtra reservas por hóspede, então
 * buscamos a lista e filtramos no cliente (o seed tem poucas centenas de registros — troca
 * por `?guest_id=` quando o backend expuser).
 */
async function fetchGuestStays(guestId: string): Promise<Reservation[]> {
  const { data, error, response } = await api.GET('/reservations');
  if (error || !response.ok) throw new ApiError('Falha ao carregar reservas.', response.status);
  const all = (data as unknown as Reservation[]) ?? [];
  return all.filter((r) => r.guest_id === guestId);
}

export function GuestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: guest, isLoading, isError } = useGuest(id);
  const del = useDeleteGuest();
  const [confirming, setConfirming] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  const stays = useQuery({
    queryKey: ['guest-stays', id],
    queryFn: () => fetchGuestStays(id as string),
    enabled: !!id,
  });

  if (isLoading) return <Spinner />;
  if (isError || !guest) return <p className="text-sm text-status-maintenance">Hóspede não encontrado.</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{guest.full_name}</h1>
        <div className="flex gap-2">
          <Link to={`/hospedes/${id}/editar`}>
            <Button variant="secondary">Editar</Button>
          </Link>
          {!confirming ? (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Excluir
            </Button>
          ) : (
            <>
              <Button
                variant="danger"
                disabled={del.isPending}
                onClick={() => {
                  setDelError(null);
                  del.mutate(id as string, {
                    onSuccess: () => navigate('/hospedes'),
                    onError: (e) =>
                      setDelError(e instanceof ApiError ? e.message : 'Erro ao excluir.'),
                  });
                }}
              >
                Confirmar
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </>
          )}
        </div>
      </div>

      {delError && <p className="text-sm text-status-maintenance">{delError}</p>}

      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <Info label="CPF" value={guest.cpf} />
        <Info label="Telefone" value={guest.phone} />
        <Info label="E-mail" value={guest.email} />
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">Histórico de estadias</h2>
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
                      {r.status ? RESERVATION_STATUS_LABEL[r.status as ReservationStatus] : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <Link to="/hospedes" className="inline-block text-sm text-brand hover:underline">
        ← Voltar para hóspedes
      </Link>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm">{value || '—'}</p>
    </div>
  );
}
