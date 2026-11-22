import { useRef, useState } from 'react';
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
import { messageOf } from './errorMessages.js';
import { mutateOnce } from '../../lib/submitLock.js';
import { DeleteControl } from './components/DeleteControl.js';
import { FormShell } from './components/FormShell.js';
import { LoadError } from '../../components/LoadError.js';

const BACK = { backTo: '/quartos/categorias', backLabel: 'Categorias' } as const;

export function CategoryNewPage() {
  const navigate = useNavigate();
  const create = useCreateCategory();
  const [serverError, setServerError] = useState<string | null>(null);
  // Um envio por vez (SPEC-11, CA-11.a): o 2º clique levava 409 num cadastro que deu certo.
  const lock = useRef(false);

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
            mutateOnce(lock, create.mutate, input, {
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
  const lock = useRef(false);


  return (
    <FormShell title={category.data ? `Categoria ${category.data.name}` : 'Editar categoria'} {...BACK}>
      {category.isLoading && <Spinner label="Carregando categoria…" />}
      {/* A volta já está no topo do FormShell: o LoadError não repete. */}
      {category.isError && (
        <LoadError
          error={category.error}
          notFound="Categoria não encontrada — ela pode ter sido excluída por outra pessoa."
          failed="Não foi possível carregar a categoria. Verifique a conexão e tente de novo."
          onRetry={() => category.refetch()}
        />
      )}
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
              mutateOnce(lock, update.mutate, input, {
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
              // Mesma trava do salvar (🟡2 do qa-redteam de 22/11): o 2º DELETE voltava 404 e
              // a tela dizia "excluído por outra pessoa" num quarto que o próprio admin apagou.
              mutateOnce(lock, del.mutate, id, {
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
