/**
 * Estado do olho da senha (T-10.1, SPEC-10 §3). O rótulo diz o que o toque FAZ ("Mostrar senha"),
 * e o `aria-pressed` diz o estado, para o leitor de tela não ouvir duas coisas contraditórias.
 */
export function passwordToggle(shown: boolean): { type: 'text' | 'password'; label: string; pressed: boolean } {
  return shown
    ? { type: 'text', label: 'Ocultar senha', pressed: true }
    : { type: 'password', label: 'Mostrar senha', pressed: false };
}
