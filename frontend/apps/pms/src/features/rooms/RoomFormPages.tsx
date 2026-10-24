import { useEffect, useState } from 'react';
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
import { changedRoomFields, keepFirstSnapshot, roomDeleteBlockReason, toRoomInput } from './roomRules.js';
import type { RoomInput } from './roomsApi.js';
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
            cancelTo="/quartos"
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

  // Base do diff congelada na primeira carga (keepFirstSnapshot): um refetch com o
  // formulário aberto não pode mudar o "original", senão o diff reenviaria o status velho.
  const [frozen, setFrozen] = useState<RoomInput | null>(null);
  const latest = room.data ? toRoomInput(room.data) : null;
  const original = keepFirstSnapshot(frozen, latest);
  useEffect(() => {
    if (!frozen && latest) setFrozen(latest);
  }, [frozen, latest]);
  const categoryAlive = !!original && !!categories.data?.some((c) => c.id === original.category_id);

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
      {original && categories.data && (
        <Card className="space-y-4 p-4 sm:p-6">
          {!categoryAlive && (
            <p role="status" className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700">
              A categoria deste quarto foi excluída. Escolha outra para salvar.
            </p>
          )}
          <RoomForm
            categories={categories.data}
            currentStatus={original.status}
            defaultValues={{
              number: original.number,
              floor: original.floor === null ? '' : String(original.floor),
              // Categoria excluída não está na lista: o campo começa vazio e a validação pede
              // outra, em vez de o select mostrar (e gravar) a primeira opção sem o admin ver.
              category_id: categoryAlive ? original.category_id : '',
              status: original.status,
            }}
            submitLabel="Salvar"
            submitting={update.isPending}
            serverError={serverError}
            cancelTo="/quartos"
            onSubmit={(input) => {
              setServerError(null);
              const changes = changedRoomFields(original, input);
              if (Object.keys(changes).length === 0) return navigate('/quartos');
              update.mutate(
                { changes, number: input.number },
                {
                  onSuccess: () => navigate('/quartos'),
                  onError: (e) => setServerError(messageOf(e)),
                },
              );
            }}
          />
          <DeleteControl
            canWrite={canWrite}
            // Exclusão olha o status VIVO (não a foto do formulário): ocupado agora, bloqueia agora.
            blockedReason={roomDeleteBlockReason(latest?.status ?? original.status)}
            what={`o quarto ${original.number}`}
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
