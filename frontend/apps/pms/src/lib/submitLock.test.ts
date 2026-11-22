import { describe, expect, it, vi } from 'vitest';
import { submitOnce } from './submitLock.js';

// Duplo toque em "Abrir mesa" (estado de 19/11, 🟡3): o isPending do TanStack Query só chega à
// tela depois de um setTimeout(0) do notifyManager. Dois toques no mesmo quadro passavam pelo
// botão ainda habilitado e abriam duas contas (2 POST /accounts, visto no navegador em 22/11).
describe('submitOnce — uma gravação por vez', () => {
  it('o segundo toque, antes da resposta, não envia de novo', () => {
    const lock = { current: false };
    const send = vi.fn();
    expect(submitOnce(lock, send)).toBe(true);
    expect(submitOnce(lock, send)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('depois da resposta (sucesso ou erro), o próximo toque envia', () => {
    const lock = { current: false };
    let release = () => {};
    const send = vi.fn((done: () => void) => {
      release = done;
    });
    submitOnce(lock, send);
    release();
    expect(submitOnce(lock, send)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('se o envio lança, a trava solta e o garçom pode tentar de novo', () => {
    const lock = { current: false };
    expect(() =>
      submitOnce(lock, () => {
        throw new Error('falhou');
      }),
    ).toThrow('falhou');
    expect(lock.current).toBe(false);
  });
});
