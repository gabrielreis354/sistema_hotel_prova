import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, EmptyState, Input, Spinner } from '@hotel/ui';
import { useGuests } from './queries.js';
import type { Guest } from './guestsApi.js';

function matches(guest: Guest, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return [guest.full_name, guest.cpf, guest.email, guest.phone]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q));
}

export function GuestsListPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useGuests();
  const [term, setTerm] = useState('');

  const filtered = useMemo(() => (data ?? []).filter((g) => matches(g, term)), [data, term]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Hóspedes</h1>
        <Button size="compact" onClick={() => navigate('/hospedes/novo')}>
          Novo hóspede
        </Button>
      </div>

      {isLoading && <Spinner />}

      {isError && (
        <Card className="p-4 text-sm text-status-maintenance">
          Não foi possível carregar os hóspedes.{' '}
          <button className="underline" onClick={() => refetch()}>
            Tentar de novo
          </button>
        </Card>
      )}

      {data && data.length === 0 && (
        <EmptyState
          title="Nenhum hóspede cadastrado"
          description="Cadastre o primeiro hóspede para começar a criar reservas."
          action={<Button onClick={() => navigate('/hospedes/novo')}>Cadastrar hóspede</Button>}
        />
      )}

      {data && data.length > 0 && (
        <>
          <Input
            type="search"
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
                    <tr key={g.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <Link to={`/hospedes/${g.id}`} className="font-medium text-brand hover:underline">
                          {g.full_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 tabular-nums text-gray-600">{g.cpf || '—'}</td>
                      <td className="hidden px-4 py-2 text-gray-600 sm:table-cell">{g.phone || '—'}</td>
                      <td className="hidden px-4 py-2 text-gray-600 sm:table-cell">{g.email || '—'}</td>
                    </tr>
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
