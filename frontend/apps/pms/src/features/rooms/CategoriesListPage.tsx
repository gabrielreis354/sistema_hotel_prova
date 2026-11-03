import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, ErrorState, Spinner } from '@hotel/ui';
import { useCanWriteRooms, useCategories, useRooms } from './queries.js';
import { countRoomsByCategory } from './roomRules.js';
import { RoomsHeader } from './components/RoomsHeader.js';
import { ReadOnlyNotice } from './components/ReadOnlyNotice.js';
import { EditAction, WriteButton } from './components/Actions.js';
import { Money } from './components/Money.js';
import { Table, THead, Th, Tr, Td } from './components/Table.js';

export function CategoriesListPage() {
  const navigate = useNavigate();
  const canWrite = useCanWriteRooms();
  const { data, isLoading, isError, refetch } = useCategories();
  // Mesma consulta (e cache) da lista de quartos: alimenta a coluna "Quartos".
  const rooms = useRooms();
  const counts = useMemo(() => countRoomsByCategory(rooms.data ?? []), [rooms.data]);

  const newCategory = (
    <WriteButton canWrite={canWrite} onClick={() => navigate('/quartos/categorias/nova')}>
      Nova categoria
    </WriteButton>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <RoomsHeader title="Categorias" action={newCategory} />
      {!canWrite && <ReadOnlyNotice />}

      {isLoading && <Spinner label="Carregando categorias…" />}

      {isError && <ErrorState message="Não foi possível carregar as categorias. Verifique a conexão e tente de novo." onRetry={() => refetch()} />}

      {data && data.length === 0 && (
        <EmptyState
          title="Nenhuma categoria cadastrada"
          description={
            canWrite
              ? 'A categoria define capacidade e diária. Crie a primeira para cadastrar os quartos.'
              : 'O administrador ainda não cadastrou as categorias de quarto.'
          }
          action={canWrite ? newCategory : undefined}
        />
      )}

      {data && data.length > 0 && (
        <Table caption="Categorias de quarto">
          <THead>
            <Th>Categoria</Th>
            <Th align="right">Capacidade</Th>
            <Th align="right">Diária</Th>
            <Th align="right" className="hidden sm:table-cell">
              Quartos
            </Th>
            <Th>
              <span className="sr-only">Ações</span>
            </Th>
          </THead>
          <tbody>
            {data.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium">{c.name}</Td>
                <Td align="right">{c.capacity ?? '—'}</Td>
                <Td align="right">
                  <Money value={c.price_per_night} />
                </Td>
                <Td align="right" className="hidden text-gray-600 sm:table-cell">
                  {rooms.data ? (counts.get(c.id ?? '') ?? 0) : '—'}
                </Td>
                <Td align="right">
                  <EditAction
                    to={`/quartos/categorias/${c.id}/editar`}
                    canWrite={canWrite}
                    label={`Editar categoria ${c.name}`}
                  />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
