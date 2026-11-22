import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button, Input } from '@hotel/ui';
import { decimalToCents, formatBRL, multiplyCents } from '@hotel/domain';
import type { AccountItem } from '../accountsApi.js';
import { canUndo, type QueueEntry } from '../queueCore.js';
import { fieldText, lastTapAt, nextQuantity, QUANTITY_ZERO_HINT, quantityTextInvalid } from '../quantityField.js';
import { useNow } from '../queueStore.js';
import { itemLine, undoAccessibleName, undoLabel, undoSecondsLeft } from '../accountTotals.js';


const ENTRY_STATE: Record<QueueEntry['status'], { label: string; dot: string }> = {
  // Ainda não chegou ao servidor: ponto neutro. Verde dizia "gravado" antes da hora (P1).
  undo: { label: 'Aguardando envio', dot: 'bg-gray-400' },
  queued: { label: 'Na fila', dot: 'bg-status-cleaning' },
  sending: { label: 'Enviando', dot: 'bg-status-booked' },
  rejected: { label: 'Recusado', dot: 'bg-status-maintenance' },
  excluded: { label: 'Excluído', dot: 'bg-status-free' },
};

/** Enquanto o campo tem o foco, a janela é renovada neste intervalo: ela não fecha no meio da conversa. */
const HOLD_MS = 1_000;

/**
 * Quantidade digitada na linha (16/11): o garçom toca em Cerveja e digita 6. O texto é local para
 * aceitar o campo vazio no meio da digitação; só um número válido (1 a 9999) muda a fila.
 *
 * Ressalvas do qa-redteam: enquanto o campo tem o foco, a janela não fecha (ele pergunta "quantas?"
 * à mesa com o campo aberto, 🟡-1); a seleção do texto espera o foco assentar, porque o iOS desfaz
 * o select() feito no próprio foco e "3" + "6" virava 36 (🟡-2); e se o campo sair com o foco dentro,
 * o foco vai para a lista, não para o body (🟡-3).
 */
