import { describe, expect, it } from 'vitest';
import { passwordToggle } from './passwordToggle.js';

// Olho da senha (T-10.1, SPEC-10 §3): o rótulo diz o que o toque FAZ, e o aria-pressed diz o estado.
describe('passwordToggle', () => {
  it('escondida: campo de senha, botão oferece mostrar', () => {
    expect(passwordToggle(false)).toEqual({ type: 'password', label: 'Mostrar senha', pressed: false });
  });

  it('visível: campo de texto, botão oferece ocultar', () => {
    expect(passwordToggle(true)).toEqual({ type: 'text', label: 'Ocultar senha', pressed: true });
  });
});
