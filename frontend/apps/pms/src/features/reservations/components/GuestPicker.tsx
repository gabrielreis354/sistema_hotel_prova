import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button, Card, Field, Input, Spinner } from '@hotel/ui';
import { MIN_SEARCH_TERM, searchTermOf, useCreateGuest, useGuestSearch, type Guest } from '../../guests/index.js';
import { ApiError } from '../../../lib/http.js';
import { guestDraftFromTerm, type GuestDraft } from '../reservationLogic.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Espera o recepcionista parar de digitar antes de consultar: uma requisição por termo, não por tecla.
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Escolha do hóspede da reserva (CA-05.2.l): primeiro procura na base por nome, CPF, e-mail ou
 * telefone; se não achar, cadastra ali mesmo — o período e o quarto já escolhidos na página
 * não se perdem, porque este componente não navega.
 *
 * A busca é do servidor (`GET /guests?q=&limit=`): o navegador recebe no máximo os poucos
 * resultados que mostra, nunca o cadastro do hotel (princípio 7, LGPD art. 6º, III).
 */
export function GuestPicker({ selected, onSelect }: { selected: Guest | null; onSelect: (g: Guest | null) => void }) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creating, setCreating] = useState(false);
  const resultsId = useId();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [term]);

  const searched = searchTermOf(term) !== null;
  const guests = useGuestSearch(debounced);
  // Resultado de um termo que o usuário já apagou não aparece.
  const matches = searched ? (guests.data ?? []) : [];

  if (selected) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 border-brand/40 bg-brand/5 p-4">
        <div className="min-w-0">
          <p className="font-medium">{selected.full_name}</p>
          <p className="text-sm text-gray-600">
            {[selected.cpf, selected.phone, selected.email].filter(Boolean).join(' · ') || 'Sem documento ou contato'}
          </p>
        </div>
        <Button variant="secondary" onClick={() => onSelect(null)}>
          Trocar hóspede
        </Button>
      </Card>
    );
  }

  if (creating) {
    return (
      <NewGuestForm
        initial={guestDraftFromTerm(term)}
        onCancel={() => setCreating(false)}
        onCreated={(g) => {
          setCreating(false);
          onSelect(g);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <Field label="Buscar hóspede">
        <Input
          type="search"
          value={term}
          autoComplete="off"
          placeholder="Nome, CPF, e-mail ou telefone"
          aria-describedby={resultsId}
          onChange={(e) => setTerm(e.target.value)}
        />
      </Field>

      <div id={resultsId} aria-live="polite">
        {searched && guests.isLoading && <Spinner label="Procurando hóspedes…" />}
        {/* Erro só enquanto há termo: apagar a busca limpa a mensagem (🟢-3 da delta). */}
        {searched && guests.isError && (
          <p role="alert" className="text-sm text-status-maintenance">
            Não foi possível consultar os hóspedes. Você ainda pode cadastrar um novo.
          </p>
        )}
        {!searched && (
          <p className="text-sm text-gray-600">Digite ao menos {MIN_SEARCH_TERM} caracteres para procurar na base.</p>
        )}
        {searched && !guests.isFetching && guests.data && matches.length === 0 && (
          <p className="text-sm text-gray-600">Nenhum hóspede encontrado para “{term.trim()}”.</p>
        )}
      </div>

      {matches.length > 0 && (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {matches.map((g) => (
            <li key={g.id}>
              <Button
                variant="ghost"
                block
                className="h-auto justify-between gap-3 rounded-none px-4 py-2 text-left"
                onClick={() => onSelect(g)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-gray-900">{g.full_name}</span>
                  <span className="block truncate text-sm font-normal text-gray-600">
                    {[g.cpf, g.phone, g.email].filter(Boolean).join(' · ') || 'Sem documento ou contato'}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-brand">Usar</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button variant="secondary" onClick={() => setCreating(true)}>
        Cadastrar novo hóspede
      </Button>
    </div>
  );
}

function NewGuestForm({
  initial,
  onCancel,
  onCreated,
}: {
  initial: GuestDraft;
  onCancel: () => void;
  onCreated: (g: Guest) => void;
}) {
  const [draft, setDraft] = useState<GuestDraft>(initial);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const create = useCreateGuest();

  const nameError = touched && !draft.full_name.trim() ? 'Informe o nome do hóspede.' : undefined;
  const emailError =
    touched && draft.email.trim() && !EMAIL_RE.test(draft.email.trim()) ? 'E-mail inválido — confira o endereço.' : undefined;

  function set<K extends keyof GuestDraft>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!draft.full_name.trim() || (draft.email.trim() && !EMAIL_RE.test(draft.email.trim()))) return;
    setServerError(null);
    create.mutate(
      {
        full_name: draft.full_name.trim(),
        cpf: draft.cpf.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        email: draft.email.trim() || undefined,
      },
      {
        onSuccess: onCreated,
        onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Erro inesperado. Tente novamente.'),
      },
    );
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} noValidate className="space-y-3">
        <p className="text-sm font-medium text-gray-800">Novo hóspede</p>
        <Field label="Nome completo" error={nameError}>
          <Input
            autoFocus
            autoComplete="name"
            aria-invalid={!!nameError}
            value={draft.full_name}
            onChange={(e) => set('full_name', e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="CPF">
            <Input inputMode="numeric" placeholder="000.000.000-00" value={draft.cpf} onChange={(e) => set('cpf', e.target.value)} />
          </Field>
          <Field label="Telefone">
            <Input inputMode="tel" placeholder="(11) 90000-0000" value={draft.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>
        <Field label="E-mail" error={emailError}>
          <Input type="email" autoComplete="email" aria-invalid={!!emailError} value={draft.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        {serverError && (
          <p role="alert" className="text-sm text-status-maintenance">
            {serverError}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Salvando…' : 'Cadastrar e usar'}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Voltar à busca
          </Button>
        </div>
      </form>
    </Card>
  );
}
