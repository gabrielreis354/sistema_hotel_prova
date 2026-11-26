// Componentes base do @hotel/ui na identidade da SPEC-10 (F2 da integração, 25/11). Renderiza no
// servidor, como as outras telas, e confere as classes que carregam a regra.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Button, ErrorState, Input, Notice } from '@hotel/ui';
import { WriteButton } from '../features/rooms/components/Actions.js';

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

describe('ação do PageHeader com um tamanho só (🟢 F2 da linha de base de 24/11; decisão de 25/11)', () => {
  // Com mouse, "Nova reserva" tinha 48 px e "Novo quarto" 32. Agora todas são compactas: 48 px no toque e
  // a altura da tabela com mouse (DESIGN_PMS §2, densidade).
  /** Os botões que vão no `action` de um PageHeader (formatado pelo prettier: o bloco fecha com `/>` na mesma indentação). */
  function botoesDoCabecalho(fonte: string): string[] {
    const tags: string[] = [];
    const linhas = fonte.split('\n');
    linhas.forEach((linha, i) => {
      const m = linha.match(/^(\s*)<PageHeader\b/);
      if (!m) return;
      let bloco = linha;
      if (!/\/>\s*$/.test(linha)) {
        const fim = linhas.findIndex((l, j) => j > i && l === `${m[1]}/>`);
        bloco = linhas.slice(i, fim + 1).join('\n');
      }
      tags.push(...(bloco.match(/<(?:Button|ButtonLink|WriteButton)\b[^>]*>/g) ?? []));
    });
    return tags;
  }

  it('encontra as ações dos cabeçalhos', () => {
    const todas = arquivosDoApp().flatMap((a) => botoesDoCabecalho(readFileSync(a, 'utf-8')));
    expect(todas.length).toBeGreaterThanOrEqual(4);
  });

  it('toda ação de cabeçalho é compacta', () => {
    const fora = arquivosDoApp().flatMap((a) =>
      botoesDoCabecalho(readFileSync(a, 'utf-8'))
        .filter((t) => !t.includes('size="compact"'))
        .map((t) => `${path.relative(src, a)}: ${t}`),
    );
    expect(fora).toEqual([]);
  });

  it('o "Novo quarto" e a "Nova categoria" (ação em variável) também', () => {
    for (const [arquivo, nome] of [
      ['features/rooms/RoomsListPage.tsx', 'newRoom'],
      ['features/rooms/CategoriesListPage.tsx', 'newCategory'],
    ] as const) {
      const fonte = readFileSync(path.join(src, arquivo), 'utf-8');
      const tag = fonte.slice(fonte.indexOf(`const ${nome} = (`)).match(/<WriteButton\b[^>]*>/)?.[0] ?? '';
      expect(tag).toContain('size="compact"');
    }
  });
});

describe('ressalvas do qa-redteam da F2 (25/11)', () => {
  it('🟡4: WriteButton compacto mede 36 px com mouse sem precisar de classe extra (o desk:h-8 das linhas não vence)', () => {
    const c = classes(renderToString(<WriteButton size="compact" canWrite>Novo quarto</WriteButton>));
    expect(c).toContain('desk:h-9');
    expect(c).not.toContain('desk:h-8');
    // E o das linhas da tabela continua com 32 px.
    expect(classes(renderToString(<WriteButton canWrite>Editar</WriteButton>))).toContain('desk:h-8');
  });

  it('🟡2: texto vermelho não vai num ghost (fica direto no areia, 4,39:1); vai num botão de fundo branco', () => {
    const fora = arquivosDoApp().flatMap((a) =>
      (readFileSync(a, 'utf-8').match(/<(?:Button|ButtonLink)\b[^>]*>/gs) ?? [])
        .filter((t) => t.includes('variant="ghost"') && t.includes('text-status-maintenance'))
        .map(() => path.relative(src, a)),
    );
    expect(fora).toEqual([]);
  });

  it('🟢: primário e secundário têm a mesma borda, e o atalho não anda 2 px ao ativar', () => {
    expect(classes(renderToString(<Button>Ok</Button>))).toEqual(expect.arrayContaining(['border', 'border-transparent']));
  });
});

describe('F4 (25/11): RoomNumber e primário desabilitado', async () => {
  const { RoomNumber } = await import('@hotel/ui');

  it('RoomNumber: o número em destaque, decorativo (o texto ao lado já diz "Quarto 101"), cortando o longo com title', () => {
    const html = renderToString(<RoomNumber number="E2E195939" />);
    expect(html).toMatch(/^<span aria-hidden="true" title="E2E195939"/);
    expect(html).toContain('truncate');
    expect(html).toContain('E2E195939');
  });

  it('primário e danger desabilitados ficam cinza, não a marca a 50% (parecia meio habilitado, linha de base de 24/11)', () => {
    for (const variant of ['primary', 'danger'] as const) {
      const c = classes(renderToString(<Button variant={variant} disabled>Confirmar reserva</Button>));
      expect(c).toEqual(expect.arrayContaining(['disabled:bg-gray-200', 'disabled:text-gray-600', 'disabled:opacity-100']));
      expect(c).not.toContain('disabled:opacity-50');
    }
    // O secundário desabilitado também se lê (gray-500 sobre gray-50, 4,6:1), sem esmaecer o texto.
    expect(classes(renderToString(<Button variant="secondary" disabled>x</Button>))).toEqual(
      expect.arrayContaining(['disabled:bg-gray-50', 'disabled:text-gray-500', 'disabled:opacity-100']),
    );
    // O ghost continua esmaecido.
    expect(classes(renderToString(<Button variant="ghost" disabled>x</Button>))).toContain('disabled:opacity-50');
  });
});

