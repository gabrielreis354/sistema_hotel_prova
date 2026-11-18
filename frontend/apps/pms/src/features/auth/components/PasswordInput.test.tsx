import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PasswordInput } from './PasswordInput.js';

// Sem DOM no pms (🟡4 do red team da T-10.1): o estado inicial aberto prova que o campo e o botão
// seguem o passwordToggle. O clique em si é conferido no navegador (relatório da T-10.1).
describe('PasswordInput', () => {
  it('fechado: campo de senha e botão oferecendo mostrar', () => {
    const html = renderToString(<PasswordInput id="s" />);
    expect(html).toMatch(/<input(?=[^>]*id="s")(?=[^>]*type="password")[^>]*>/);
    expect(html).toMatch(/<button(?=[^>]*aria-label="Mostrar senha")(?=[^>]*aria-pressed="false")[^>]*>/);
  });

  it('aberto: campo de texto e botão oferecendo ocultar', () => {
    const html = renderToString(<PasswordInput id="s" defaultShown />);
    expect(html).toMatch(/<input(?=[^>]*id="s")(?=[^>]*type="text")[^>]*>/);
    expect(html).toMatch(/<button(?=[^>]*aria-label="Ocultar senha")(?=[^>]*aria-pressed="true")[^>]*>/);
  });
});
