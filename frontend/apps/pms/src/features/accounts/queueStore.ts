import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth.js';
import { postItem, type AccountDetail, type AccountItemResult } from './accountsApi.js';
import { accountKeys } from './queries.js';
import {
  addTap,
  undoTap,
  dismiss as dismissEntry,
  readyToSend,
  markSending,
  classifySend,
  applyOutcome,
  recoverAfterReload,
  sendBody,
  newClientItemId,
  isQueueEntry,
  type QueueEntry,
  type Tap,
} from './queueCore.js';

/**
 * A fila offline viva: guarda no aparelho, envia quando dá e avisa a tela.
 *
 * Não é um store Zustand de propósito — estado global novo no app exige acordo (delegação da
 * T-05.5). É um módulo com `useSyncExternalStore`, que só a comanda usa.
 *
 * Cada lançamento fica numa chave própria do localStorage. Com uma chave só, duas abas abertas
 * gravavam a fila inteira uma por cima da outra, e o item de uma sumia do disco (🟡-5 do
 * qa-redteam). Assim cada aba só escreve e apaga o que mudou, e o evento `storage` mantém as
 * outras abas em dia. Sobrevive a recarregar a aba e ao 401.
 */

const PREFIX = 'gesway-comanda-item:';
const TICK_MS = 1_000;

function readDisk(): QueueEntry[] {
  const found: QueueEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (isQueueEntry(parsed)) found.push(parsed);
      else localStorage.removeItem(key); // malformada ou de versão antiga: descarta
    }
  } catch {
    // Armazenamento bloqueado: a fila fica só em memória nesta aba.
  }
  // Ordem do toque: o envio segue a ordem em que o garçom lançou.
  return found.sort((a, b) => a.undoUntil - b.undoUntil);
}

let entries: QueueEntry[] = typeof localStorage === 'undefined' ? [] : recoverAfterReload(readDisk());
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Grava só o que mudou: entradas novas ou alteradas, e remove as que saíram. */
function commit(next: QueueEntry[]) {
  const before = new Map(entries.map((e) => [e.clientItemId, e]));
  entries = next;
  try {
    for (const entry of next) {
      if (before.get(entry.clientItemId) !== entry) {
        localStorage.setItem(PREFIX + entry.clientItemId, JSON.stringify(entry));
      }
      before.delete(entry.clientItemId);
    }
    before.forEach((_, clientItemId) => localStorage.removeItem(PREFIX + clientItemId));
  } catch {
    // Armazenamento cheio ou bloqueado: a fila segue em memória nesta aba.
  }
  notify();
}

if (typeof window !== 'undefined') {
  // Outra aba lançou, enviou ou dispensou: relê do disco.
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key.startsWith(PREFIX)) {
      entries = readDisk();
      notify();
    }
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const queue = {
  snapshot: () => entries,
  tap: (tap: Tap) => commit(addTap(entries, tap, Date.now(), newClientItemId())),
  undo: (clientItemId: string, ownerId: string) => commit(undoTap(entries, clientItemId, Date.now(), ownerId)),
  dismiss: (clientItemId: string) => commit(dismissEntry(entries, clientItemId)),
};

/**
 * O item gravado entra na conta do cache na hora, com o que o servidor devolveu. Antes ele
 * saía da fila e só voltava à tela no fim da rodada: o garçom não via o item e lançava de novo,
 * com outro client_item_id — cobrança em dobro (🟡-2 do qa-redteam).
 */
function showSaved(qc: QueryClient, accountId: string, result: AccountItemResult | undefined) {
  const item = result?.item;
  if (!item) return;
  qc.setQueryData<AccountDetail>(accountKeys.detail(accountId), (old) => {
    if (!old) return old;
    const items = old.items ?? [];
    if (items.some((i) => i.id === item.id)) return old;
    return { ...old, items: [...items, item], total: result.account_total ?? old.total };
  });
}

let flushing = false;

/**
 * Envia, um por vez e na ordem do toque, o que já pode ir. Para a rodada em 401 (sem sessão,
 * as próximas também cairiam) e em falha de rede (a próxima tentativa vem com o tick).
 * Cada resposta atualiza a conta na hora, não no fim da rodada.
 */
async function flush(ownerId: string, qc: QueryClient) {
  if (flushing) return;
  flushing = true;
  try {
    for (const entry of readyToSend(entries, ownerId, Date.now())) {
      commit(markSending(entries, entry.clientItemId));
      const result = await postItem(entry.accountId, sendBody(entry));
      const outcome = classifySend(result.status, result.body);
      if (outcome.kind === 'saved') showSaved(qc, entry.accountId, result.data);
      commit(applyOutcome(entries, entry.clientItemId, outcome, Date.now()));
      if (outcome.kind === 'unauthorized' || outcome.kind === 'retry') break;
      // Gravado, excluído ou recusado: a conta mudou no servidor (item novo, ou foi fechada).
      void qc.invalidateQueries({ queryKey: accountKeys.detail(entry.accountId) });
      void qc.invalidateQueries({ queryKey: accountKeys.open });
    }
  } finally {
    flushing = false;
  }
}

/** Entradas da fila, reativas. */
export function useQueueEntries(): QueueEntry[] {
  return useSyncExternalStore(subscribe, queue.snapshot, queue.snapshot);
}

/** Relógio da tela enquanto há prazo correndo: o "Desfazer" some quando a janela fecha. */
export function useNow(active: boolean, everyMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs]);
  return active ? now : Date.now();
}

/**
 * Mantém a fila andando enquanto a comanda está aberta: a cada segundo (fim da janela de
 * desfazer, espera entre tentativas) e assim que a rede volta. Quem tem sessão envia só o
 * que lançou.
 */
export function useQueueRunner() {
  const qc = useQueryClient();
  const ownerId = useAuthStore((s) => (s.token ? s.user?.id : undefined));

  useEffect(() => {
    if (!ownerId) return;
    const run = () => void flush(ownerId, qc);
    const timer = setInterval(run, TICK_MS);
    window.addEventListener('online', run);
    run();
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', run);
    };
  }, [ownerId, qc]);
}
