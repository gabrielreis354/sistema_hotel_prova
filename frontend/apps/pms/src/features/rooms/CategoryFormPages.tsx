import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Spinner } from '@hotel/ui';
import { centsToBRLInput, decimalToCents } from '@hotel/domain';
import { CategoryForm } from './CategoryForm.js';
import {
  useCanWriteRooms,
  useCategory,
  useCreateCategory,
  useDeleteCategory,
  useRooms,
  useUpdateCategory,
} from './queries.js';
import { isNotFound, messageOf } from './errorMessages.js';
import { categoryDeleteBlockReason, countRoomsByCategory } from './roomRules.js';
import { ErrorState } from './components/ErrorState.js';
import { DeleteControl } from './components/DeleteControl.js';
import { FormShell, NotFound } from './components/FormShell.js';

const BACK = { backTo: '/quartos/categorias', backLabel: 'Categorias' } as const;

export function CategoryNewPage() {
  const navigate = useNavigate();
  const create = useCreateCategory();
  const [serverError, setServerError] = useState<string | null>(null);

  return (
    <FormShell title="Nova categoria" {...BACK}>
      <Card className="p-4 sm:p-6">
        <CategoryForm
          submitLabel="Cadastrar categoria"
          submitting={create.isPending}
          serverError={serverError}
          onCancel={() => navigate('/quartos/categorias')}
          onSubmit={(input) => {
            setServerError(null);
            create.mutate(input, {
              onSuccess: () => navigate('/quartos/categorias'),
              onError: (e) => setServerError(messageOf(e)),
            });
          }}
        />
      </Card>
    </FormShell>
  );
}

export function CategoryEditPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWriteRooms();
  const category = useCategory(id);
  const rooms = useRooms();
  const update = useUpdateCategory(id);
  const del = useDeleteCategory();
  const [serverError, setServerError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const roomsUsing = useMemo(() => countRoomsByCategory(rooms.data ?? []).get(id) ?? 0, [rooms.data, id]);
  // Sem a lista de quartos não dá para saber se a categoria está em uso: na dúvida, bloqueia.
  const deleteBlock = rooms.data
    ? categoryDeleteBlockReason(roomsUsing)
    : 'Carregando os quartos para conferir se a categoria está em uso…';

  const gone = category.isError && isNotFound(category.error);
  const failed = category.isError && !gone;

  return (
    <FormShell title={category.data ? `Categoria ${category.data.name}` : 'Editar categoria'} {...BACK}>
      {category.isLoading && <Spinner label="Carregando categoria…" />}
      {gone && (
        <NotFound title="Categoria não encontrada" backTo="/quartos/categorias" backLabel="Voltar para categorias" />
      )}
      {failed && <ErrorState message="Não foi possível carregar a categoria." onRetry={() => category.refetch()} />}
      {category.data && (
        <Card className="space-y-4 p-4 sm:p-6">
          <CategoryForm
            defaultValues={{
              name: category.data.name ?? '',
              capacity: String(category.data.capacity ?? 1),
              price: category.data.price_per_night ? centsToBRLInput(decimalToCents(category.data.price_per_night)) : '',
            }}
            submitLabel="Salvar"
            submitting={update.isPending}
            serverError={serverError}
            onCancel={() => navigate('/quartos/categorias')}
            onSubmit={(input) => {
              setServerError(null);
              update.mutate(input, {
                onSuccess: () => navigate('/quartos/categorias'),
                onError: (e) => setServerError(messageOf(e)),
              });
            }}
          />
          <DeleteControl
            canWrite={canWrite}
            blockedReason={rooms.isError ? 'Não foi possível conferir os quartos desta categoria. Recarregue a página.' : deleteBlock}
            what={`a categoria ${category.data.name}`}
            pending={del.isPending}
            error={deleteError}
            onConfirm={() => {
              setDeleteError(null);
              del.mutate(id, {
                onSuccess: () => navigate('/quartos/categorias'),
                onError: (e) => setDeleteError(messageOf(e)),
              });
            }}
          />
        </Card>
      )}
    </FormShell>
  );
}
