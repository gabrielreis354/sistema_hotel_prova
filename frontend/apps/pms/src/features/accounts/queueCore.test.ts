import { describe, it, expect, vi } from 'vitest';
import {
  UNDO_MS,
  addTap,
  undoTap,
  readyToSend,
  markSending,
  classifySend,
  applyOutcome,
  dismiss,
  pendingFor,
  recoverAfterReload,
  sendBody,
  newClientItemId,
  canUndo,
  isQueueEntry,
  recoverStale,
  STALE_SENDING_MS,
  timeoutSignal,
  type QueueEntry,
  type Tap,
} from './queueCore.js';

const T0 = 1_700_000_000_000;
const tap = (over: Partial<Tap> = {}): Tap => ({
  ownerId: 'garcom-1',
  accountId: 'mesa-5',
  productId: 'cerveja',
  description: 'Cerveja 600ml',
  unitPrice: '12.00',
  ...over,
});
let seq = 0;
const id = () => `id-${++seq}`;

describe('addTap — um toque lança quantidade 1 (CA-05.5.c)', () => {
  it('cria a entrada na janela de desfazer, com client_item_id gerado no toque', () => {
    const [entry] = addTap([], tap(), T0, 'abc');
    expect(entry).toMatchObject({
      clientItemId: 'abc', status: 'undo', quantity: 1, undoUntil: T0 + UNDO_MS, attempts: 0,
    });
  });

  it('segundo toque no mesmo produto, dentro da janela, soma na mesma linha e renova a janela', () => {
    let q = addTap([], tap(), T0, 'abc');
    q = addTap(q, tap(), T0 + 2000, 'def');
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ clientItemId: 'abc', quantity: 2, undoUntil: T0 + 2000 + UNDO_MS });
  });

  it('fora da janela, outro produto, outra conta ou outro garçom: linha nova', () => {
    let q = addTap([], tap(), T0, id());
    q = addTap(q, tap(), T0 + UNDO_MS, id());
    q = addTap(q, tap({ productId: 'agua' }), T0 + UNDO_MS, id());
    q = addTap(q, tap({ accountId: 'mesa-6' }), T0 + UNDO_MS, id());
    q = addTap(q, tap({ ownerId: 'garcom-2' }), T0 + UNDO_MS, id());
    expect(q).toHaveLength(5);
  });
});

describe('undoTap — desfazer em vez de diálogo (CA-05.5.g)', () => {
  it('na janela, tira uma unidade; na última, a linha some e nunca vai ao servidor', () => {
    let q = addTap([], tap(), T0, 'abc');
    q = addTap(q, tap(), T0 + 1000, 'x');
    q = undoTap(q, 'abc', T0 + 2000);
    expect(q[0]).toMatchObject({ quantity: 1 });
    q = undoTap(q, 'abc', T0 + 2500);
    expect(q).toEqual([]);
  });

  it('fora da janela, não desfaz: o item já pode estar no servidor', () => {
    const q = addTap([], tap(), T0, 'abc');
    expect(undoTap(q, 'abc', T0 + UNDO_MS)).toEqual(q);
  });

  it('só quem lançou desfaz (aparelho compartilhado, 🟡-4 do qa-redteam)', () => {
    const q = addTap([], tap(), T0, 'abc');
    expect(undoTap(q, 'abc', T0 + 1000, 'outro-garcom')).toEqual(q);
    expect(undoTap(q, 'abc', T0 + 1000, 'garcom-1')).toEqual([]);
  });

  it('canUndo: o botão só existe dentro do prazo, mesmo que o envio atrase (🟡-1)', () => {
    const [entry] = addTap([], tap(), T0, 'abc');
    expect(canUndo(entry!, T0 + UNDO_MS - 1)).toBe(true);
    expect(canUndo(entry!, T0 + UNDO_MS)).toBe(false);
    expect(canUndo({ ...entry!, status: 'queued' }, T0)).toBe(false);
  });
});

describe('readyToSend', () => {
  it('só o que passou da janela, do garçom logado, com a tentativa vencida', () => {
    let q = addTap([], tap(), T0, 'a');
    q = addTap(q, tap({ productId: 'agua' }), T0 + 3000, 'b');
    q = addTap(q, tap({ ownerId: 'outro' }), T0, 'c');
    expect(readyToSend(q, 'garcom-1', T0 + 1000).map((e) => e.clientItemId)).toEqual([]);
    expect(readyToSend(q, 'garcom-1', T0 + UNDO_MS).map((e) => e.clientItemId)).toEqual(['a']);
    expect(readyToSend(q, 'garcom-1', T0 + 3000 + UNDO_MS).map((e) => e.clientItemId)).toEqual(['a', 'b']);
  });

  it('não reenvia o que já está sendo enviado, nem item recusado', () => {
    let q = addTap([], tap(), T0, 'a');
    q = markSending(q, 'a', T0);
    expect(readyToSend(q, 'garcom-1', T0 + UNDO_MS)).toEqual([]);
    q = applyOutcome(q, 'a', { kind: 'rejected', reason: 'x' }, T0 + UNDO_MS);
    expect(readyToSend(q, 'garcom-1', T0 + 99 * UNDO_MS)).toEqual([]);
  });
});

