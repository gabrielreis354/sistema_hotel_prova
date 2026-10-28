import { useEffect, useRef } from 'react';
import { Button } from '@hotel/ui';
import { decimalToCents, formatBRL, multiplyCents } from '@hotel/domain';
import type { AccountItem } from '../accountsApi.js';
import { canUndo, type QueueEntry } from '../queueCore.js';
import { useNow } from '../queueStore.js';
import { itemLine, undoLabel } from '../accountTotals.js';


const ENTRY_STATE: Record<QueueEntry['status'], { label: string; dot: string }> = {
  // Ainda não chegou ao servidor: ponto neutro. Verde dizia "gravado" antes da hora (P1).
  undo: { label: 'Aguardando envio', dot: 'bg-gray-400' },
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

function Row({ children, entryId }: { children: React.ReactNode; entryId?: string }) {
  return (
    <li data-entry={entryId} className="flex min-h-touch items-center gap-3 px-3 py-2">
      {children}
    </li>
  );
}

const isSettled = (e: QueueEntry) => e.status === 'rejected' || e.status === 'excluded';

/**
 * Itens da conta: os do servidor e, embaixo, os deste aparelho que ainda não estão lá. Cada
 * lançamento local diz onde está — "Aguardando envio" com "Desfazer" nos primeiros segundos,
 * "Na fila" sem rede, "Recusado" com o motivo — para a tela nunca fingir que já gravou.
 *
 * Altura fixa com rolagem própria (P0 da revisão Impeccable): a lista crescia a cada toque e
 * empurrava o cardápio para baixo, e o toque seguinte caía no produto errado. Com a caixa do
 * mesmo tamanho, vazia ou cheia, o cardápio não se mexe. O último lançamento fica à vista:
 * a caixa rola até o fim quando entra item.
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
  const box = useRef<HTMLDivElement>(null);
  // Relógio só enquanto há janela de desfazer aberta: o botão some quando o prazo vence (🟡-1).
  const now = useNow(entries.some((e) => e.status === 'undo'));
  // Rola até o fim ao abrir a conta e a cada toque deste aparelho — e só aí (🟡-2 do qa-redteam).
  // Cada toque renova o undoUntil; envio, item de outro aparelho e refetch não, e por isso não
  // puxam a lista de quem subiu para conferir um item antigo.
  const lastTap = entries.reduce((max, e) => Math.max(max, e.undoUntil), 0);
  const seenTap = useRef(-1);
  useEffect(() => {
    if (lastTap > seenTap.current && box.current) box.current.scrollTop = box.current.scrollHeight;
    seenTap.current = Math.max(seenTap.current, lastTap);
  }, [lastTap]);

  // Lançamento recusado ou excluído entra na vista, mesmo acima da área visível: senão o consumo
  // fica sem cobrança sem ninguém ver (🟡-3 do qa-redteam). Só a recusa nova move a caixa.
  const settledIds = entries.filter(isSettled).map((e) => e.clientItemId).join(' ');
  const seenSettled = useRef(new Set<string>());
  useEffect(() => {
    const fresh = settledIds.split(' ').find((id) => id && !seenSettled.current.has(id));
    for (const id of settledIds.split(' ')) if (id) seenSettled.current.add(id);
    const row = fresh && box.current?.querySelector<HTMLElement>(`[data-entry="${fresh}"]`);
    if (!row || !box.current) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    const view = box.current;
    if (top < view.scrollTop || bottom > view.scrollTop + view.clientHeight) view.scrollTop = top;
  }, [settledIds]);

  return (
    <div
      ref={box}
      role="region"
      aria-label="Itens lançados"
      tabIndex={0}
      className="relative h-44 shrink-0 overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {items.length === 0 && entries.length === 0 ? (
        <p className="flex h-full items-center justify-center px-4 text-center text-sm text-gray-600">
          Nada lançado ainda. Toque num produto do cardápio.
        </p>
      ) : (
      <ul aria-label="Itens da conta" className="divide-y divide-gray-100">
        {items.map((item) => {
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
              <span className={`tabular-nums text-sm ${line.struck ? 'text-gray-500 line-through' : ''}`}>
                {formatBRL(line.priceCents)}
              </span>
            </Row>
          );
        })}

        {entries.map((entry) => {
          const price = multiplyCents(decimalToCents(entry.unitPrice), entry.quantity);
          const settled = isSettled(entry);
          return (
            <Row key={entry.clientItemId} entryId={entry.clientItemId}>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${settled ? 'text-gray-500 line-through' : ''}`}>
                  {entry.quantity !== 1 && <span className="mr-1 font-medium tabular-nums">{entry.quantity}×</span>}
                  {entry.description}
                </p>
                <EntryState status={entry.status} />
                {entry.reason && (
                  <p role="alert" className="text-xs text-status-maintenance">
                    {entry.reason}
                  </p>
                )}
              </div>
              {canUndo(entry, now) && (
                <Button
                  variant="ghost"
                  aria-label={`${undoLabel(entry.quantity)}: ${entry.description}`}
                  onClick={() => onUndo(entry.clientItemId)}
                >
                  {undoLabel(entry.quantity)}
                </Button>
              )}
              {settled && (
                <Button variant="ghost" onClick={() => onDismiss(entry.clientItemId)}>
                  OK
                </Button>
              )}
              {!settled && !canUndo(entry, now) && (
                <span className="tabular-nums text-sm text-gray-600">{formatBRL(price)}</span>
              )}
            </Row>
          );
        })}
      </ul>
      )}
    </div>
  );
}
