import { afterEach, describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { onlineManager } from '@tanstack/react-query';
import { offlineBannerText, useOnline } from './connection.js';
import { OfflineBanner } from './components/OfflineBanner.js';
import { addTap, applyOutcome, awaitsServer, markSending } from './queueCore.js';

const tap = (productId: string) => ({
  ownerId: 'u1', accountId: 'a1', productId, description: productId, unitPrice: '10.00',
});

describe('offlineBannerText — faixa de "sem conexão" (achado 7)', () => {
  it('sem nada na fila, só diz o que acontece com o próximo toque', () => {
    const text = offlineBannerText(0);
    expect(`${text.lead} ${text.message}`).toBe('Sem conexão: os lançamentos serão enviados quando a rede voltar.');
    expect(text.waiting).toBeNull();
  });

  it('com itens na fila, diz quantos, no singular e no plural', () => {
    expect(offlineBannerText(1).waiting).toBe('1 lançamento aguardando a rede.');
    expect(offlineBannerText(2).waiting).toBe('2 lançamentos aguardando a rede.');
  });
});

describe('awaitsServer — o que a faixa conta como aguardando', () => {
  it('conta prazo de desfazer, fila e envio; não conta recusado', () => {
    let entries = addTap([], tap('cerveja'), 0, 'c1');
    entries = addTap(entries, tap('agua'), 0, 'c2');
    entries = addTap(entries, tap('suco'), 0, 'c3');
    entries = markSending(entries, 'c2', 6_000);
    entries = applyOutcome(entries, 'c3', { kind: 'rejected', reason: 'x' }, 6_000);
    expect(entries.filter(awaitsServer).map((e) => e.clientItemId)).toEqual(['c1', 'c2']);
  });
});

describe('OfflineBanner — renderização', () => {
  it('com rede, a região viva existe mas fica vazia (para anunciar a queda quando vier)', () => {
    const html = renderToString(<OfflineBanner online waiting={3} />);
    expect(html).toBe('<div role="status" aria-live="polite"></div>');
  });

  it('sem rede, mostra o aviso e quantos lançamentos aguardam', () => {
    const html = renderToString(<OfflineBanner online={false} waiting={2} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Sem conexão:');
    expect(html).toContain('os lançamentos serão enviados quando a rede voltar.');
    expect(html).toContain('2 lançamentos aguardando a rede.');
  });

  it('sem rede e sem fila, não inventa contagem', () => {
    const html = renderToString(<OfflineBanner online={false} waiting={0} />);
    expect(html).toContain('Sem conexão:');
    expect(html).not.toContain('aguardando');
  });
});

describe('useOnline — ligado ao onlineManager do TanStack Query', () => {
  afterEach(() => onlineManager.setOnline(true));

  function Probe() {
    return <OfflineBanner online={useOnline()} waiting={1} />;
  }

  it('a faixa aparece quando o onlineManager diz offline e some quando a rede volta', () => {
    onlineManager.setOnline(false);
    expect(renderToString(<Probe />)).toContain('1 lançamento aguardando a rede.');
    onlineManager.setOnline(true);
    expect(renderToString(<Probe />)).not.toContain('Sem conexão');
  });
});
