import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@hotel/ui';
import { useOpenAccount } from '../queries.js';
import type { Account, WaiterAccountType } from '../accountsApi.js';

const TYPES: { type: WaiterAccountType; label: string; placeholder: string }[] = [
  { type: 'TABLE', label: 'Mesa', placeholder: 'Mesa 5' },
  { type: 'DIRECT', label: 'Balcão', placeholder: 'Balcão — piscina' },
];

/**
 * Abrir mesa ou balcão (D-8). A conta da suíte não aparece aqui: ela nasce no check-in (D-58).
 * Sem diálogo: o formulário abre no lugar do botão, na metade de baixo da tela (CA-05.5.i).
 */
export function OpenAccountForm({ onOpened, onCancel }: { onOpened: (account: Account) => void; onCancel: () => void }) {
  const [type, setType] = useState<WaiterAccountType>('TABLE');
  const [label, setLabel] = useState('');
  const open = useOpenAccount();
  const current = TYPES.find((t) => t.type === type) ?? TYPES[0]!;

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
        />
      </Field>
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
