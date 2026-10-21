import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, EmptyState, Spinner } from '@hotel/ui';
import { RoomForm } from './RoomForm.js';
import {
  useCanWriteRooms,
  useCategories,
  useCreateRoom,
  useDeleteRoom,
  useRoom,
  useUpdateRoom,
} from './queries.js';
import { isNotFound, messageOf } from './errorMessages.js';
import { roomDeleteBlockReason } from './roomRules.js';
import { ErrorState } from './components/ErrorState.js';
import { DeleteControl } from './components/DeleteControl.js';
import { ActionLink } from './components/Actions.js';
import { FormShell, NotFound } from './components/FormShell.js';

const BACK = { backTo: '/quartos', backLabel: 'Quartos' } as const;

/**
 * Quarto depende de categoria. Sem nenhuma, o formulário não teria o que escolher — o vazio
 * leva direto ao cadastro da categoria, em vez de um select vazio.
 */
function NoCategories() {
  return (
    <EmptyState
      title="Cadastre uma categoria antes"
      description="Todo quarto pertence a uma categoria, que define capacidade e diária."
      action={<ActionLink to="/quartos/categorias/nova">Nova categoria</ActionLink>}
    />
  );
}

export function RoomNewPage() {
  const navigate = useNavigate();
  const categories = useCategories();
  const create = useCreateRoom();
  const [serverError, setServerError] = useState<string | null>(null);

  return (
    <FormShell title="Novo quarto" {...BACK}>
      {categories.isLoading && <Spinner label="Carregando categorias…" />}
      {categories.isError && (
        <ErrorState message="Não foi possível carregar as categorias." onRetry={() => categories.refetch()} />
      )}
      {categories.data && categories.data.length === 0 && <NoCategories />}
      {categories.data && categories.data.length > 0 && (
        <Card className="p-4 sm:p-6">
          <RoomForm
            categories={categories.data}
            submitLabel="Cadastrar quarto"
            submitting={create.isPending}
            serverError={serverError}
            onCancel={() => navigate('/quartos')}
            onSubmit={(input) => {
              setServerError(null);
              create.mutate(input, {
                onSuccess: () => navigate('/quartos'),
                onError: (e) => setServerError(messageOf(e)),
              });
            }}
          />
        </Card>
      )}
    </FormShell>
  );
}

export function RoomEditPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWriteRooms();
  const room = useRoom(id);
  const categories = useCategories();
  const update = useUpdateRoom(id);
  const del = useDeleteRoom();
  const [serverError, setServerError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loading = room.isLoading || categories.isLoading;
  const gone = room.isError && isNotFound(room.error);
  const failed = !gone && (room.isError || categories.isError);

  return (
    <FormShell title={room.data ? `Quarto ${room.data.number}` : 'Editar quarto'} {...BACK}>
      {loading && <Spinner label="Carregando quarto…" />}
      {gone && <NotFound title="Quarto não encontrado" backTo="/quartos" backLabel="Voltar para quartos" />}
      {failed && (
        <ErrorState
          message="Não foi possível carregar o quarto."
          onRetry={() => {
            room.refetch();
            categories.refetch();
          }}
        />
      )}
      {room.data && categories.data && (
        <Card className="space-y-4 p-4 sm:p-6">
          <RoomForm
            categories={categories.data}
            currentStatus={room.data.status}
            defaultValues={{
              number: room.data.number ?? '',
              floor: room.data.floor === null || room.data.floor === undefined ? '' : String(room.data.floor),
              category_id: room.data.category_id ?? '',
              status: room.data.status ?? 'AVAILABLE',
            }}
            submitLabel="Salvar"
            submitting={update.isPending}
            serverError={serverError}
            onCancel={() => navigate('/quartos')}
            onSubmit={(input) => {
              setServerError(null);
              update.mutate(input, {
                onSuccess: () => navigate('/quartos'),
                onError: (e) => setServerError(messageOf(e)),
              });
            }}
          />
          <DeleteControl
            canWrite={canWrite}
            blockedReason={roomDeleteBlockReason(room.data.status)}
            what={`o quarto ${room.data.number}`}
            pending={del.isPending}
            error={deleteError}
            onConfirm={() => {
              setDeleteError(null);
              del.mutate(id, {
                onSuccess: () => navigate('/quartos'),
                onError: (e) => setDeleteError(messageOf(e)),
              });
            }}
          />
        </Card>
      )}
    </FormShell>
  );
}
