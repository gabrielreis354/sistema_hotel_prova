// CA-08.a (SPEC-08, T-08.2): o produto se chama Gesway. Os nomes antigos não existem mais no app.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ANTIGOS = /Hotel PMS|PMS — Gestão de Hotel/;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(tsx?|html)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

describe('marca Gesway (CA-08.a)', () => {
  it('"Hotel PMS" e "PMS — Gestão de Hotel" não aparecem em src/ nem no index.html', () => {
    const achados = [...arquivos(path.join(root, 'src')), path.join(root, 'index.html')]
      .filter((f) => ANTIGOS.test(readFileSync(f, 'utf-8')))
      .map((f) => path.relative(root, f));
    expect(achados).toEqual([]);
  });

  it('a aba do navegador diz Gesway e declara um ícone (sem 404 de /favicon.ico)', () => {
    const html = readFileSync(path.join(root, 'index.html'), 'utf-8');
    expect(html).toMatch(/<title>Gesway — Gestão hoteleira<\/title>/);
    expect(html).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"/);
    expect(statSync(path.join(root, 'public', 'favicon.svg')).isFile()).toBe(true);
  });
});
