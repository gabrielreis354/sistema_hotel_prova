import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, ErrorState, Spinner, StatusBadge, Table, Td, Th, THead, Tr } from '@hotel/ui';
import { useCanWriteRooms, useRooms } from './queries.js';
import { formatFloor, sortRooms } from './roomRules.js';
import { RoomsHeader } from './components/RoomsHeader.js';
import { ReadOnlyNotice } from './components/ReadOnlyNotice.js';
import { EditAction, WriteButton } from './components/Actions.js';
import { DecimalMoney } from './components/DecimalMoney.js';

export function RoomsListPage() {
  const navigate = useNavigate();
  const canWrite = useCanWriteRooms();
  const { data, isLoading, isError, refetch } = useRooms();
  const rooms = useMemo(() => sortRooms(data ?? []), [data]);

  const newRoom = (
    <WriteButton size="compact" canWrite={canWrite} onClick={() => navigate('/quartos/novo')}>
      Novo quarto
    </WriteButton>
  );

  return (
    // Lista na coluna inteira, como o Hoje (R-7 revista em 26/11).
    <div className="space-y-4">
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
          // Secundária: o "Novo quarto" do cabeçalho já é a ação principal (CA-08.e).
          action={
            canWrite ? (
              <WriteButton canWrite variant="secondary" onClick={() => navigate('/quartos/novo')}>
                Novo quarto
              </WriteButton>
            ) : undefined
          }
        />
      )}

      {rooms.length > 0 && (
        <Table caption="Quartos do hotel">
          <THead>
            <Th>Quarto</Th>
            <Th className="hidden lg:table-cell">Andar</Th>
            <Th className="hidden lg:table-cell">Categoria</Th>
            <Th align="right" className="hidden lg:table-cell">
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
                  {/* Abaixo do lg, categoria e andar vão sob o número em vez de colunas: no tablet a barra lateral
                      deixa ~466 px e o "Editar" saía da tela (critique da F5). */}
                  <span className="block text-xs text-gray-500 lg:hidden">
                    {r.category?.name ?? 'Sem categoria'} · {formatFloor(r.floor)}
                  </span>
                </Td>
                <Td className="hidden tabular-nums text-gray-600 lg:table-cell">{formatFloor(r.floor)}</Td>
                <Td className="hidden text-gray-700 lg:table-cell">
                  {r.category?.name ?? <span className="text-status-maintenance">Sem categoria</span>}
                </Td>
                <Td align="right" className="hidden lg:table-cell">
                  <DecimalMoney value={r.category?.price_per_night} />
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
