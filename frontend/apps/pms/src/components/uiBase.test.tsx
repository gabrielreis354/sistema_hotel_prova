// Componentes base do @hotel/ui na identidade da SPEC-10 (F2 da integração, 25/11). Renderiza no
// servidor, como as outras telas, e confere as classes que carregam a regra.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Button, ErrorState, Input, Notice } from '@hotel/ui';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Fontes do app, sem os testes. */
function arquivosDoApp(dir = src): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return arquivosDoApp(p);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

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

describe('Input: alvo de 48 px no toque (CA-08.g, F2 de 25/11)', () => {
  // Media 42 px; quartos e o pagamento compensavam com um TOUCH local, hóspedes e reservas ficavam com 42.
  it('48 px no toque e altura natural só com mouse (desk, R-3)', () => {
    const c = classes(renderToString(<Input />));
    expect(c).toEqual(expect.arrayContaining(['min-h-touch', 'desk:min-h-0']));
  });

  it('nenhuma tela repete o alvo de toque no Input (o TOUCH local saiu)', () => {
    const repeticoes = arquivosDoApp().filter((a) => /\bTOUCH\b/.test(readFileSync(a, 'utf-8')));
    expect(repeticoes.map((a) => path.relative(src, a))).toEqual([]);
  });
});

describe('ErrorState na família do Notice (🟢 F2 da linha de base de 24/11)', () => {
  // Era texto vermelho num cartão branco com botão cinza grande, até 6 por tela nos Indicadores, e o 404
  // (Notice) tinha outro visual. Agora os dois erros são a mesma faixa: fio vermelho, fundo tingido, texto escuro.
  const html = renderToString(<ErrorState message="Não deu para carregar." onRetry={() => {}} />);

  it('a faixa tem o fio e o fundo do Notice de erro', () => {
    const faixa = classes(html);
    const aviso = classes(renderToString(<Notice tone="error">x</Notice>));
    for (const c of ['border-l-4', 'border-status-maintenance', 'bg-status-maintenance/10']) {
      expect(faixa).toContain(c);
      expect(aviso).toContain(c);
    }
  });

  it('a mensagem é alerta em texto escuro: o vermelho do preset não passa de 4,5:1 sobre o tingido', () => {
    const msg = html.match(/<p[^>]*role="alert"[^>]*>/)?.[0] ?? '';
    expect(msg).toContain('text-gray-900');
    expect(msg).not.toContain('text-status-maintenance');
  });

  it('"Tentar de novo" é secundário compacto, dentro da faixa', () => {
    const botao = html.match(/<button[^>]*>/)?.[0] ?? '';
    expect(html).toContain('Tentar de novo');
    expect(botao).toContain('bg-white');
    expect(botao).toContain('desk:h-9');
  });
});
