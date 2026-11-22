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

import { AppShell } from './AppShell.js';

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
    expect(barra).toContain('bg-nav');
    expect(barra).toContain('data-logo="gesway"');
    expect(barra).toMatch(/GES.*WAY/);
    expect(barra).toContain('GESTÃO HOTELEIRA');
  });

  it('grupos Operação e Gestão para o administrador; o garçom vê só Operação', () => {
    const admin = trecho(render('ADMIN'), '<aside', '</aside>');
    expect(admin).toContain('Operação');
    expect(admin).toContain('Gestão');
    const garcom = trecho(render('WAITER'), '<aside', '</aside>');
    expect(garcom).toContain('Operação');
    expect(garcom).not.toContain('Gestão');
  });

  it('o usuário fica no pé da barra, com nome e papel', () => {
    const usuario = trecho(trecho(render('RECEPTIONIST'), '<aside', '</aside>'), 'data-area="usuario"', '</div></div>');
    expect(usuario).toContain('Recepção Aurora 1');
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
  it('deixa folga para a barra de gestos do iPhone', () => {
    const barra = trecho(render('RECEPTIONIST'), 'aria-label="Navegação principal"', '</nav>');
    expect(barra).toContain('safe-area-inset-bottom');
  });
});
