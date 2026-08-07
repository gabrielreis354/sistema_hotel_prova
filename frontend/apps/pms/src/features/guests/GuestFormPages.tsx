import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Spinner } from '@hotel/ui';
import { GuestForm } from './GuestForm.js';
import { useCreateGuest, useGuest, useUpdateGuest } from './queries.js';
import { ApiError } from '../../lib/http.js';
import type { Guest } from './guestsApi.js';

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Erro inesperado. Tente novamente.';
}

export function GuestNewPage() {
  const navigate = useNavigate();
  const create = useCreateGuest();
  const [serverError, setServerError] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">Novo hóspede</h1>
      <Card className="p-6">
        <GuestForm
          submitLabel="Cadastrar"
          submitting={create.isPending}
          serverError={serverError}
          onCancel={() => navigate('/hospedes')}
          onSubmit={(input) => {
            setServerError(null);
            create.mutate(input, {
              onSuccess: (g: Guest) => navigate(`/hospedes/${g.id}`),
              onError: (e) => setServerError(messageOf(e)),
            });
          }}
        />
      </Card>
    </div>
  );
}

export function GuestEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: guest, isLoading, isError } = useGuest(id);
  const update = useUpdateGuest(id ?? '');
  const [serverError, setServerError] = useState<string | null>(null);

  if (isLoading) return <Spinner />;
  if (isError || !guest) return <p className="text-sm text-status-maintenance">Hóspede não encontrado.</p>;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">Editar hóspede</h1>
      <Card className="p-6">
        <GuestForm
          submitLabel="Salvar"
          submitting={update.isPending}
          serverError={serverError}
          defaultValues={{
            full_name: guest.full_name ?? '',
            cpf: guest.cpf ?? '',
            phone: guest.phone ?? '',
            email: guest.email ?? '',
          }}
          onCancel={() => navigate(`/hospedes/${id}`)}
          onSubmit={(input) => {
            setServerError(null);
            update.mutate(input, {
              onSuccess: () => navigate(`/hospedes/${id}`),
              onError: (e) => setServerError(messageOf(e)),
            });
          }}
        />
      </Card>
    </div>
  );
}
