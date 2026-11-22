import { useEffect, useState, type ReactNode } from 'react';

/**
 * Região viva da faixa de "sem conexão", comum à comanda e ao painel Hoje (SPEC-11, T-11.4).
 *
 * Leitor de tela só anuncia o que MUDA dentro de uma região viva que já existia. Por isso a
 * região `status` nasce sempre vazia e o texto só entra depois da montagem (efeito). Assim a
 * faixa é anunciada também quando a tela abre já sem rede (🟡-2 do red team de 15/11), e não
 * só quando a rede cai com a tela aberta.
 *
 * Por que não mover o foco: tiraria a pessoa do lugar em que está na tela, e o aviso não pede
 * ação. Ele é informativo, e a região viva basta. O custo é a faixa aparecer um quadro depois.
 */
export function ConnectionBanner({ offline, children }: { offline: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div role="status" aria-live="polite">
      {mounted && offline && children}
    </div>
  );
}
