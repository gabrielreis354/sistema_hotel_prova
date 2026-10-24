import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Spinner } from '@hotel/ui';
import { centsToBRLInput, decimalToCents } from '@hotel/domain';
import { CategoryForm } from './CategoryForm.js';
import {
  useCanWriteRooms,
  useCachedRoomsUsingCategory,
  useCategory,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from './queries.js';
import { isNotFound, messageOf } from './errorMessages.js';
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
          cancelTo="/quartos/categorias"
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
  const roomsInCache = useCachedRoomsUsingCategory(id);
  const update = useUpdateCategory(id);
  const del = useDeleteCategory();
  const [serverError, setServerError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
            cancelTo="/quartos/categorias"
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
            // Sem trava no cliente: quem decide "em uso" é o backend (409, mensagem em
            // errorMessages). A dica abaixo é só ajuda, com o que já estava em cache.
            blockedReason={null}
            hint={
              roomsInCache
                ? `Pela última lista de quartos, ${roomsInCache === 1 ? '1 quarto usa' : `${roomsInCache} quartos usam`} esta categoria — o sistema recusa a exclusão enquanto houver.`
                : null
            }
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
