import { useId } from 'react';
import { Button, StatusBadge, cn } from '@hotel/ui';
import type { RoomStatus } from '@hotel/domain';
import type { StatusOption } from '../roomRules.js';

/**
 * Escolha do status do quarto. Os quatro aparecem sempre; os que dependem de check-in ou
 * check-out ficam desabilitados com o motivo escrito embaixo — o admin entende por que não
 * pode, em vez de procurar a opção que sumiu. Cada opção mostra ponto colorido + rótulo.
 * Botões com aria-pressed (navegação por Tab), não radiogroup: radiogroup promete setas.
 */
export function StatusPicker({
  options,
  value,
  onChange,
}: {
  options: StatusOption[];
  value: RoomStatus;
  onChange: (s: RoomStatus) => void;
}) {
  const labelId = useId();
  const blocked = options.filter((o) => !o.enabled);

  return (
    <div className="space-y-2">
      <span id={labelId} className="text-sm font-medium text-gray-700">
        Status
      </span>
      <div role="group" aria-labelledby={labelId} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((o) => {
          const selected = o.status === value;
          return (
            <Button
              key={o.status}
              aria-pressed={selected}
              variant="secondary"
              disabled={!o.enabled}
              title={o.reason}
              aria-describedby={o.enabled ? undefined : `${labelId}-${o.status}`}
              onClick={() => onChange(o.status)}
              className={cn(
                'justify-start border bg-white',
                selected ? 'border-brand ring-1 ring-brand' : 'border-gray-200',
              )}
            >
              <StatusBadge status={o.status} className="bg-transparent px-0" />
            </Button>
          );
        })}
      </div>
      {blocked.length > 0 && (
        <ul className="space-y-0.5 text-xs text-gray-500">
          {blocked.map((o) => (
            <li key={o.status} id={`${labelId}-${o.status}`}>
              <StatusBadge status={o.status} className="bg-transparent px-0 text-xs text-gray-500" /> — {o.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
