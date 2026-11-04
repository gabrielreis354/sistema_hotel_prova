/**
 * Fila offline da comanda — lógica pura, sem rede, relógio nem armazenamento (CA-05.5.e, f, g).
 *
 * O garçom lança com o salão cheio e o Wi-Fi ruim. Cada toque vira uma entrada com um
 * `client_item_id` gerado NO TOQUE: o reenvio da mesma entrada nunca duplica o item, porque o
 * backend responde 200 com o item que já existe (RN-008). Por isso tudo o que for dúvida de
 * rede volta para a fila, e só a recusa explícita do servidor tira o item dela.
 *
 * Ciclo de uma entrada:
 *   undo     → janela curta em que "Desfazer" ainda tira o item sem ele chegar ao servidor.
 *              O garçom não exclui item depois de gravado (DELETE é só ADMIN, D-8).
 *   queued   → pronto para enviar, ou esperando a rede voltar.
 *   sending  → requisição em andamento.
 *   rejected → o servidor recusou (422, 404, 403...): fica à vista com o motivo até dispensar.
 *   excluded → reenvio de um item que a recepção já excluiu (200 com deleted_at, D-19).
 *   Gravado (201/200) → sai da fila; a partir daí o item vem do servidor.
 */

export const UNDO_MS = 5_000;
const MAX_BACKOFF_MS = 30_000;

export type EntryStatus = 'undo' | 'queued' | 'sending' | 'rejected' | 'excluded';

export interface Tap {
  /** Usuário que lançou. Na troca de turno, a fila de um garçom não sai com o login de outro. */
  ownerId: string;
  accountId: string;
  productId: string;
  description: string;
  /** Preço do cardápio no momento do toque, DECIMAL em texto ("12.00"). Só para exibição. */
  unitPrice: string;
}

export interface QueueEntry extends Tap {
  clientItemId: string;
  quantity: number;
  status: EntryStatus;
  undoUntil: number;
  attempts: number;
  nextAttemptAt: number;
  /** Quando o envio começou. Serve para devolver à fila o envio que uma aba fechada largou. */
  sendingSince?: number;
  reason?: string;
}

export type SendOutcome =
  | { kind: 'saved' }
  | { kind: 'excluded' }
  | { kind: 'retry' }
  | { kind: 'unauthorized' }
  | { kind: 'rejected'; reason: string }
  | { kind: 'conflict'; reason: string };

const PENDING: EntryStatus[] = ['undo', 'queued', 'sending'];

const sameLine = (entry: QueueEntry, tap: Tap) =>
  entry.ownerId === tap.ownerId && entry.accountId === tap.accountId && entry.productId === tap.productId;

/**
 * Um toque no produto. Dentro da janela de desfazer, o mesmo produto na mesma conta soma na
 * mesma linha (3 cervejas = 1 linha "3×", não 3 linhas) e renova a janela.
 */
export function addTap(entries: QueueEntry[], tap: Tap, now: number, clientItemId: string): QueueEntry[] {
  const open = entries.find((e) => e.status === 'undo' && now < e.undoUntil && sameLine(e, tap));
  if (open) {
    return entries.map((e) =>
      e === open ? { ...e, quantity: e.quantity + 1, undoUntil: now + UNDO_MS } : e,
    );
  }
  return [
    ...entries,
    {
      ...tap,
      clientItemId,
      quantity: 1,
      status: 'undo',
      undoUntil: now + UNDO_MS,
      attempts: 0,
      nextAttemptAt: now + UNDO_MS,
    },
  ];
}

/**
 * O botão "Desfazer" só existe dentro do prazo. Depois dele o item pode já estar no servidor,
 * mesmo que o envio atrase — mostrar o botão seria prometer o que o toque não cumpre.
 */
export function canUndo(entry: QueueEntry, now: number): boolean {
  return entry.status === 'undo' && now < entry.undoUntil;
}

/**
 * "Desfazer": tira uma unidade enquanto a janela está aberta. Fora dela, ou para quem não
 * lançou (aparelho compartilhado), não faz nada.
 */