describe('F5 (25/11): Table e SegmentedControl no @hotel/ui', async () => {
  const { Table, THead, Th, Tr, Td, SegmentedControl } = await import('@hotel/ui');

  it('Table: legenda para o leitor de tela, cabeçalho em gray-600 (o gray-500 dava 4,4:1 no gray-50) e valor à direita', () => {
    const html = renderToString(
      <Table caption="Quartos">
        <THead>
          <Th>Quarto</Th>
          <Th align="right">Diária</Th>
        </THead>
        <tbody>
          <Tr>
            <Td>101</Td>
            <Td align="right">R$ 1,00</Td>
          </Tr>
        </tbody>
      </Table>,
    );
    expect(html).toContain('<caption class="sr-only">Quartos</caption>');
    expect(html).toMatch(/<thead class="[^"]*text-gray-600/);
    expect(html).not.toMatch(/<thead class="[^"]*text-gray-500/);
    expect(html).toMatch(/<th scope="col" class="[^"]*text-right/);
    expect(html).toMatch(/<td class="[^"]*text-right tabular-nums/);
  });

  it('SegmentedControl: um grupo com nome, botões com aria-pressed; o ativo é tingido, não o primário sólido', () => {
    const html = renderToString(
      <SegmentedControl
        label="Atalhos de período"
        value="7"
        onChange={() => {}}
        options={[
          { value: 'hoje', label: 'Hoje' },
          { value: '7', label: 'Próximos 7 dias' },
        ]}
      />,
    );
    expect(html).toMatch(/^<div role="group" aria-label="Atalhos de período"/);
    const botoes = html.match(/<button[^>]*>/g) ?? [];
    expect(botoes).toHaveLength(2);
    expect(botoes[1]).toContain('aria-pressed="true"');
    expect(botoes[1]).toContain('bg-brand/10');
    expect(botoes[1]).not.toContain(' bg-brand ');
    expect(botoes[0]).toContain('aria-pressed="false"');
    // 48 px no toque, compacto com mouse; anel de foco da marca.
    for (const b of botoes) expect(b).toMatch(/min-h-touch[^"]*desk:h-9|desk:h-9[^"]*min-h-touch/);
    for (const b of botoes) expect(b).toContain('focus-visible:ring-brand');
  });

  it('SegmentedControl: o ativo também se lê pelo peso, não só pela cor (WCAG 1.4.1; 🟡3 do qa-redteam da F5)', () => {
    const html = renderToString(
      <SegmentedControl label="p" value="b" onChange={() => {}} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />,
    );
    const [inativo, ativo] = html.match(/<button[^>]*>/g) ?? [];
    expect(ativo).toContain('font-semibold');
    expect(inativo).not.toContain('font-semibold');
  });

  it('SegmentedControl: tocar numa opção chama onChange com o valor dela (o filtro de fato muda)', () => {
    const escolhas: string[] = [];
    // Componente sem hooks: dá para chamar e tocar nos botões sem DOM.
    const arvore = SegmentedControl({
      label: 'p',
      value: 'a',
      onChange: (v: string) => escolhas.push(v),
      options: [
        { value: 'a', label: 'A' },
        { value: '6', label: '6 meses' },
      ],
    }) as { props: { children: { props: { onClick: () => void } }[] } };
    for (const botao of arvore.props.children) botao.props.onClick();
    expect(escolhas).toEqual(['a', '6']);
  });
});

describe('telas encostadas à esquerda na coluna do conteúdo (R-7, F4 a F6)', () => {
  // A comanda entrou na F6. O comprovante é uma folha de papel, centralizada de propósito.
  const EXCECOES = ['features/reservations/ReservationReceiptPage.tsx', 'components/Placeholder.tsx'];
  it('nenhuma tela centraliza o miolo com mx-auto: ele "pulava" de largura ao trocar de tela', () => {
    const centralizadas = arquivosDoApp()
      .map((a) => path.relative(src, a))
      .filter((rel) => rel.startsWith('features/') && !EXCECOES.some((e) => rel.startsWith(e)))
      .filter((rel) => !rel.includes('.test.'))
      // Em qualquer posição da classe: antes só pegava quando o mx-auto vinha primeiro (🟢4 do qa-redteam da F5).
      .filter((rel) => /className="[^"]*\bmx-auto\b/.test(readFileSync(path.join(src, rel), 'utf-8')));
    expect(centralizadas).toEqual([]);
  });
});
