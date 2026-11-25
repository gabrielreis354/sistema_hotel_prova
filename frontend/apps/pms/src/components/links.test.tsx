import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { buttonClasses } from '@hotel/ui';
import { BackLink, ButtonLink } from './links.js';

// ButtonLink e BackLink saíram do módulo de reservas na T-08.6 (decisão do Sirlande de 16/11): o
// @hotel/ui exporta as classes do Button e o link fica no app, que é quem tem o roteador. Assim o
// link com cara de botão nunca diverge do Button, e nenhum módulo importa navegação de reservas.

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function html(node: React.ReactNode): string {
  return renderToString(<MemoryRouter>{node}</MemoryRouter>);
}

function classOf(markup: string): string[] {
  return (markup.match(/class="([^"]*)"/)?.[1] ?? '').split(' ').sort();
}

describe('ButtonLink — as classes do Button, num <a>', () => {
  it.each(['primary', 'secondary'] as const)('%s: mesmas classes do Button da mesma variante', (variant) => {
    const out = html(<ButtonLink to="/x" variant={variant}>Ir</ButtonLink>);
    expect(out).toMatch(/^<a [^>]*href="\/x"/);
    expect(classOf(out)).toEqual(buttonClasses({ variant }).split(' ').sort());
  });

  it('className do chamador entra por último (o tailwind-merge resolve conflito)', () => {
    const out = html(<ButtonLink to="/x" variant="secondary" className="desk:min-h-0 w-full">Ir</ButtonLink>);
    expect(classOf(out)).toEqual(expect.arrayContaining(['desk:min-h-0', 'w-full']));
  });
});

describe('BackLink — volta com alvo de toque', () => {
  it('48 px até o compacto com mouse (desk, R-3)', () => {
    const out = html(<BackLink to="/hospedes">← Voltar</BackLink>);
    expect(classOf(out)).toEqual(expect.arrayContaining(['min-h-touch', 'desk:min-h-0']));
  });
});

describe('fronteira de módulo', () => {
  function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(n) ? [p] : [];
    });
  }

  it('nenhum arquivo define ou importa ButtonLink/BackLink fora de components/links', () => {
    const fora: string[] = [];
    for (const a of arquivos(path.join(src, 'features'))) {
      const codigo = readFileSync(a, 'utf-8');
      if (/export function (ButtonLink|BackLink)\b/.test(codigo)) fora.push(`${path.relative(src, a)}: define`);
      for (const m of codigo.matchAll(/import \{([^}]*)\} from '([^']+)'/g)) {
        if (/\b(ButtonLink|BackLink)\b/.test(m[1] ?? '') && !/components\/links\.js$/.test(m[2] ?? '')) {
          fora.push(`${path.relative(src, a)}: importa de ${m[2]}`);
        }
      }
    }
    expect(fora).toEqual([]);
  });
});
