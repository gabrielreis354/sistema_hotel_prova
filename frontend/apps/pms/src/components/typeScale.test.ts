// A escala de tipografia do preset (T-08.1) passa pelo cn() de @hotel/ui sem sumir. O tailwind-merge
// não conhece text-title/section/body/support/figure: sem ensinar, ele os toma por cor e o
// text-gray-600 que vem depois apaga o tamanho (barra do celular em 375 px, 15/11).
import { describe, expect, it } from 'vitest';
import { cn } from '@hotel/ui';

describe('cn() com a escala de tipografia', () => {
  it.each(['title', 'section', 'body', 'support', 'figure', 'wordmark', 'wordmark-tag', 'overline'])('text-%s convive com uma cor de texto', (size) => {
    expect(cn(`flex text-${size}`, 'text-gray-600').split(' ')).toEqual(['flex', `text-${size}`, 'text-gray-600']);
  });

  it('dois tamanhos: o último vence, como nos tamanhos do Tailwind', () => {
    expect(cn('text-support', 'text-title')).toBe('text-title');
    expect(cn('text-sm', 'text-support')).toBe('text-support');
  });
});
