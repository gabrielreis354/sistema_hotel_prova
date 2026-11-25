import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, Spinner } from '@hotel/ui';
import { useGuests } from './queries.js';
import { filterGuests } from './guestFilter.js';
import { GuestRow } from './GuestRow.js';

export function GuestsListPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useGuests();
  const [term, setTerm] = useState('');

  const filtered = useMemo(() => filterGuests(data ?? [], term), [data, term]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
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
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />

          {filtered.length === 0 ? (
            <p className="px-1 text-sm text-gray-500">Nenhum hóspede corresponde à busca.</p>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Nome</th>
                    <th className="px-4 py-2 font-medium">CPF</th>
                    <th className="hidden px-4 py-2 font-medium sm:table-cell">Telefone</th>
                    <th className="hidden px-4 py-2 font-medium sm:table-cell">E-mail</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((g) => (
                    <GuestRow key={g.id} guest={g} onOpen={navigate} />
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
