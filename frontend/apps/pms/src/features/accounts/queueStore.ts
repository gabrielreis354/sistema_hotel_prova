import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth.js';
import { postItem } from './accountsApi.js';
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
  type QueueEntry,
  type Tap,
} from './queueCore.js';

/**
 * A fila offline viva: guarda no aparelho, envia quando dá e avisa a tela.
 *
 * Não é um store Zustand de propósito — estado global novo no app exige acordo (delegação da
 * T-05.5). É um módulo com `useSyncExternalStore`, que só a comanda usa.
 *
 * Guardada em localStorage: sobrevive a recarregar a aba, a fechar o navegador e ao 401 (a
 * sessão cai, o garçom loga de novo e a fila continua de onde parou).
 */

const STORAGE_KEY = 'gesway-comanda-fila';
const TICK_MS = 1_000;

function load(): QueueEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? recoverAfterReload(parsed.filter(isEntry)) : [];
  } catch {
    return [];
  }
}

function isEntry(value: unknown): value is QueueEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'clientItemId' in value &&
    typeof value.clientItemId === 'string' &&
    'accountId' in value &&
    typeof value.accountId === 'string'
  );
}

let entries: QueueEntry[] = typeof localStorage === 'undefined' ? [] : load();
const listeners = new Set<() => void>();

function commit(next: QueueEntry[]) {
  entries = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Armazenamento cheio ou bloqueado: a fila segue em memória nesta aba.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const queue = {
  snapshot: () => entries,
  tap: (tap: Tap) => commit(addTap(entries, tap, Date.now(), newClientItemId())),
  undo: (clientItemId: string) => commit(undoTap(entries, clientItemId, Date.now())),
  dismiss: (clientItemId: string) => commit(dismissEntry(entries, clientItemId)),
};

let flushing = false;

/**
 * Envia, um por vez e na ordem do toque, o que já pode ir. Um 401 interrompe a rodada: sem
 * sessão, as próximas também cairiam. Devolve as contas que mudaram no servidor.
 */
async function flush(ownerId: string): Promise<Set<string>> {
  const touched = new Set<string>();
  if (flushing) return touched;
  flushing = true;
  try {
    for (const entry of readyToSend(entries, ownerId, Date.now())) {
      commit(markSending(entries, entry.clientItemId));
      const result = await postItem(entry.accountId, sendBody(entry));
      const outcome = classifySend(result.status, result.body);
      commit(applyOutcome(entries, entry.clientItemId, outcome, Date.now()));
      if (outcome.kind === 'saved' || outcome.kind === 'excluded') touched.add(entry.accountId);
      if (outcome.kind === 'unauthorized' || outcome.kind === 'retry') break;
    }
  } finally {
    flushing = false;
  }
  return touched;
}

/** Entradas da fila, reativas. */
export function useQueueEntries(): QueueEntry[] {
  return useSyncExternalStore(subscribe, queue.snapshot, queue.snapshot);
}

/**
 * Mantém a fila andando enquanto a comanda está aberta: a cada segundo (fim da janela de
 * desfazer, espera entre tentativas) e assim que a rede volta. Quem tem sessão envia só o
 * que lançou. Item gravado atualiza a conta e a lista na tela.
 */
export function useQueueRunner() {
  const qc = useQueryClient();
  const ownerId = useAuthStore((s) => (s.token ? s.user?.id : undefined));

  useEffect(() => {
    if (!ownerId) return;
    let alive = true;
    const run = async () => {
      const touched = await flush(ownerId);
      if (!alive || touched.size === 0) return;
      touched.forEach((accountId) => qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) }));
      qc.invalidateQueries({ queryKey: accountKeys.open });
    };
    const timer = setInterval(run, TICK_MS);
    window.addEventListener('online', run);
    void run();
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('online', run);
    };
  }, [ownerId, qc]);
}
