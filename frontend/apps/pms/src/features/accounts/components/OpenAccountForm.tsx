import { useRef, useState, type FormEvent } from 'react';
import type { UseMutateFunction } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button, Field, Input, SegmentedControl } from '@hotel/ui';
import { useOpenAccount } from '../queries.js';
import type { Account, WaiterAccountType } from '../accountsApi.js';
import { openWithSameLabel, openedAtLabel } from '../accountFilter.js';
import { mutateOnce } from '../../../lib/submitLock.js';

const TYPES: { type: WaiterAccountType; label: string; placeholder: string }[] = [
  { type: 'TABLE', label: 'Mesa', placeholder: 'Mesa 5' },
  { type: 'DIRECT', label: 'Balcão', placeholder: 'Balcão — piscina' },
];

type OpenInput = { type: WaiterAccountType; label: string };

/**
 * Um envio por vez (estado de 19/11, 🟡3): dois toques no mesmo quadro abriam duas mesas, porque o
 * disabled só chega depois do isPending. A trava solta quando a resposta chega, sucesso ou erro;
 * sem rede, fica presa enquanto a mutação espera, e solta quando ela sai.
 */
export function openAccountOnce(
  lock: { current: boolean },
  mutate: UseMutateFunction<Account, Error, OpenInput>,
  input: OpenInput,
  onOpened: (account: Account) => void,
): boolean {
  return mutateOnce(lock, mutate, input, { onSuccess: onOpened });
}

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
  // A trava síncrona segura o segundo toque (openAccountOnce); o disabled fica para o visual.
  const sending = useRef(false);
  const current = TYPES.find((t) => t.type === type) ?? TYPES[0]!;
  const same = openWithSameLabel(openAccounts, label);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    openAccountOnce(sending, open.mutate, { type, label: trimmed }, onOpened);
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      {/* Escolha, não ação: segmento tingido, e o único verde sólido do quadro é "Abrir mesa" (F6). */}
      <SegmentedControl
        label="Tipo da conta"
        value={type}
        options={TYPES.map((t) => ({ value: t.type, label: t.label }))}
        onChange={setType}
      />
      <Field label="Nome na comanda" htmlFor="account-label" error={open.error?.message}>
        <Input
          id="account-label"
          // Alvo de 48 px no celular, como a busca da mesma tela (🟡-4 do qa-explorador de 22/11).
          className="min-h-touch"
          value={label}
          maxLength={100}
          placeholder={current.placeholder}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          aria-describedby={same ? 'account-label-same' : undefined}
        />
      </Field>
      {/* Região sempre montada e na árvore de acessibilidade (sem display:none): leitor de tela só
          anuncia o aviso que entra numa região que já existia (🟢-1). Vazia, devolve o espaçamento. */}
      <p id="account-label-same" role="status" className="text-sm text-gray-700 empty:-mt-3">
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
        {/* Travado durante o envio: sem rede, cancelar e abrir de novo deixava duas mutações na
            espera, e as duas viravam conta quando a rede voltava (🟡 de fluxo do qa-redteam de 22/11). */}
        <Button variant="ghost" onClick={onCancel} disabled={open.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!label.trim() || open.isPending}>
          {open.isPaused ? 'Sem conexão…' : open.isPending ? 'Abrindo…' : `Abrir ${current.label.toLowerCase()}`}
        </Button>
      </div>
    </form>
  );
}
