import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, ErrorState, Spinner, StatusBadge } from '@hotel/ui';
import { useCanWriteRooms, useRooms } from './queries.js';
import { formatFloor, sortRooms } from './roomRules.js';
import { RoomsHeader } from './components/RoomsHeader.js';
import { ReadOnlyNotice } from './components/ReadOnlyNotice.js';
import { EditAction, WriteButton } from './components/Actions.js';
import { Money } from './components/Money.js';
import { Table, THead, Th, Tr, Td } from './components/Table.js';

export function RoomsListPage() {
  const navigate = useNavigate();
  const canWrite = useCanWriteRooms();
  const { data, isLoading, isError, refetch } = useRooms();
  const rooms = useMemo(() => sortRooms(data ?? []), [data]);

  const newRoom = (
    <WriteButton canWrite={canWrite} onClick={() => navigate('/quartos/novo')}>
      Novo quarto
    </WriteButton>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <RoomsHeader title="Quartos" action={newRoom} />
      {!canWrite && <ReadOnlyNotice />}

      {isLoading && <Spinner label="Carregando quartos…" />}

      {isError && <ErrorState message="Não foi possível carregar os quartos. Verifique a conexão e tente de novo." onRetry={() => refetch()} />}

      {data && data.length === 0 && (
        <EmptyState
          title="Nenhum quarto cadastrado"
          description={
            canWrite
              ? 'Cadastre os quartos do hotel para a recepção abrir reservas. Antes, crie ao menos uma categoria com a tarifa.'
              : 'O administrador ainda não cadastrou os quartos do hotel.'
          }
          action={canWrite ? newRoom : undefined}
        />
      )}

      {rooms.length > 0 && (
        <Table caption="Quartos do hotel">
          <THead>
            <Th>Quarto</Th>
            <Th className="hidden sm:table-cell">Andar</Th>
            <Th className="hidden sm:table-cell">Categoria</Th>
            <Th align="right" className="hidden md:table-cell">
              Diária
            </Th>
            <Th>Status</Th>
            <Th>
              <span className="sr-only">Ações</span>
            </Th>
          </THead>
          <tbody>
            {rooms.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <span className="font-medium tabular-nums">{r.number}</span>
                  {/* No celular, categoria e andar vão sob o número em vez de colunas. */}
                  <span className="block text-xs text-gray-500 sm:hidden">
                    {r.category?.name ?? 'Sem categoria'} · {formatFloor(r.floor)}
                  </span>
                </Td>
                <Td className="hidden tabular-nums text-gray-600 sm:table-cell">{formatFloor(r.floor)}</Td>
                <Td className="hidden text-gray-700 sm:table-cell">
                  {r.category?.name ?? <span className="text-status-maintenance">Sem categoria</span>}
                </Td>
                <Td align="right" className="hidden md:table-cell">
                  <Money value={r.category?.price_per_night} />
                </Td>
                <Td>{r.status ? <StatusBadge status={r.status} /> : '—'}</Td>
                <Td align="right">
                  <EditAction to={`/quartos/${r.id}/editar`} canWrite={canWrite} label={`Editar quarto ${r.number}`} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
