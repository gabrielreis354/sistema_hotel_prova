import { useState } from 'react';
import { Button } from '@hotel/ui';
import { decimalToCents, formatBRL, multiplyCents } from '@hotel/domain';
import type { AccountItem } from '../accountsApi.js';
import type { QueueEntry } from '../queueCore.js';
import { itemLine } from '../accountTotals.js';

/** Itens do servidor visíveis sem expandir: o cardápio fica perto do polegar mesmo em conta longa. */
const RECENT_ITEMS = 3;

const ENTRY_STATE: Record<QueueEntry['status'], { label: string; dot: string }> = {
  undo: { label: 'Lançado', dot: 'bg-status-occupied' },
  queued: { label: 'Na fila', dot: 'bg-status-cleaning' },
  sending: { label: 'Enviando', dot: 'bg-status-booked' },
  rejected: { label: 'Recusado', dot: 'bg-status-maintenance' },
  excluded: { label: 'Excluído', dot: 'bg-status-free' },
};

/** Estado do lançamento local: ponto colorido e rótulo, nunca só cor (RNF-025). */
function EntryState({ status }: { status: QueueEntry['status'] }) {
  const state = ENTRY_STATE[status];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
      <span aria-hidden className={`h-2 w-2 rounded-full ${state.dot}`} />
      {state.label}
    </span>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <li className="flex min-h-touch items-center gap-3 px-3 py-2">{children}</li>;
}

/**
 * Itens da conta: os do servidor e, embaixo, os deste aparelho que ainda não estão lá. Cada
 * lançamento local diz onde está — "Lançado" com "Desfazer" nos primeiros segundos, "Na fila"
 * sem rede, "Recusado" com o motivo — para a tela nunca fingir que já gravou.
 */
export function ItemList({
  items,
  entries,
  onUndo,
  onDismiss,
}: {
  items: AccountItem[];
  entries: QueueEntry[];
  onUndo: (clientItemId: string) => void;
  onDismiss: (clientItemId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0 && entries.length === 0) {
    return <p className="px-1 text-sm text-gray-500">Nada lançado ainda. Toque num produto do cardápio.</p>;
  }
  const hidden = expanded ? 0 : Math.max(0, items.length - RECENT_ITEMS);
  const shown = items.slice(hidden);

  return (
    <div className="space-y-1">
      {hidden > 0 && (
        <Button variant="ghost" block onClick={() => setExpanded(true)}>
          Ver todos os itens ({items.length})
        </Button>
      )}
      <ul aria-label="Itens da conta" className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {shown.map((item) => {
          const line = itemLine(item);
          return (
            <Row key={item.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {line.quantityLabel && <span className="mr-1 font-medium tabular-nums">{line.quantityLabel}</span>}
                  {item.description}
                </p>
                {line.label && <p className="text-xs font-medium text-gray-600">{line.label}</p>}
              </div>
              <span className={`tabular-nums text-sm ${line.struck ? 'text-gray-400 line-through' : ''}`}>
                {formatBRL(line.priceCents)}
              </span>
            </Row>
          );
        })}

        {entries.map((entry) => {
          const price = multiplyCents(decimalToCents(entry.unitPrice), entry.quantity);
          const settled = entry.status === 'rejected' || entry.status === 'excluded';
          return (
            <Row key={entry.clientItemId}>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${settled ? 'text-gray-400 line-through' : ''}`}>
                  {entry.quantity !== 1 && <span className="mr-1 font-medium tabular-nums">{entry.quantity}×</span>}
                  {entry.description}
                </p>
                <EntryState status={entry.status} />
                {entry.reason && <p className="text-xs text-status-maintenance">{entry.reason}</p>}
              </div>
              {entry.status === 'undo' && (
                <Button variant="ghost" onClick={() => onUndo(entry.clientItemId)}>
                  Desfazer
                </Button>
              )}
              {settled && (
                <Button variant="ghost" onClick={() => onDismiss(entry.clientItemId)}>
                  OK
                </Button>
              )}
              {!settled && entry.status !== 'undo' && (
                <span className="tabular-nums text-sm text-gray-600">{formatBRL(price)}</span>
              )}
            </Row>
          );
        })}
      </ul>
    </div>
  );
}
