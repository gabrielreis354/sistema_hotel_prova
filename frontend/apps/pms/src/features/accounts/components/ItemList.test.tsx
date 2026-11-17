import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ItemList } from './ItemList.js';
import { undoAccessibleName, undoSecondsLeft } from '../accountTotals.js';
import { UNDO_MS, addTap, canUndo } from '../queueCore.js';

const T0 = 1_700_000_000_000;
const cerveja = { ownerId: 'u1', accountId: 'a1', productId: 'p1', description: 'Cerveja', unitPrice: '12.00' };
const agua = { ...cerveja, productId: 'p2', description: 'Água' };

describe('undoSecondsLeft — contagem regressiva do desfazer', () => {
  it('logo depois do toque mostra 5, e desce arredondando para cima', () => {
    expect(undoSecondsLeft(T0 + UNDO_MS, T0)).toBe(5);
    expect(undoSecondsLeft(T0 + UNDO_MS, T0 + 1)).toBe(5);
    expect(undoSecondsLeft(T0 + UNDO_MS, T0 + 1_000)).toBe(4);
    expect(undoSecondsLeft(T0 + UNDO_MS, T0 + 4_001)).toBe(1);
  });

  it('com relógio atrasado (now anterior ao toque), não passa de 5 (🟡-1 do red team)', () => {
    expect(undoSecondsLeft(T0 + UNDO_MS, T0 - 60_000)).toBe(5); // "65 s" na conta aberta há 60 s
    expect(undoSecondsLeft(T0 + UNDO_MS, T0 - 200)).toBe(5); // "6 s" no toque em rajada
  });

  it('nunca fica negativo depois do prazo', () => {
    expect(undoSecondsLeft(T0 + UNDO_MS, T0 + UNDO_MS)).toBe(0);
    expect(undoSecondsLeft(T0 + UNDO_MS, T0 + 60_000)).toBe(0);
  });

  it('enquanto há segundo para mostrar, a janela está aberta (o 0 não chega à tela)', () => {
    const [entry] = addTap([], cerveja, T0, 'c1');
    for (let t = T0; t < T0 + UNDO_MS + 1_000; t += 250) {
      expect(canUndo(entry!, t)).toBe(undoSecondsLeft(entry!.undoUntil, t) > 0);
    }
  });

  it('nome acessível fixo, sem os segundos', () => {
    expect(undoAccessibleName(1, 'Cerveja')).toBe('Desfazer: Cerveja, disponível por 5 segundos após o toque');
    expect(undoAccessibleName(3, 'Cerveja')).toBe('Desfazer 1: Cerveja, disponível por 5 segundos após o toque');
  });
});

describe('ItemList — indicador do tempo para desfazer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  const render = (entries: ReturnType<typeof addTap>) =>
    renderToString(<ItemList items={[]} entries={entries} onUndo={() => {}} onDismiss={() => {}} onQuantity={() => {}} />);

  it('mostra os segundos que restam, fora do nome acessível', () => {
    const entries = addTap([], cerveja, T0, 'c1');
    vi.setSystemTime(T0 + 2_000);
    const html = render(entries);
    expect(html).toMatch(/Desfazer<span aria-hidden="true"[^>]*>\(<!-- -->3<!-- --> s\)<\/span>/);
    expect(html).toContain('aria-label="Desfazer: Cerveja, disponível por 5 segundos após o toque"');
  });

  it('com mais de um lançamento recente, cada linha tem o próprio prazo (comportamento atual)', () => {
    let entries = addTap([], cerveja, T0, 'c1');
    entries = addTap(entries, agua, T0 + 3_000, 'c2');
    vi.setSystemTime(T0 + 3_500);
    const html = render(entries);
    expect(html).toContain('2<!-- --> s)');
    expect(html).toContain('5<!-- --> s)');
  });

  it('aos 5 s, o indicador some junto com o botão e volta o preço', () => {
    const entries = addTap([], cerveja, T0, 'c1');
    vi.setSystemTime(T0 + UNDO_MS);
    const html = render(entries);
    expect(html).not.toContain('Desfazer');
    expect(html).not.toContain(' s)');
    expect(html).toContain('12,00');
  });
});
