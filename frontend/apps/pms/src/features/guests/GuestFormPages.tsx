import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, PageHeader, Spinner } from '@hotel/ui';
import { GuestForm } from './GuestForm.js';
import { LoadError } from '../../components/LoadError.js';
import { GUEST_LOAD } from './guestLoad.js';
import { useCreateGuest, useGuest, useUpdateGuest } from './queries.js';
import { ApiError } from '../../lib/http.js';
import { mutateOnce } from '../../lib/submitLock.js';
import type { Guest } from './guestsApi.js';

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Erro inesperado. Tente novamente.';
}

export function GuestNewPage() {
  const navigate = useNavigate();
  const create = useCreateGuest();
  const [serverError, setServerError] = useState<string | null>(null);
  // Um envio por vez (SPEC-11 §2, como quartos e categorias): o 2º clique em "Cadastrar" voltava 409 e
  // dizia "CPF ou e-mail já cadastrado" num cadastro que deu certo (qa-explorador de 26/11).
  const lock = useRef(false);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Novo hóspede" />
      <Card className="p-6">
        <GuestForm
          submitLabel="Cadastrar"
          submitting={create.isPending}
          serverError={serverError}
          onCancel={() => navigate('/hospedes')}
          onSubmit={(input) => {
            setServerError(null);
            mutateOnce(lock, create.mutate, input, {
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
  const guestQuery = useGuest(id);
  const { data: guest, isLoading, isError } = guestQuery;
  const update = useUpdateGuest(id ?? '');
  const [serverError, setServerError] = useState<string | null>(null);
  const lock = useRef(false);

  if (isLoading) return <Spinner label="Carregando hóspede…" />;
  // Mesmo estado de erro da ficha (repasse do qa-redteam de 16/11): antes um 500 virava "não encontrado".
  if (isError || !guest) {
    return (
      <div className="mx-auto max-w-lg">
        <LoadError error={guestQuery.error} {...GUEST_LOAD} onRetry={() => guestQuery.refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Editar hóspede" />
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
            mutateOnce(lock, update.mutate, input, {
              onSuccess: () => navigate(`/hospedes/${id}`),
              onError: (e) => setServerError(messageOf(e)),
            });
          }}
        />
      </Card>
    </div>
  );
}
