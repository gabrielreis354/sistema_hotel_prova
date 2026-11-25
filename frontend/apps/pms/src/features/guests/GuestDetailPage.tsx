import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ActionSlot, Button, Card, Notice, PageHeader, Section, Spinner, THead, Table, Td, Th, Tr } from '@hotel/ui';
import { formatCpf, formatDateBR } from '@hotel/domain';
import type { components } from '@hotel/api-client';
import { api } from '../../lib/api.js';
import { ApiError } from '../../lib/http.js';
import { useGuest, useDeleteGuest } from './queries.js';
import { DELETE_GUEST_REASON, canDeleteGuest } from './guestRules.js';
import { useAuthStore } from '../../stores/auth.js';
import { ReservationStatusBadge } from '../reservations/index.js';
import { BackLink, ButtonLink } from '../../components/links.js';
import { LoadError } from '../../components/LoadError.js';
import { GUEST_LOAD } from './guestLoad.js';

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
  const guestQuery = useGuest(id);
  const { data: guest, isLoading, isError } = guestQuery;
  const canDelete = useAuthStore((s) => canDeleteGuest(s.user?.role));
  const del = useDeleteGuest();
  const [confirming, setConfirming] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  // Antes de qualquer return antecipado (regra dos hooks). Ao abrir, o foco vai para a
  // confirmação; ao fechar sem excluir, volta para o Excluir, que reaparece — senão caía no body e
  // o Tab seguinte pulava Editar e Excluir (🟡-3 do qa-explorador de 16/11).
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
    else if (wasConfirming.current) deleteRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const stays = useQuery({
    queryKey: ['guest-stays', id],
    queryFn: () => fetchGuestStays(id as string),
    enabled: !!id,
  });

  if (isLoading) return <Spinner label="Carregando hóspede…" />;
  if (isError || !guest) {
    return (
      <div className="max-w-3xl">
        <LoadError error={guestQuery.error} {...GUEST_LOAD} onRetry={() => guestQuery.refetch()} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* A volta no topo, como no detalhe da reserva (F4); no rodapé ela sumia atrás do histórico (critique da F5). */}
      <BackLink to="/hospedes">← Hóspedes</BackLink>
      <PageHeader
        title={guest.full_name}
        context="Hóspede"
        action={
          <>
            {/* sm:self-start: o cabeçalho estica os filhos, e o motivo do Excluir embaixo deixava o
                Editar com a altura do bloco inteiro no desktop. */}
            <ButtonLink to={`/hospedes/${id}/editar`} size="compact" variant="secondary" className="sm:self-start">
              Editar
            </ButtonLink>
            {/* Excluir é irreversível e não é a ação da tela: fica discreto, e a confirmação diz o que
                vai acontecer (GUIA_UI_CORPORATIVA, regra 7). */}
            {/* Sem permissão o Excluir fica na tela, desabilitado e com o motivo em texto embaixo
                (CA-08.f, ActionSlot como na reserva) — title não abre em botão desabilitado nem no
                celular. Antes a recepção confirmava e levava 403 (qa-explorador e redteam de 16/11). */}
            {!confirming && (
              <ActionSlot id="hospede-excluir" state={{ enabled: canDelete, reason: DELETE_GUEST_REASON }}>
                {(describedBy) => (
                  <Button
                    ref={deleteRef}
                    size="compact"
                    // Secundário (fundo branco), não ghost: o vermelho direto no areia dava 4,39:1, abaixo
                    // dos 4,5:1 do texto de 14 px; no branco dá 4,8:1 (🟡2 do qa-redteam da F2).
                    variant="secondary"
                    className="text-status-maintenance"
                    disabled={!canDelete}
                    aria-describedby={describedBy}
                    onClick={() => setConfirming(true)}
                  >
                    Excluir
                  </Button>
                )}
              </ActionSlot>
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

      {delError && <Notice tone="error">{delError}</Notice>}

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
          // O Table do @hotel/ui: overflow-x-auto, não hidden (a 375 px o status saía cortado, "● Hospedad";
          // 🟡-2 do qa-explorador de 16/11), e o cabeçalho em gray-600 como as outras listas (critique da F5).
          <Table caption={`Estadias de ${guest.full_name}`}>
            <THead>
              <Th>Entrada</Th>
              <Th>Saída</Th>
              <Th>Status</Th>
            </THead>
            <tbody>
              {stays.data.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap tabular-nums">{r.check_in_date ? formatDateBR(r.check_in_date) : '—'}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{r.check_out_date ? formatDateBR(r.check_out_date) : '—'}</Td>
                  <Td className="whitespace-nowrap">
                    {/* Ponto e palavra (GUIA, regra 3), como no resto do app. */}
                    {r.status ? <ReservationStatusBadge status={r.status} /> : '—'}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    // min-w-0 e break-words: na grade de 3 colunas o e-mail não quebrava e a página rolava 8 px de lado a
    // 768 px (critique da F5).
    <div className="min-w-0">
      {/* gray-600: o gray-400 dava 2,5:1 sobre o branco, abaixo dos 4,5:1 (CA-08.d). */}
      <p className="text-xs uppercase tracking-wide text-gray-600">{label}</p>
      <p className="break-words text-sm">{value || '—'}</p>
    </div>
  );
}
