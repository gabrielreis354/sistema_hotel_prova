// Regra dos hooks em todas as páginas: nenhum hook depois de um `return` antecipado do componente.
// Em 15/11 um useEffect depois do "carregando" deixou o detalhe da reserva em branco; os testes de
// tela renderizam uma vez só (no servidor) e não pegam a troca de ordem entre renders. Sem ESLint no
// app, esta checagem cobre o caso para toda página nova.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function paginas(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? paginas(p) : /Page\.tsx$/.test(n) ? [p] : [];
  });
}

/** Corpo de cada componente exportado: do `export function` até a próxima função de topo. */
function componentes(codigo: string): { nome: string; corpo: string }[] {
  const out: { nome: string; corpo: string }[] = [];
  const re = /^export function (\w+)\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo))) {
    const fim = codigo.slice(m.index + 1).search(/\n(?:export )?function /);
    out.push({ nome: m[1] ?? '', corpo: codigo.slice(m.index, fim === -1 ? undefined : m.index + 1 + fim) });
  }
  return out;
}

describe('regra dos hooks nas páginas', () => {
  const arquivos = paginas(path.join(src, 'features'));

  it('encontra as páginas', () => {
    expect(arquivos.length).toBeGreaterThan(10);
  });

  it('nenhum hook depois do primeiro return antecipado', () => {
    const violacoes: string[] = [];
    for (const arquivo of arquivos) {
      for (const { nome, corpo } of componentes(readFileSync(arquivo, 'utf-8'))) {
        const primeiro = corpo.search(/\n {2}if \([^\n]*\) return\b/);
        if (primeiro === -1) continue;
        const depois = corpo.slice(primeiro).match(/\buse[A-Z]\w*\(/g);
        if (depois) violacoes.push(`${path.relative(src, arquivo)} ${nome}: ${depois.join(', ')}`);
      }
    }
    expect(violacoes).toEqual([]);
  });
});
