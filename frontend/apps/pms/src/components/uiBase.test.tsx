// Componentes base do @hotel/ui na identidade da SPEC-10 (F2 da integração, 25/11). Renderiza no
// servidor, como as outras telas, e confere as classes que carregam a regra.
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Button } from '@hotel/ui';

/** Classes da primeira tag do HTML. */
function classes(html: string): string[] {
  return (html.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/);
}

describe('Button: anel de foco (🟡 da linha de base de 24/11, SPEC-10 §10.6)', () => {
  // gray-400 dava 2,5:1 e gray-300 ~1,5:1; a marca dá 6,6 a 7,7:1 sobre branco e areia (≥ 3:1).
  it.each(['primary', 'secondary', 'ghost'] as const)('%s usa o anel da marca', (variant) => {
    const c = classes(renderToString(<Button variant={variant}>Ok</Button>));
    expect(c).toContain('focus-visible:ring-brand');
    expect(c.filter((x) => x.startsWith('focus-visible:ring-gray'))).toEqual([]);
  });
});

describe('Button secundário: branco com borda, como o "Sair" do topo (decisão de 25/11)', () => {
  it('fundo branco, borda e texto escuro; sem o cinza preenchido que some sobre o areia', () => {
    const c = classes(renderToString(<Button variant="secondary">Hoje</Button>));
    expect(c).toEqual(expect.arrayContaining(['bg-white', 'border', 'border-gray-300', 'text-gray-900']));
    expect(c).not.toContain('bg-gray-100');
  });
});
