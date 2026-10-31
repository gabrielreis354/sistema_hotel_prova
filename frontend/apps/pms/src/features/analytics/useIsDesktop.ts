import { useSyncExternalStore } from 'react';

/** Mesmo corte do `md:` do Tailwind (768px): é ele que mostra ou esconde os blocos do desktop. */
const DESKTOP_QUERY = '(min-width: 768px)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** Sem `matchMedia` (teste, SSR) responde celular: o bloco do desktop não consulta à toa. */
function getSnapshot(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(DESKTOP_QUERY).matches;
}

/**
 * O celular só mostra os 4 cartões do dia. Esconder os outros blocos com CSS não basta: as
 * consultas saíam igual, inclusive o ranking de hóspedes (dado pessoal) — o hook liga o
 * `enabled` delas só no desktop.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
