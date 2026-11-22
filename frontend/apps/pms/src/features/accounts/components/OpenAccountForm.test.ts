import { afterEach, describe, expect, it } from 'vitest';
import { MutationObserver, QueryClient, onlineManager } from '@tanstack/react-query';
import { openAccountOnce } from './OpenAccountForm.js';

// Ligação da trava com o TanStack Query de verdade (🟡 de teste do qa-redteam de 22/11). O
// submitOnce sozinho é testado em submitLock.test.ts; aqui, que o formulário solta a trava quando a
// resposta chega. Sem o onSettled, o botão ficava morto depois de um 500: habilitado e sem envio.
const tick = () => new Promise((r) => setTimeout(r, 5));
const input = { type: 'TABLE' as const, label: 'Mesa 5' };

function observer(mutationFn: () => Promise<unknown>) {
  const obs = new MutationObserver(new QueryClient(), { mutationFn });
  const unsubscribe = obs.subscribe(() => {});
  const mutate: Parameters<typeof openAccountOnce>[1] = (variables, options) => {
    obs.mutate(variables, options as never).catch(() => {});
  };
  return { obs, mutate, unsubscribe };
}

afterEach(() => onlineManager.setOnline(true));

describe('openAccountOnce — Abrir mesa com a mutação real', () => {
  it('dois toques antes da resposta: um envio só', async () => {
    let calls = 0;
    const { mutate, unsubscribe } = observer(async () => {
      calls++;
      return { id: 'a1' };
    });
    const lock = { current: false };
    openAccountOnce(lock, mutate, input, () => {});
    openAccountOnce(lock, mutate, input, () => {});
    await tick();
    expect(calls).toBe(1);
    unsubscribe();
  });

  it('depois de um erro do servidor, o próximo toque envia', async () => {
    let calls = 0;
    const { mutate, unsubscribe } = observer(async () => {
      calls++;
      throw new Error('500');
    });
    const lock = { current: false };
    openAccountOnce(lock, mutate, input, () => {});
    await tick();
    expect(openAccountOnce(lock, mutate, input, () => {})).toBe(true);
    await tick();
    expect(calls).toBe(2);
    unsubscribe();
  });

  it('sem rede, segura o toque enquanto espera e solta quando a rede volta', async () => {
    let calls = 0;
    const { obs, mutate, unsubscribe } = observer(async () => {
      calls++;
      return { id: 'a1' };
    });
    const lock = { current: false };
    onlineManager.setOnline(false);
    openAccountOnce(lock, mutate, input, () => {});
    await tick();
    expect(obs.getCurrentResult().isPaused).toBe(true);
    expect(openAccountOnce(lock, mutate, input, () => {})).toBe(false);
    onlineManager.setOnline(true);
    await tick();
    await tick();
    expect(calls).toBe(1);
    expect(lock.current).toBe(false);
    unsubscribe();
  });
});