export function undoTap(entries: QueueEntry[], clientItemId: string, now: number, ownerId?: string): QueueEntry[] {
  const entry = entries.find((e) => e.clientItemId === clientItemId);
  if (!entry || !canUndo(entry, now)) return entries;
  if (ownerId !== undefined && entry.ownerId !== ownerId) return entries;
  if (entry.quantity > 1) {
    return entries.map((e) => (e === entry ? { ...e, quantity: e.quantity - 1 } : e));
  }
  return entries.filter((e) => e !== entry);
}

/** Entradas do usuário logado que já podem ir ao servidor, na ordem em que foram lançadas. */
export function readyToSend(entries: QueueEntry[], ownerId: string, now: number): QueueEntry[] {
  return entries.filter(
    (e) =>
      e.ownerId === ownerId &&
      ((e.status === 'undo' && now >= e.undoUntil) || (e.status === 'queued' && now >= e.nextAttemptAt)),
  );
}

export function markSending(entries: QueueEntry[], clientItemId: string, now: number): QueueEntry[] {
  return entries.map((e) => (e.clientItemId === clientItemId ? { ...e, status: 'sending', sendingSince: now } : e));
}

/** Prazo do envio (SEND_TIMEOUT_MS) com folga: depois disso, nenhuma aba está mais esperando a resposta. */
export const SEND_TIMEOUT_MS = 10_000;
export const STALE_SENDING_MS = SEND_TIMEOUT_MS + 5_000;

/**
 * "Enviando" que passou do prazo: a aba que enviava foi fechada no meio. Volta para a fila —
 * reenviar é seguro (RN-008). Sem isso, a outra aba via o item "Enviando" para sempre, e o
 * fechamento da conta ficava travado (D-3 da reauditoria).
 */
export function recoverStale(entries: QueueEntry[], now: number): QueueEntry[] {
  const stale = (e: QueueEntry) => e.status === 'sending' && now - (e.sendingSince ?? 0) > STALE_SENDING_MS;
  if (!entries.some(stale)) return entries;
  return entries.map((e) => (stale(e) ? { ...e, status: 'queued', nextAttemptAt: now } : e));
}

/**
 * Sinal que aborta o envio depois do prazo. `AbortSignal.timeout` não existe antes do
 * Safari/iOS 16 e do Chrome 103; sem ele, o TypeError virava "falha de rede" e a fila tentava
 * para sempre sem nunca enviar (D-2 da reauditoria).
 */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

const STATUS_WORDS: Record<string, string> = { CLOSED: 'fechada', PAID: 'paga' };

/** Mensagem do backend em linguagem do balcão. O corpo chega como `unknown`: lido sem cast. */
function reasonFrom(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback;
  if ('error' in body && typeof body.error === 'string') {
    const closed = /^Conta (CLOSED|PAID) não aceita item novo$/.exec(body.error);
    if (closed) return `A conta foi ${STATUS_WORDS[closed[1]!]} e não aceita item novo.`;
    return body.error;
  }
  if ('errors' in body && Array.isArray(body.errors) && typeof body.errors[0] === 'string') {
    return body.errors.join('; ');
  }
  return fallback;
}

function isDeleted(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || !('item' in body)) return false;
  const item = body.item;
  return typeof item === 'object' && item !== null && 'deleted_at' in item && !!item.deleted_at;
}

/** O que a resposta do POST /accounts/:id/items significa para a fila. */
export function classifySend(status: number | 'network', body: unknown): SendOutcome {
  if (status === 'network' || status >= 500) return { kind: 'retry' };
  if (status === 200 || status === 201) return isDeleted(body) ? { kind: 'excluded' } : { kind: 'saved' };
  if (status === 401) return { kind: 'unauthorized' };
  if (status === 403) return { kind: 'rejected', reason: 'Sem permissão para lançar nesta conta.' };
  if (status === 409) return { kind: 'conflict', reason: reasonFrom(body, 'Conflito de lançamento.') };
  return { kind: 'rejected', reason: reasonFrom(body, 'O sistema recusou o lançamento.') };
}

