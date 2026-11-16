// Nenhum componente do app com o nome de um componente do @hotel/ui (🟡4 do qa-redteam da T-05.3,
// SPEC-08 T-08.6). `Money` de quartos recebia o DECIMAL em texto e o do ui recebe centavos; o
// `Notice` da comanda era aviso neutro e o do ui é sucesso ou erro. Mesmo nome com contrato diferente
// faz o import errado compilar e mostrar o valor errado.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uiIndex = path.resolve(src, '../../../packages/ui/src/index.ts');

function tsx(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return tsx(p);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('nomes do @hotel/ui não se repetem no app', () => {
  const doUi = [...readFileSync(uiIndex, 'utf-8').matchAll(/export \{([^}]+)\}/g)]
    .flatMap((m) => (m[1] ?? '').split(','))
    .map((n) => n.trim())
    .filter((n) => /^[A-Z]/.test(n));

  it('lê os componentes do ui', () => {
    expect(doUi).toEqual(expect.arrayContaining(['Button', 'Money', 'Notice']));
  });

  it('nenhum `export function` local com nome de componente do ui', () => {
    const repetidos: string[] = [];
    for (const arquivo of tsx(src)) {
      for (const m of readFileSync(arquivo, 'utf-8').matchAll(/^export (?:function|const) ([A-Z]\w*)/gm)) {
        if (doUi.includes(m[1] ?? '')) repetidos.push(`${path.relative(src, arquivo)}: ${m[1]}`);
      }
    }
    expect(repetidos).toEqual([]);
  });
});
