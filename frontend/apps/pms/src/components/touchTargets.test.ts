// Alvo de toque de 48 px em 375 e em 768 px (SPEC-08 CA-08.g). O compacto só vale a partir do xl
// (1280 px), o corte da T-05.3: o tablet do balcão (768 px) já é md, e um `md:min-h-0` deixava menu,
// atalhos e abas com 36 a 38 px ali (repasse do qa-explorador de 16/11, T-08.6). Os testes de tela
// renderizam no servidor e não medem altura; esta varredura impede o corte errado de voltar.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function tsx(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return tsx(p);
    return /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n) ? [p] : [];
  });
}

describe('alvo de toque até o xl (CA-08.g)', () => {
  const arquivos = tsx(src);

  it('encontra os componentes', () => {
    expect(arquivos.length).toBeGreaterThan(30);
  });

  it('nada encolhe a altura antes do xl (md:, lg: ou sm: com min-h-0 ou h-N)', () => {
    const violacoes: string[] = [];
    for (const arquivo of arquivos) {
      readFileSync(arquivo, 'utf-8')
        .split('\n')
        .forEach((linha, i) => {
          const achou = linha.match(/\b(?:sm|md|lg):(?:min-h-0|h-\d+)\b/g);
          if (achou) violacoes.push(`${path.relative(src, arquivo)}:${i + 1} ${achou.join(' ')}`);
        });
    }
    expect(violacoes).toEqual([]);
  });

  it('item do menu lateral com 48 px até o xl (no md ele aparece, e tinha 36 px)', () => {
    const shell = readFileSync(path.join(src, 'components/AppShell.tsx'), 'utf-8');
    const item = shell.slice(shell.indexOf('function NavItemLink('));
    expect(item).toMatch(/min-h-touch/);
    expect(item).toMatch(/xl:min-h-0/);
  });

  it('atalhos de período: o compacto (h-9) só vale no xl', () => {
    const lista = readFileSync(path.join(src, 'features/reservations/ReservationsListPage.tsx'), 'utf-8');
    const atalhos = lista.slice(lista.indexOf('Atalhos de período'), lista.indexOf('</div>', lista.indexOf('Atalhos de período')));
    // Sem size="compact": o tamanho padrão do Button (comfortable) é o de 48 px; o compacto entra no xl.
    expect(atalhos).not.toMatch(/size="compact"/);
    expect(atalhos).toMatch(/xl:h-9 xl:min-h-0/);
  });
});
