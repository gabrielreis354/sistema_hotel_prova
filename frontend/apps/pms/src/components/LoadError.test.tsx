import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../lib/http.js';
import { LoadError } from './LoadError.js';

// Um molde só para "o registro não carregou" (T-08.6; 🟢-2 do qa-redteam de 16/11). Eram três:
// reserva, hóspede e quartos. 404 não tem "tentar de novo", o caminho é voltar; falha de servidor
// ou de rede não é "não encontrado", senão a recepção acha que o cadastro sumiu.

const MSG = { notFound: 'Quarto não encontrado — ele pode ter sido excluído.', failed: 'Não foi possível carregar o quarto.' };

function render(error: unknown, back?: { to: string; label: string }) {
  return renderToString(
    <MemoryRouter>
      <LoadError error={error} notFound={MSG.notFound} failed={MSG.failed} onRetry={() => {}} back={back} />
    </MemoryRouter>,
  );
}

describe('LoadError', () => {
  it('404: aviso em alert, sem "Tentar de novo"', () => {
    const html = render(new ApiError('x', 404));
    expect(html).toContain(MSG.notFound);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('Tentar de novo');
    expect(html).not.toContain(MSG.failed);
  });

  it.each([
    ['500', new ApiError('x', 500)],
    ['403', new ApiError('x', 403)],
    ['rede', new TypeError('Failed to fetch')],
  ])('%s: "Tentar de novo", nunca "não encontrado"', (_, error) => {
    const html = render(error);
    expect(html).toContain(MSG.failed);
    expect(html).toContain('Tentar de novo');
    expect(html).not.toContain(MSG.notFound);
  });

  it('com volta: link de 48 px até o xl; sem volta (a página já tem uma): nenhum link', () => {
    const com = render(new ApiError('x', 404), { to: '/quartos', label: '← Voltar para quartos' });
    expect(com).toMatch(/<a [^>]*href="\/quartos"/);
    expect(com).toContain('min-h-touch');
    expect(render(new ApiError('x', 404))).not.toContain('<a ');
  });
});

describe('um molde só', () => {
  const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? arquivos(p) : /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n) ? [p] : [];
    });
  }

  it('nenhuma tela monta o próprio "não encontrado" (NotFound local, GuestLoadError, ramo notFound à mão)', () => {
    const achados: string[] = [];
    for (const a of arquivos(path.join(src, 'features'))) {
      const codigo = readFileSync(a, 'utf-8');
      if (/function (NotFound|GuestLoadError)\b/.test(codigo)) achados.push(`${path.relative(src, a)}: define`);
      if (/<NotFound\b|<GuestLoadError\b/.test(codigo)) achados.push(`${path.relative(src, a)}: usa`);
      if (/const notFound = .*status === 404/.test(codigo)) achados.push(`${path.relative(src, a)}: ramo à mão`);
    }
    expect(achados).toEqual([]);
  });
});
