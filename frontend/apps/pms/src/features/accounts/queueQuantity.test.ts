import { describe, expect, it } from 'vitest';
import { MAX_QUANTITY, UNDO_MS, addTap, parseQuantity, readyToSend, setQuantity } from './queueCore.js';

// Quantidade digitada na comanda (combinado com o Gabriel em 16/11): o garçom toca em Cerveja e,
// na linha que está na janela de desfazer, digita 6. Vai ao servidor como 1 item "6×".
const T0 = 1_700_000_000_000;
const cerveja = { ownerId: 'u1', accountId: 'a1', productId: 'p1', description: 'Cerveja', unitPrice: '12.00' };

describe('parseQuantity — o que o garçom digita', () => {
  it.each([
    ['6', 6],
    ['12', 12],
    [' 3 ', 3],
    ['9999', 9999],
  ])('"%s" vale %i', (texto, n) => {
    expect(parseQuantity(texto)).toBe(n);
  });

  it.each(['', '0', '-2', '2.5', '1,5', 'abc', '10000', '6x'])('"%s" não é quantidade', (texto) => {
    expect(parseQuantity(texto)).toBeNull();
  });

  it('o teto é o mesmo do backend (MAX_QUANTITY do CreateAccountItemController)', () => {
    expect(MAX_QUANTITY).toBe(9999);
  });
});

describe('setQuantity — quantidade na linha da janela de desfazer', () => {
  const entry = addTap([], cerveja, T0, 'c1')[0]!;

  it('troca a quantidade e renova a janela a partir da edição', () => {
    const e = setQuantity([entry], 'c1', 6, T0 + 3_000, 'u1')[0]!;
    expect(e.quantity).toBe(6);
    expect(e.undoUntil).toBe(T0 + 3_000 + UNDO_MS);
  });

  it('enquanto edita, a linha não sai para o servidor', () => {
    const editado = setQuantity([entry], 'c1', 6, T0 + 4_900, 'u1');
    expect(readyToSend(editado, 'u1', T0 + UNDO_MS + 100)).toEqual([]);
    expect(readyToSend(editado, 'u1', T0 + 4_900 + UNDO_MS)).toHaveLength(1);
  });

  it('fora da janela não muda nada: o item pode já estar no servidor', () => {
    const fila = [entry];
    expect(setQuantity(fila, 'c1', 6, T0 + UNDO_MS, 'u1')).toBe(fila);
  });

  it('quem não lançou não muda a quantidade (aparelho compartilhado)', () => {
    const fila = [entry];
    expect(setQuantity(fila, 'c1', 6, T0 + 1_000, 'outro')).toBe(fila);
  });

  it('quantidade inválida não muda nada', () => {
    const fila = [entry];
    for (const n of [0, -1, 2.5, MAX_QUANTITY + 1, Number.NaN]) expect(setQuantity(fila, 'c1', n, T0 + 1_000, 'u1')).toBe(fila);
  });

  it('só mexe na linha pedida', () => {
    const fila = addTap([entry], { ...cerveja, productId: 'p2', description: 'Água' }, T0, 'c2');
    const depois = setQuantity(fila, 'c1', 4, T0 + 1_000, 'u1');
    expect(depois.map((e) => e.quantity)).toEqual([4, 1]);
    expect(depois[1]).toBe(fila[1]);
  });
});
