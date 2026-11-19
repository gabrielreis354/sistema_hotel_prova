import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ItemList } from './ItemList.js';
import { UNDO_MS, addTap } from '../queueCore.js';

// Campo de quantidade na linha (16/11): só enquanto o Desfazer existe; depois o item é do servidor.
const cerveja = { ownerId: 'u1', accountId: 'a1', productId: 'p1', description: 'Cerveja', unitPrice: '12.00' };
const noop = () => {};

function render(undoUntilFromNow: number) {
  const entry = addTap([], cerveja, Date.now() - UNDO_MS + undoUntilFromNow, 'c1')[0]!;
  return renderToString(<ItemList items={[]} entries={[{ ...entry, quantity: 3 }]} onUndo={noop} onDismiss={noop} onQuantity={noop} />);
}

describe('ItemList — quantidade digitada', () => {
  it('na janela de desfazer: campo numérico com o nome do produto e a quantidade atual', () => {
    expect(render(4_000)).toMatch(
      /<input(?=[^>]*inputMode="numeric")(?=[^>]*aria-label="Quantidade de Cerveja")(?=[^>]*value="3")[^>]*>/i,
    );
  });

  it('o campo tem alvo de toque de 48 px no celular', () => {
    expect(render(4_000)).toMatch(/<input(?=[^>]*aria-label="Quantidade de Cerveja")(?=[^>]*class="[^"]*min-h-touch)[^>]*>/);
  });

  it('fora da janela não há campo: o item já pode estar no servidor', () => {
    expect(render(-1_000)).not.toContain('Quantidade de Cerveja');
  });

  it('na janela, o "3×" fica só no campo; depois dela, volta na frente do nome', () => {
    expect(render(4_000)).not.toMatch(/>3<!-- -->×</);
    expect(render(-1_000)).toMatch(/>3<!-- -->×</);
  });
});
