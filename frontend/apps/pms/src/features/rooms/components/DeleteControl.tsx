import { useState } from 'react';
import { Button } from '@hotel/ui';
import { WriteButton } from './Actions.js';

/**
 * Exclusão em dois passos: "Excluir" arma, "Confirmar exclusão" executa. Ação de efeito
 * difícil de desfazer pede confirmação (DESIGN_PMS.md §5). Bloqueada por regra, mostra o
 * motivo escrito — botão desabilitado não exibe tooltip no toque.
 */
export function DeleteControl({
  canWrite,
  blockedReason,
  hint,
  what,
  pending,
  error,
  onConfirm,
}: {
  canWrite: boolean;
  blockedReason: string | null;
  /** Aviso que não bloqueia (ex.: "a categoria parece estar em uso"). */
  hint?: string | null;
  /** "o quarto 101", "a categoria Standard" — entra na pergunta de confirmação. */
  what: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  return (
    <section aria-label="Excluir" className="space-y-2 border-t border-gray-200 pt-4">
      {!armed ? (
        <WriteButton
          variant="danger"
          canWrite={canWrite}
          blockedReason={blockedReason}
          onClick={() => setArmed(true)}
        >
          Excluir
        </WriteButton>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="w-full text-sm text-gray-700">Excluir {what}? Não dá para desfazer pela tela.</p>
          <Button variant="danger" disabled={pending} onClick={onConfirm}>
            {pending ? 'Excluindo…' : 'Confirmar exclusão'}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setArmed(false)}>
            Manter
          </Button>
        </div>
      )}
      {canWrite && blockedReason && <p className="text-sm text-gray-600">{blockedReason}</p>}
      {canWrite && !blockedReason && hint && <p className="text-sm text-gray-600">{hint}</p>}
      {error && (
        <p role="alert" className="text-sm text-status-maintenance">
          {error}
        </p>
      )}
    </section>
  );
}
