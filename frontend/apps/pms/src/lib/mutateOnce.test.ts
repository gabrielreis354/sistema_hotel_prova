import { describe, expect, it } from 'vitest';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { mutateOnce, promiseOnce } from './submitLock.js';

// Duplo clique na SPEC-11 (CA-11.a): "Cadastrar categoria/quarto" e "Confirmar check-in" mandavam
// dois pedidos, porque o isPending chega à tela depois do segundo clique. Aqui, a trava ligada a
// uma mutação de verdade do TanStack Query — o mesmo caminho que os formulários e o painel usam.
const tick = () => new Promise((r) => setTimeout(r, 5));

function observer<T>(mutationFn: (v: string) => Promise<T>) {
  const client = new QueryClient();
  client.mount();
  const obs = new MutationObserver<T, Error, string>(client, { mutationFn });
  const unsubscribe = obs.subscribe(() => {});
  const mutate: Parameters<typeof mutateOnce<T, Error, string>>[1] = (variables, options) => {
    obs.mutate(variables, options as never).catch(() => {});
  };
  return { mutate, unsubscribe };
}

describe('mutateOnce — um envio por vez com a mutação real', () => {
  it('dois cliques antes da resposta: um pedido só, e o sucesso chega a quem chamou', async () => {
    let calls = 0;
    const { mutate, unsubscribe } = observer(async () => {
      calls += 1;
      await tick();
      return 'ok';
    });
    const lock = { current: false };
    const saved: string[] = [];
    expect(mutateOnce(lock, mutate, 'cat', { onSuccess: (d) => saved.push(d) })).toBe(true);
    expect(mutateOnce(lock, mutate, 'cat', { onSuccess: (d) => saved.push(d) })).toBe(false);
    await tick();
    await tick();
    expect(calls).toBe(1);
    expect(saved).toEqual(['ok']);
    unsubscribe();
  });

  it('depois de um erro, a trava solta e a próxima tentativa envia', async () => {
    let calls = 0;
    const { mutate, unsubscribe } = observer(async () => {
      calls += 1;
      throw new Error('500');
    });
    const lock = { current: false };
    const errors: string[] = [];
    mutateOnce(lock, mutate, 'q', { onError: (e) => errors.push(e.message) });
    await tick();
    expect(errors).toEqual(['500']);
    expect(mutateOnce(lock, mutate, 'q')).toBe(true);
    await tick();
    expect(calls).toBe(2);
    unsubscribe();
  });

  it('o onSettled de quem chamou roda (fechar o painel, recarregar indicadores) e a trava solta', async () => {
    const { mutate, unsubscribe } = observer(async () => 'ok');
    const lock = { current: false };
    let settled = 0;
    mutateOnce(lock, mutate, 'check-in', { onSettled: () => (settled += 1) });
    await tick();
    expect(settled).toBe(1);
    expect(lock.current).toBe(false);
    unsubscribe();
  });
});

describe('promiseOnce — a mesma trava para quem usa mutateAsync (Liberar quarto)', () => {
  it('segundo clique antes da resposta não chama de novo; depois da resposta, chama', async () => {
    const lock = { current: false };
    let calls = 0;
    const start = () => {
      calls += 1;
      return tick().then(() => 'ok');
    };
    const first = promiseOnce(lock, start);
    expect(promiseOnce(lock, start)).toBeNull();
    await expect(first).resolves.toBe('ok');
    expect(calls).toBe(1);
    expect(promiseOnce(lock, start)).not.toBeNull();
  });

  it('erro solta a trava e chega a quem chamou', async () => {
    const lock = { current: false };
    const failed = promiseOnce(lock, () => Promise.reject(new Error('409')));
    await expect(failed).rejects.toThrow('409');
    expect(lock.current).toBe(false);
  });
});
