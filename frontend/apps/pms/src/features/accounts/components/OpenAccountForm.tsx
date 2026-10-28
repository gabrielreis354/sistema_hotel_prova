import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Field, Input } from '@hotel/ui';
import { useOpenAccount } from '../queries.js';
import type { Account, WaiterAccountType } from '../accountsApi.js';
import { openWithSameLabel, openedAtLabel } from '../accountFilter.js';

const TYPES: { type: WaiterAccountType; label: string; placeholder: string }[] = [
  { type: 'TABLE', label: 'Mesa', placeholder: 'Mesa 5' },
  { type: 'DIRECT', label: 'Balcão', placeholder: 'Balcão — piscina' },
];

/**
 * Abrir mesa ou balcão (D-8). A conta da suíte não aparece aqui: ela nasce no check-in (D-58).
 * Sem diálogo: o formulário abre no lugar do botão, na metade de baixo da tela (CA-05.5.i).
 *
 * Nome igual ao de uma conta aberta só avisa, com o caminho para ela (P1 da revisão Impeccable):
 * duas "Mesa 3" iguais na lista fazem o garçom lançar na errada. Não bloqueia — o backend aceita
 * e pode ser outra mesa 3 de fato. O aviso usa a lista já carregada, sem consulta nova.
 */
export function OpenAccountForm({
  openAccounts,
  onOpened,
  onCancel,
}: {
  openAccounts: Account[];
  onOpened: (account: Account) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<WaiterAccountType>('TABLE');
  const [label, setLabel] = useState('');
  const open = useOpenAccount();
  const current = TYPES.find((t) => t.type === type) ?? TYPES[0]!;
  const same = openWithSameLabel(openAccounts, label);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    open.mutate({ type, label: trimmed }, { onSuccess: onOpened });
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo da conta">
        {TYPES.map((t) => (
          <Button
            key={t.type}
            variant={t.type === type ? 'primary' : 'secondary'}
            aria-pressed={t.type === type}
            onClick={() => setType(t.type)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      <Field label="Nome na comanda" htmlFor="account-label" error={open.error?.message}>
        <Input
          id="account-label"
          value={label}
          maxLength={100}
          placeholder={current.placeholder}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          aria-describedby={same ? 'account-label-same' : undefined}
        />
      </Field>
      {/* Região sempre montada: leitor de tela só anuncia o aviso que entra numa região que já existia (🟢-1). */}
      <p id="account-label-same" role="status" className="text-sm text-gray-700 empty:hidden">
        {same && (
          <>
            Já existe uma conta aberta com esse nome ({openedAtLabel(same.opened_at)}).{' '}
            <Link to={`/comanda/${same.id}`} className="inline-flex min-h-touch items-center font-medium text-brand underline">
              Ir para essa conta
            </Link>
          </>
        )}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!label.trim() || open.isPending}>
          {open.isPending ? 'Abrindo…' : `Abrir ${current.label.toLowerCase()}`}
        </Button>
      </div>
    </form>
  );
}
