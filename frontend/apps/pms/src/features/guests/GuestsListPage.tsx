import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, ErrorState, Input, PageHeader, Spinner, THead, Table, Th } from '@hotel/ui';
import { useGuests } from './queries.js';
import { filterGuests } from './guestFilter.js';
import { GuestRow } from './GuestRow.js';

export function GuestsListPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useGuests();
  const [term, setTerm] = useState('');

  const filtered = useMemo(() => filterGuests(data ?? [], term), [data, term]);

  return (
    // Lista na coluna inteira, como o Hoje (R-7 revista em 26/11).
    <div className="space-y-4">
      <PageHeader
        title="Hóspedes"
        context={data && data.length > 0 ? `${data.length} ${data.length === 1 ? 'hóspede' : 'hóspedes'}` : undefined}
        action={<Button size="compact" onClick={() => navigate('/hospedes/novo')}>Novo hóspede</Button>}
      />

      {isLoading && <Spinner />}

      {isError && <ErrorState message="Não foi possível carregar os hóspedes." onRetry={() => refetch()} />}

      {data && data.length === 0 && (
        <EmptyState
          title="Nenhum hóspede cadastrado"
          description="Cadastre o primeiro hóspede para começar a criar reservas."
          // Secundária: o "Novo hóspede" do cabeçalho já é a ação principal da tela (CA-08.e).
          action={
            <Button variant="secondary" onClick={() => navigate('/hospedes/novo')}>
              Cadastrar hóspede
            </Button>
          }
        />
      )}

      {data && data.length > 0 && (
        <>
          <Input
            type="search"
            aria-label="Buscar hóspedes"
            placeholder="Buscar por nome, CPF, e-mail ou telefone"
            // A lista ocupa a coluna inteira; a busca não precisa de 1400 px.
            className="lg:max-w-xl"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />

          {filtered.length === 0 ? (
            <p className="px-1 text-sm text-gray-500">Nenhum hóspede corresponde à busca.</p>
          ) : (
            // O Table do @hotel/ui (F5): o cabeçalho copiado à mão acaba, e o cinza dele passa a 4,5:1.
            <Table caption="Hóspedes cadastrados">
              <THead>
                <Th>Nome</Th>
                <Th>CPF</Th>
                <Th className="hidden lg:table-cell">Telefone</Th>
                <Th className="hidden lg:table-cell">E-mail</Th>
              </THead>
              <tbody>
                {filtered.map((g) => (
                  <GuestRow key={g.id} guest={g} onOpen={navigate} />
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