const backoff = (attempts: number) => Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** attempts);

export function applyOutcome(
  entries: QueueEntry[],
  clientItemId: string,
  outcome: SendOutcome,
  now: number,
): QueueEntry[] {
  const update = (patch: Partial<QueueEntry>) =>
    entries.map((e) => (e.clientItemId === clientItemId ? { ...e, ...patch } : e));

  switch (outcome.kind) {
    case 'saved':
      return entries.filter((e) => e.clientItemId !== clientItemId);
    case 'excluded':
      return update({ status: 'excluded', reason: 'Excluído pela recepção' });
    case 'retry': {
      const attempts = (entries.find((e) => e.clientItemId === clientItemId)?.attempts ?? 0) + 1;
      return update({ status: 'queued', attempts, nextAttemptAt: now + backoff(attempts) });
    }
    case 'unauthorized':
      // Sem sessão não adianta insistir: espera o próximo login, sem gastar tentativa.
      return update({ status: 'queued', nextAttemptAt: now });
    case 'conflict':
      // client_item_id já usado em OUTRA conta (D-19): o gerador falhou. É bug, não rede.
      console.error('Comanda: client_item_id em conflito com outra conta', clientItemId, outcome.reason);
      return update({ status: 'rejected', reason: 'Erro no lançamento. Avise a gerência.' });
    case 'rejected':
      return update({ status: 'rejected', reason: outcome.reason });
  }
}

/** O garçom leu o aviso de recusa ou exclusão. */
export function dismiss(entries: QueueEntry[], clientItemId: string): QueueEntry[] {
  return entries.filter(
    (e) => !(e.clientItemId === clientItemId && (e.status === 'rejected' || e.status === 'excluded')),
  );
}

/** Lançamentos da conta que ainda não estão no servidor. */
export function pendingFor(entries: QueueEntry[], accountId: string): QueueEntry[] {
  return entries.filter((e) => e.accountId === accountId && PENDING.includes(e.status));
}

/** A aba fechou no meio do envio: não se sabe se chegou. Reenviar é seguro (RN-008). */
export function recoverAfterReload(entries: QueueEntry[]): QueueEntry[] {
  return entries.map((e) => (e.status === 'sending' ? { ...e, status: 'queued' } : e));
}

/** Corpo do POST: o garçom lança do cardápio, faturável (D-21) — preço e total são do servidor. */
export function sendBody(entry: QueueEntry) {
  return { product_id: entry.productId, quantity: entry.quantity, client_item_id: entry.clientItemId };
}

/**
 * UUID v4 com `crypto.getRandomValues`. O `crypto.randomUUID` só existe em contexto seguro
 * (HTTPS ou localhost) — o celular do garçom abrindo o PMS pelo IP da rede local não teria.
 */
export function newClientItemId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const STATUSES: EntryStatus[] = ['undo', 'queued', 'sending', 'rejected', 'excluded'];
const STRING_FIELDS = ['clientItemId', 'ownerId', 'accountId', 'productId', 'description', 'unitPrice'] as const;
const NUMBER_FIELDS = ['quantity', 'undoUntil', 'attempts', 'nextAttemptAt'] as const;

/**
 * O que veio do armazenamento do aparelho é uma entrada inteira? Entrada malformada ou de
 * versão antiga é descartada na leitura, em vez de derrubar a tela da conta.
 */
export function isQueueEntry(value: unknown): value is QueueEntry {
  if (typeof value !== 'object' || value === null) return false;
  const record: Record<string, unknown> = { ...value };
  return (
    STRING_FIELDS.every((field) => typeof record[field] === 'string') &&
    NUMBER_FIELDS.every((field) => typeof record[field] === 'number' && Number.isFinite(record[field])) &&
    typeof record.status === 'string' &&
    STATUSES.some((status) => status === record.status) &&
    (record.reason === undefined || typeof record.reason === 'string') &&
    (record.sendingSince === undefined || typeof record.sendingSince === 'number')
  );
}
