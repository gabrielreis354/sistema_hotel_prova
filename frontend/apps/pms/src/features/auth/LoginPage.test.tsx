import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// Login renderizado no servidor, no padrão do ReservationDetailPage.test.tsx (o pms não tem DOM
// nos testes). Prova a estrutura da T-10.1 (SPEC-10 §3): o que depende de clique (olho da senha,
// erro do servidor, subdomínio, redirecionamento) é conferido no navegador e fica no relatório.
const session = vi.hoisted(() => ({ setSession: vi.fn() }));
vi.mock('../../stores/auth.js', () => ({
  useAuthStore: <T,>(select: (s: typeof session) => T) => select(session),
}));

import { LoginPage } from './LoginPage.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = () =>
  renderToString(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );

describe('LoginPage — identidade da SPEC-10 (T-10.1)', () => {
  it('mostra o nome com o WAY destacado, a frase e o título Entrar', () => {
    const page = html();
    expect(page).toMatch(/GES<span[^>]*>WAY<\/span>/);
    expect(page).toContain('GESTÃO HOTELEIRA INTELIGENTE');
    expect(page).toMatch(/<h1[^>]*>Entrar<\/h1>/);
  });

  it('o logo é decorativo: o nome escrito logo abaixo já diz Gesway', () => {
    expect(html()).toMatch(/<svg[^>]*aria-hidden="true"[^>]*data-logo="gesway"|<svg[^>]*data-logo="gesway"[^>]*aria-hidden="true"/);
  });

  it('a luz da borda e o fundo ficam fora da árvore acessível', () => {
    const page = html();
    for (const deco of ['login-backdrop', 'login-halo', 'login-ring']) {
      expect(page, deco).toMatch(new RegExp(`<div[^>]*class="[^"]*${deco}[^"]*"[^>]*aria-hidden="true"|<div[^>]*aria-hidden="true"[^>]*class="[^"]*${deco}`));
    }
  });
});

describe('LoginPage — o que não pode mudar do login atual', () => {
  it('e-mail e senha com o autocomplete do gerenciador de senhas', () => {
    const page = html();
    expect(page).toMatch(/<input[^>]*id="login-email"[^>]*>/);
    expect(page).toMatch(/<input(?=[^>]*id="login-email")(?=[^>]*type="email")(?=[^>]*autoComplete="username")[^>]*>/i);
    expect(page).toMatch(/<input(?=[^>]*id="login-senha")(?=[^>]*type="password")(?=[^>]*autoComplete="current-password")[^>]*>/i);
  });

  it('o subdomínio só aparece quando o servidor pede', () => {
    expect(html()).not.toContain('login-subdominio');
  });

  it('o botão Entrar envia o formulário', () => {
    expect(html()).toMatch(/<button(?=[^>]*type="submit")[^>]*>[\s\S]*?Entrar[\s\S]*?<\/button>/);
  });

  it('o olho da senha é um botão próprio, que não envia o formulário, e começa escondendo', () => {
    expect(html()).toMatch(
      /<button(?=[^>]*type="button")(?=[^>]*aria-label="Mostrar senha")(?=[^>]*aria-pressed="false")(?=[^>]*aria-controls="login-senha")[^>]*>/,
    );
  });
});

describe('login.css — movimento leve e com função (SPEC-10 §3.1)', () => {
  const css = (() => {
    try {
      return readFileSync(path.join(here, 'login.css'), 'utf-8');
    } catch {
      return ''; // sem o arquivo, cada teste falha pelo próprio motivo
    }
  })();

  it('animação só de transform e opacity: a placa de vídeo compõe, nada é redesenhado', () => {
    const keyframes = [...css.matchAll(/@keyframes[^{]+\{([\s\S]*?)\}\s*\}/g)].map((m) => m[1] ?? '');
    expect(keyframes.length).toBeGreaterThan(0);
    for (const body of keyframes) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1] ?? '');
      expect(props.every((p) => p === 'transform' || p === 'opacity'), props.join(',')).toBe(true);
    }
    // A primeira versão animava o ângulo por @property: redesenho a cada quadro.
    expect(css).not.toContain('@property');
  });

  // Medido em 16/11: com o desfoque, a luz e o halo derrubavam a tela para 36 a 45 quadros por
  // segundo sem placa de vídeo; sem ele, 60 (SPEC-10, CA-10.b).
  it('o vidro não usa backdrop-filter, que a luz obrigaria a refazer a cada quadro', () => {
    expect(css).not.toMatch(/backdrop-filter\s*:/);
  });

  it('com movimento reduzido, a luz e o halo param', () => {
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(reduced).toMatch(/\.login-ring-rotor[^{]*\{[^}]*animation:\s*none/);
    expect(reduced).toMatch(/\.login-halo[^{]*\{[^}]*animation:\s*none/);
  });

  it('nenhuma cor literal: tudo vem dos tokens do login', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/);
  });
});