describe('classifySend — o que cada resposta significa', () => {
  it('201 e 200 sem deleted_at: gravado', () => {
    expect(classifySend(201, { item: { deleted_at: null } })).toEqual({ kind: 'saved' });
    expect(classifySend(200, { item: { deleted_at: null } })).toEqual({ kind: 'saved' });
  });

  it('200 com deleted_at (reenvio de item que a recepção excluiu, D-19): excluído', () => {
    expect(classifySend(200, { item: { deleted_at: '2026-10-26T12:00:00Z' } })).toEqual({ kind: 'excluded' });
  });

  it('sem rede e 5xx: tenta de novo, nunca aparece como falha (CA-05.5.f)', () => {
    expect(classifySend('network', undefined)).toEqual({ kind: 'retry' });
    expect(classifySend(500, { error: 'x' })).toEqual({ kind: 'retry' });
    expect(classifySend(503, undefined)).toEqual({ kind: 'retry' });
  });

  it('422: recusado, com o motivo do backend em linguagem do balcão', () => {
    expect(classifySend(422, { error: 'Conta CLOSED não aceita item novo' }))
      .toEqual({ kind: 'rejected', reason: 'A conta foi fechada e não aceita item novo.' });
    expect(classifySend(422, { error: 'Produto fora do cardápio (inativo)' }))
      .toEqual({ kind: 'rejected', reason: 'Produto fora do cardápio (inativo)' });
    expect(classifySend(422, 'corpo estranho')).toEqual({ kind: 'rejected', reason: 'O sistema recusou o lançamento.' });
  });

  it('404, 400 e 403: recusado, sem nova tentativa', () => {
    expect(classifySend(404, { error: 'Conta não encontrada' })).toEqual({ kind: 'rejected', reason: 'Conta não encontrada' });
    expect(classifySend(400, { errors: ['quantity inválida'] }).kind).toBe('rejected');
    expect(classifySend(403, { error: 'Acesso não autorizado' }))
      .toEqual({ kind: 'rejected', reason: 'Sem permissão para lançar nesta conta.' });
  });

  it('401: sessão caiu — o item espera o próximo login', () => {
    expect(classifySend(401, undefined)).toEqual({ kind: 'unauthorized' });
  });

  it('409 (client_item_id em outra conta, D-19): bug, não fila', () => {
    expect(classifySend(409, { error: 'client_item_id já usado em outra conta' }).kind).toBe('conflict');
  });
});

