import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Casca da SPEC-10 (T-10.4), renderizada no servidor como as outras telas. O usuário entra por
// dublê do store (no servidor o zustand lê o estado inicial) e o hotel por dublê do useMyTenant.
const session = vi.hoisted(() => ({
  user: { name: 'Recepção Aurora 1', role: 'RECEPTIONIST' } as { name: string; role: string } | null,
  logout: () => {},
}));
vi.mock('../stores/auth.js', () => ({
  useAuthStore: <T,>(select: (s: typeof session) => T) => select(session),
}));
vi.mock('../features/tenant/index.js', () => ({ useMyTenant: () => ({ data: { name: 'Pousada Aurora' } }) }));

import { AppShell, moreTabClass } from './AppShell.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function render(role: string) {
  session.user = { name: 'Recepção Aurora 1', role };
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Trecho do HTML entre a abertura de um elemento marcado e o seu fechamento aproximado. */
function trecho(html: string, marca: string, fim: string): string {
  const i = html.indexOf(marca);
  return i === -1 ? '' : html.slice(i, html.indexOf(fim, i));
}

describe('barra lateral (SPEC-10, T-10.4)', () => {
  it('fundo esmeralda por token, com o logo e o nome GESWAY', () => {
    const barra = trecho(render('ADMIN'), '<aside', '</aside>');
    // A classe exata na própria <aside>: bg-nav-active (item ativo) não conta (mutante de 22/11).
    const tag = barra.slice(0, barra.indexOf('>'));
    expect(tag.split(/[\s"]/)).toContain('bg-nav');
    expect(barra).toContain('data-logo="gesway"');
    expect(barra).toMatch(/GES.*WAY/);
    expect(barra).toContain('GESTÃO HOTELEIRA');
  });

  it('grupos Operação e Gestão para o administrador; a recepção vê só Operação', () => {
    const admin = trecho(render('ADMIN'), '<aside', '</aside>');
    expect(admin).toContain('Operação');
    expect(admin).toContain('Gestão');
    const recepcao = trecho(render('RECEPTIONIST'), '<aside', '</aside>');
    expect(recepcao).toContain('Operação');
    expect(recepcao).not.toContain('Gestão');
  });

  it('o usuário fica no pé da barra, com nome e papel', () => {
    session.user = { name: 'Ana Lima', role: 'RECEPTIONIST' };
    const html = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AppShell />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Nome que não contém o papel: "Recepção" só pode vir do rótulo do papel (🟢 do qa-redteam de 22/11).
    const usuario = trecho(trecho(html, '<aside', '</aside>'), 'data-area="usuario"', '</div></div>');
    expect(usuario).toContain('Ana Lima');
    expect(usuario).toContain('Recepção');
  });
});

describe('topo (SPEC-10, T-10.4)', () => {
  it('faixa verde e areia; no desktop só o hotel e o Sair (o usuário fica na barra lateral)', () => {
    const topo = trecho(render('RECEPTIONIST'), '<header', '</header>');
    expect(topo).toContain('from-strip-from');
    expect(topo).toContain('Pousada Aurora');
    expect(topo).toContain('Sair');
    // O nome só aparece na linha do celular, escondida a partir do md.
    const linhaCelular = trecho(topo, 'data-area="usuario-celular"', '</div>');
    expect(linhaCelular).toContain('md:hidden');
    expect(linhaCelular).toContain('Recepção Aurora 1');
    expect(topo.replace(linhaCelular, '')).not.toContain('Recepção Aurora 1');
  });

  it('as telas de trabalho ficam sobre o fundo areia', () => {
    expect(render('RECEPTIONIST')).toContain('bg-ground');
  });
});

describe('barra do celular (SPEC-10, R-4)', () => {
  it('deixa folga para a barra de gestos do iPhone, com no mínimo 6 px', () => {
    const barra = trecho(render('RECEPTIONIST'), 'aria-label="Navegação principal"', '</nav>');
    expect(barra).toContain('pb-[max(6px,env(safe-area-inset-bottom))]');
  });

  it('o index.html pede viewport-fit=cover: sem ele o Safari devolve 0 para a área segura (🟡 do qa-redteam de 22/11)', () => {
    const html = readFileSync(path.join(raiz, 'index.html'), 'utf-8');
    expect(html).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/);
  });

  it('o que fica preso acima da barra soma a mesma folga (total da comanda e folha do Mais)', () => {
    const rodape = readFileSync(path.join(raiz, 'src/features/accounts/components/StickyFooter.tsx'), 'utf-8');
    const casca = readFileSync(path.join(raiz, 'src/components/AppShell.tsx'), 'utf-8');
    // A comanda lê a altura da barra da casca (--tabbar): sem barra (garçom), o total desce até a folga.
    // Com valor padrão: fora da casca a página fica como antes, acima de uma barra de 3rem (🟢 do redteam da F2).
    // Desde a F6 a classe mora no StickyFooter, que o total da conta e o "Abrir conta" da lista usam.
    expect(rodape).toContain('bottom-[calc(var(--tabbar,3rem)+max(6px,env(safe-area-inset-bottom)))]');
    for (const tela of ['AccountPage.tsx', 'AccountsListPage.tsx']) {
      expect(readFileSync(path.join(raiz, 'src/features/accounts', tela), 'utf-8')).toContain('<StickyFooter');
    }
    expect(casca).toContain('bottom-[calc(3rem+max(6px,env(safe-area-inset-bottom)))]');
  });
});

// Audit do Impeccable de 22/11 (P2 e P3), tratado junto com o red team.
describe('tipografia da casca pela escala do preset (P2)', () => {
  it('nenhum tamanho de texto sob medida (text-[..]) na casca', () => {
    const casca = readFileSync(path.join(raiz, 'src/components/AppShell.tsx'), 'utf-8');
    expect(casca.match(/text-\[[^\]]+\]/g) ?? []).toEqual([]);
  });

  it('marca e rótulos usam os tamanhos novos do preset', () => {
    const preset = readFileSync(path.join(raiz, '../../packages/config/tailwind-preset.js'), 'utf-8');
    for (const nome of ['wordmark', "'wordmark-tag'", 'overline']) expect(preset).toContain(`${nome}: [`);
    const barra = trecho(render('ADMIN'), '<aside', '</aside>');
    expect(barra).toContain('text-wordmark ');
    expect(barra).toContain('text-wordmark-tag');
    expect(barra).toContain('text-overline');
  });
});

describe('casca: logo, frase e atalho de teclado (P3)', () => {
  it('a frase da marca pode quebrar linha (fonte aumentada não estoura a barra)', () => {
    const barra = trecho(render('ADMIN'), '<aside', '</aside>');
    const frase = barra.slice(barra.lastIndexOf('<span', barra.indexOf('GESTÃO HOTELEIRA')), barra.indexOf('GESTÃO HOTELEIRA'));
    expect(frase).not.toContain('whitespace-nowrap');
  });

  it('o logo leva à tela inicial do papel: Hoje para a recepção, Comanda para o garçom', () => {
    // A tag <a> do logo, em qualquer ordem de atributos.
    // O nome contém o texto visível, "Gesway" e "gestão hoteleira" (WCAG 2.5.3; red team de 22/11).
    const linkDoLogo = (html: string) =>
      (trecho(html, '<aside', '</aside>').match(/<a [^>]*aria-label="Gesway, gestão hoteleira, ir para o início"[^>]*>/) ?? [''])[0];
    expect(linkDoLogo(render('RECEPTIONIST'))).toContain('href="/"');
    expect(linkDoLogo(render('ADMIN'))).toContain('href="/"');
  });

  it('atalho "Pular para o conteúdo" antes do menu, apontando para o main', () => {
    const html = render('RECEPTIONIST');
    const atalho = html.indexOf('href="#conteudo"');
    expect(atalho).toBeGreaterThan(-1);
    expect(atalho).toBeLessThan(html.indexOf('<aside'));
    expect(html).toContain('Pular para o conteúdo');
    // Fora da tela sem foco, visível com foco, sem deslizar para quem pediu movimento reduzido.
    const tag = html.slice(html.lastIndexOf('<a', atalho), html.indexOf('>', atalho));
    for (const classe of ['fixed', '-translate-y-24', 'focus:translate-y-0', 'motion-reduce:transition-none']) {
      expect(tag.split(/[\s"]/)).toContain(classe);
    }
    // O main recebe o foco do atalho.
    const main = (html.match(/<main[^>]*>/) ?? [''])[0];
    expect(main).toContain('id="conteudo"');
    expect(main).toContain('tabindex="-1"');
  });
});


describe('nome do hotel no topo (🟢 R-6 da linha de base de 24/11)', () => {
  it('cortado com "…", o nome inteiro fica no title', () => {
    const topo = trecho(render('RECEPTIONIST'), '<header', '</header>');
    expect(topo).toMatch(/<div class="truncate[^"]*" title="Pousada Aurora">Pousada Aurora</);
  });
});

describe('aba "Mais" (🟢 da linha de base de 24/11: duas abas ativas com a folha aberta)', () => {
  const FIO = 'before:bg-brand';
  it('aberta numa tela fora do "Mais": fundo, sem o fio de "você está aqui"', () => {
    expect(moreTabClass(true, false)).not.toContain(FIO);
    expect(moreTabClass(true, false)).toContain('bg-brand/5');
  });
  it('numa tela do "Mais": o fio, aberta ou não', () => {
    expect(moreTabClass(false, true)).toContain(FIO);
    expect(moreTabClass(true, true)).toContain(FIO);
  });
  it('fechada e fora: aba comum', () => {
    expect(moreTabClass(false, false)).not.toContain(FIO);
    expect(moreTabClass(false, false)).toContain('text-gray-600');
  });
});

describe('papel com um destino só (garçom): sem navegação (🟢 da linha de base de 24/11; decisão de 25/11)', () => {
  // No tablet a barra lateral comia 236 de 800 px para mostrar só "Comanda"; no celular, 55 px de barra
  // com uma aba que leva à tela em que ele já está.
  it('sem barra lateral, sem barra de baixo e sem a coluna de 236 px', () => {
    const html = render('WAITER');
    expect(html).not.toContain('<aside');
    expect(html).not.toContain('Navegação principal');
    expect(html).not.toContain('md:grid-cols-[236px_minmax(0,1fr)]');
  });

  it('o topo continua com o hotel, quem está logado e o Sair; o logo aparece em toda largura', () => {
    const topo = trecho(render('WAITER'), '<header', '</header>');
    expect(topo).toContain('Pousada Aurora');
    expect(topo).toContain('Sair');
    expect(topo).toContain('data-logo="gesway"');
    // Sem a barra lateral, quem está logado aparece também no tablet e no desktop.
    expect(trecho(topo, 'data-area="usuario-celular"', '</div>')).not.toContain('md:hidden');
  });

  it('a altura da barra (--tabbar) é 0 para o garçom e 3rem para quem tem barra', () => {
    expect(render('WAITER')).toContain('[--tabbar:0px]');
    expect(render('RECEPTIONIST')).toContain('[--tabbar:3rem]');
    expect(render('RECEPTIONIST')).toContain('md:grid-cols-[236px_minmax(0,1fr)]');
  });
});