function QuantityField({
  quantity,
  description,
  onChange,
  onEditing,
  onLostFocus,
}: {
  quantity: number;
  description: string;
  onChange: (quantity: number) => void;
  onEditing: (editing: boolean) => void;
  onLostFocus: () => void;
}) {
  const [text, setText] = useState(String(quantity));
  const [editing, setEditing] = useState(false);
  const lastSent = useRef(quantity);
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const keep = useRef({ quantity, onChange });
  keep.current = { quantity, onChange };

  useEffect(() => {
    setText((t) => fieldText({ text: t, quantity, lastSent: lastSent.current, editing }));
    lastSent.current = quantity;
  }, [quantity, editing]);

  // Com o foco no campo, a janela é renovada a cada segundo com a quantidade atual.
  useEffect(() => {
    if (!editing) return;
    const timer = window.setInterval(() => keep.current.onChange(keep.current.quantity), HOLD_MS);
    return () => window.clearInterval(timer);
  }, [editing]);

  // Saindo da tela com o foco dentro (janela vencida), o foco vai para a lista.
  useEffect(() => {
    const el = input.current;
    return () => {
      if (el && document.activeElement === el) onLostFocus();
    };
  }, [onLostFocus]);

  const invalid = quantityTextInvalid(text);
  return (
    // Coluna estreita: o aviso do zero cabe embaixo do campo, em texto (🟡-1 do red team de 22/11).
    <div className="flex shrink-0 flex-col items-center">
      <Input
        ref={input}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        enterKeyHint="done"
        aria-label={`Quantidade de ${description}`}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? hintId : undefined}
        className="min-h-touch w-16 shrink-0 px-2 text-center tabular-nums xl:min-h-0"
        value={text}
        onFocus={(e) => {
          setEditing(true);
          onEditing(true);
          onChange(quantity);
          const el = e.currentTarget;
          window.requestAnimationFrame(() => el.setSelectionRange(0, el.value.length));
        }}
        onBlur={() => {
          setEditing(false);
          onEditing(false);
          setText(String(quantity));
          onChange(quantity);
        }}
        onKeyDown={(e) => {
          // Enter conclui: o foco vai para a lista (não para o body), e a janela corre os 5 s.
          if (e.key === 'Enter') onLostFocus();
        }}
        onChange={(e) => {
          // Só dígitos, até o teto: o campo mostra o que vai para a fila. Zero fica marcado e avisado.
          const next = nextQuantity(e.target.value, quantity);
          setText(next.text);
          if (!next.invalid && next.text !== '') lastSent.current = next.quantity;
          onChange(next.quantity);
        }}
      />
      {invalid && (
        <span id={hintId} className="mt-0.5 text-xs text-status-maintenance">
          <span aria-hidden>{QUANTITY_ZERO_HINT.visible}</span>
          <span className="sr-only">{QUANTITY_ZERO_HINT.spoken}</span>
        </span>
      )}
    </div>
  );
}

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
  onQuantity,
}: {
  items: AccountItem[];
  entries: QueueEntry[];
  onUndo: (clientItemId: string) => void;
  onDismiss: (clientItemId: string) => void;
  /** Quantidade digitada na linha que ainda está na janela de desfazer. */
  onQuantity: (clientItemId: string, quantity: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Relógio só enquanto há janela de desfazer aberta: o botão some quando o prazo vence (🟡-1).
  const now = useNow(entries.some((e) => e.status === 'undo'));
  // Rola até o fim ao abrir a conta e a cada toque deste aparelho — e só aí (🟡-2 do qa-redteam).
  // Cada toque renova o undoUntil; envio, item de outro aparelho e refetch não, e por isso não
  // puxam a lista de quem subiu para conferir um item antigo.
  const [editingId, setEditingId] = useState<string | null>(null);
  const lastTap = lastTapAt(entries, editingId);
  const focusList = useCallback(() => box.current?.focus(), []);
  const seenTap = useRef(-1);
  useEffect(() => {
    if (lastTap > seenTap.current && box.current) box.current.scrollTop = box.current.scrollHeight;
    seenTap.current = Math.max(seenTap.current, lastTap);
  }, [lastTap]);

  // Lançamento recusado ou excluído entra na vista, mesmo acima da área visível: senão o consumo
  // fica sem cobrança sem ninguém ver (🟡-3 do qa-redteam). Só a recusa nova move a caixa.
  const settledIds = entries.filter(isSettled).map((e) => e.clientItemId).join(' ');
  // Recusas que já estavam lá ao abrir a conta não contam como novas: sem rolagem e sem alerta
  // repetido a cada visita (🟢-2 da delta).
  const seenSettled = useRef<Set<string> | null>(null);
  seenSettled.current ??= new Set(entries.filter(isSettled).map((e) => e.clientItemId));
  const freshSettled = new Set(
    entries.filter((e) => isSettled(e) && !seenSettled.current!.has(e.clientItemId)).map((e) => e.clientItemId),
  );
  useEffect(() => {
    const seen = seenSettled.current!;
    const fresh = settledIds.split(' ').find((id) => id && !seen.has(id));
    for (const id of settledIds.split(' ')) if (id) seen.add(id);
    const row = fresh && box.current?.querySelector<HTMLElement>(`[data-entry="${CSS.escape(fresh)}"]`);
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
                  {/* Na janela de desfazer, a quantidade está no campo ao lado: o "6×" repetido só
                      tirava espaço do nome do produto no celular. */}
                  {entry.quantity !== 1 && !canUndo(entry, now) && (
                    <span className="mr-1 font-medium tabular-nums">{entry.quantity}×</span>
                  )}
                  {entry.description}
                </p>
                <EntryState status={entry.status} />
                {entry.reason && (
                  <p
                    role={freshSettled.has(entry.clientItemId) ? 'alert' : undefined}
                    className="text-xs text-status-maintenance"
                  >
                    {entry.reason}
                  </p>
                )}
              </div>
              {canUndo(entry, now) && (
                <QuantityField
                  quantity={entry.quantity}
                  description={entry.description}
                  onChange={(n) => onQuantity(entry.clientItemId, n)}
                  onEditing={(on) => setEditingId(on ? entry.clientItemId : null)}
                  onLostFocus={focusList}
                />
              )}
              {canUndo(entry, now) && (
                <Button
                  variant="ghost"
                  aria-label={undoAccessibleName(entry.quantity, entry.description)}
                  onClick={() => onUndo(entry.clientItemId)}
                >
                  {undoLabel(entry.quantity)}
                  {/* Segundos que restam, só para quem vê: o nome acessível acima é fixo. Sem
                      animação — o número muda a cada segundo pelo relógio que já esconde o botão. */}
                  <span aria-hidden className="ml-1 text-sm text-gray-600">
                    ({undoSecondsLeft(entry.undoUntil, now)} s)
                  </span>
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