describe('applyOutcome', () => {
  const sending = (): QueueEntry[] => markSending(addTap([], tap(), T0, 'a'), 'a', T0);

  it('gravado: sai da fila (o servidor passa a mostrar o item)', () => {
    expect(applyOutcome(sending(), 'a', { kind: 'saved' }, T0)).toEqual([]);
  });

  it('retry: volta para a fila, com espera crescente entre as tentativas', () => {
    let q = applyOutcome(sending(), 'a', { kind: 'retry' }, T0);
    expect(q[0]).toMatchObject({ status: 'queued', attempts: 1 });
    const first = q[0]!.nextAttemptAt - T0;
    q = applyOutcome(markSending(q, 'a', T0), 'a', { kind: 'retry' }, T0);
    expect(q[0]!.nextAttemptAt - T0).toBeGreaterThan(first);
    for (let i = 0; i < 20; i += 1) q = applyOutcome(markSending(q, 'a', T0), 'a', { kind: 'retry' }, T0);
    expect(q[0]!.nextAttemptAt - T0).toBeLessThanOrEqual(30_000);
  });

  it('recusado e excluído: ficam à vista com o motivo até o garçom dispensar', () => {
    let q = applyOutcome(sending(), 'a', { kind: 'rejected', reason: 'Conta fechada' }, T0);
    expect(q[0]).toMatchObject({ status: 'rejected', reason: 'Conta fechada' });
    expect(dismiss(q, 'a')).toEqual([]);
    q = applyOutcome(sending(), 'a', { kind: 'excluded' }, T0);
    expect(q[0]).toMatchObject({ status: 'excluded', reason: 'Excluído pela recepção' });
  });

  it('conflito: registra no console como bug e mostra o item como recusado', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const q = applyOutcome(sending(), 'a', { kind: 'conflict', reason: 'x' }, T0);
    expect(q[0]!.status).toBe('rejected');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('401: volta para a fila sem contar tentativa', () => {
    const q = applyOutcome(sending(), 'a', { kind: 'unauthorized' }, T0);
    expect(q[0]).toMatchObject({ status: 'queued', attempts: 0 });
  });
});

describe('recarga da página no meio do envio', () => {
  it('o que estava "enviando" volta para a fila: o reenvio é seguro pelo client_item_id', () => {
    const q = recoverAfterReload(markSending(addTap([], tap(), T0, 'a'), 'a', T0));
    expect(q[0]!.status).toBe('queued');
  });
});

describe('recoverStale — aba fechada no meio do envio (D-3 da reauditoria)', () => {
  it('"Enviando" que passou do prazo volta para a fila; o recente fica', () => {
    let q = addTap([], tap(), T0, 'a');
    q = addTap(q, tap({ productId: 'agua' }), T0, 'b');
    q = markSending(q, 'a', T0);
    q = markSending(q, 'b', T0 + STALE_SENDING_MS);
    const now = T0 + STALE_SENDING_MS + 1;
    const r = recoverStale(q, now);
    expect(r.find((e) => e.clientItemId === 'a')).toMatchObject({ status: 'queued', nextAttemptAt: now });
    expect(r.find((e) => e.clientItemId === 'b')!.status).toBe('sending');
  });

  it('limite exato: no prazo ainda espera; entrada antiga sem sendingSince volta à fila', () => {
    const q = markSending(addTap([], tap(), T0, 'a'), 'a', T0);
    expect(recoverStale(q, T0 + STALE_SENDING_MS)).toBe(q);
    const { sendingSince: _ignored, ...legacy } = q[0]!;
    expect(recoverStale([legacy], T0)[0]!.status).toBe('queued');
  });

  it('sem nada parado, devolve a mesma lista (não regrava o aparelho)', () => {
    const q = markSending(addTap([], tap(), T0, 'a'), 'a', T0);
    expect(recoverStale(q, T0 + 1)).toBe(q);
  });
});

describe('timeoutSignal — prazo do envio sem AbortSignal.timeout (D-2, iOS 15)', () => {
  it('aborta depois do prazo também sem AbortSignal.timeout', async () => {
    const original = AbortSignal.timeout;
    // @ts-expect-error simula navegador antigo, sem a função
    AbortSignal.timeout = undefined;
    try {
      const signal = timeoutSignal(20);
      expect(signal.aborted).toBe(false);
      await new Promise((r) => setTimeout(r, 40));
      expect(signal.aborted).toBe(true);
    } finally {
      AbortSignal.timeout = original;
    }
  });
});

describe('pendingFor e sendBody', () => {
  it('pendentes da conta: na janela, na fila e enviando; recusados não contam', () => {
    let q = addTap([], tap(), T0, 'a');
    q = addTap(q, tap({ productId: 'agua' }), T0, 'b');
    q = addTap(q, tap({ accountId: 'outra' }), T0, 'c');
    q = applyOutcome(markSending(q, 'b', T0), 'b', { kind: 'rejected', reason: 'x' }, T0);
    expect(pendingFor(q, 'mesa-5').map((e) => e.clientItemId)).toEqual(['a']);
  });

  it('corpo do POST: só produto, quantidade e client_item_id — o garçom lança do cardápio, faturável (D-21)', () => {
    const [entry] = addTap([], tap(), T0, 'abc');
    expect(sendBody(entry!)).toEqual({ product_id: 'cerveja', quantity: 1, client_item_id: 'abc' });
  });
});

describe('isQueueEntry — o que vem do armazenamento do aparelho (🟢 do qa-redteam)', () => {
  it('aceita a entrada completa e recusa a malformada ou de versão antiga', () => {
    const [entry] = addTap([], tap(), T0, 'abc');
    expect(isQueueEntry(JSON.parse(JSON.stringify(entry)))).toBe(true);
    expect(isQueueEntry({ clientItemId: 'x', accountId: 'y' })).toBe(false);
    expect(isQueueEntry({ ...entry, quantity: '2' })).toBe(false);
    expect(isQueueEntry({ ...entry, status: 'gravado' })).toBe(false);
    expect(isQueueEntry(null)).toBe(false);
  });
});

describe('newClientItemId', () => {
  it('UUID v4 válido, sem depender de crypto.randomUUID (HTTP na rede local)', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newClientItemId()));
    expect(ids.size).toBe(200);
    for (const value of ids) {
      expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
