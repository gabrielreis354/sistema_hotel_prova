// Um envio por vez nas telas do balcão (SPEC-11, CA-11.a; 🟡1 do qa-redteam de 22/11). Os testes
// de tela renderizam no servidor e não clicam: sem esta checagem, voltar para o `mutate` direto
// em qualquer botão que grava deixava a suíte verde e o duplo clique de volta (201 + 409 + 409).
// O comportamento da trava é testado em src/lib/mutateOnce.test.ts; aqui, que as telas a usam.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Telas com botão que grava e que a banca alcança no roteiro. Nova tela do balcão entra aqui. */
const TELAS = [
  'features/rooms/CategoryFormPages.tsx',
  'features/rooms/RoomFormPages.tsx',
  'features/today/components/rows.tsx',
  'features/reservations/ReservationDetailPage.tsx',
  'features/accounts/components/OpenAccountForm.tsx',
];

/** Chamadas de envio que escapam da trava: `x.mutate(` e `x.mutateAsync(` fora do `promiseOnce`. */
export function envioSemTrava(codigo: string): string[] {
  const semPromiseOnce = codigo.replace(/promiseOnce\(\s*\w+(?:\.current)?,\s*\(\)\s*=>\s*\w+\.mutateAsync\(/g, '');
  return [...semPromiseOnce.matchAll(/\b\w+\.mutate(?:Async)?\(/g)].map((m) => m[0]);
}

describe('telas do balcão gravam pela trava de um envio por vez', () => {
  it('a checagem pega o mutate direto e aceita os dois caminhos da trava', () => {
    expect(envioSemTrava('create.mutate(input, {})')).toEqual(['create.mutate(']);
    expect(envioSemTrava('void release.mutateAsync(x)')).toEqual(['release.mutateAsync(']);
    expect(envioSemTrava('mutateOnce(lock, create.mutate, input, {})')).toEqual([]);
    expect(envioSemTrava('promiseOnce(lock, () => release.mutateAsync(x))')).toEqual([]);
  });

  it.each(TELAS)('%s', (arquivo) => {
    const codigo = readFileSync(path.join(src, arquivo), 'utf8');
    expect(envioSemTrava(codigo)).toEqual([]);
  });
});
