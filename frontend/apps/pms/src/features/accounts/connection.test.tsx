import { afterEach, describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { onlineManager } from '@tanstack/react-query';
import { looksOffline, offlineBannerText, useOnline } from './connection.js';
import { OfflineBanner, OfflineNotice } from './components/OfflineBanner.js';
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

  it('com pendências em outras contas, diz quantas, para não confundir com a lista da conta aberta', () => {
    expect(offlineBannerText(3, 2).waiting).toBe('3 lançamentos aguardando a rede (2 em outras contas).');
    expect(offlineBannerText(3, 1).waiting).toBe('3 lançamentos aguardando a rede (1 em outra conta).');
    expect(offlineBannerText(2, 2).waiting).toBe('2 lançamentos aguardando a rede (em outras contas).');
    expect(offlineBannerText(1, 1).waiting).toBe('1 lançamento aguardando a rede (em outra conta).');
    expect(offlineBannerText(2, 0).waiting).toBe('2 lançamentos aguardando a rede.');
  });

  it('o aviso renderizado traz o alcance da contagem', () => {
    expect(renderToString(<OfflineNotice waiting={3} elsewhere={2} />)).toContain('(2 em outras contas).');
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

describe('looksOffline — os dois sinais que ligam a faixa (🟡-3 do red team)', () => {
  const failedOnce = applyOutcome(addTap([], tap('cerveja'), 0, 'c1'), 'c1', { kind: 'retry' }, 6_000);

  it('sinal 1: o onlineManager diz offline, mesmo com a fila vazia', () => {
    expect(looksOffline(false, [])).toBe(true);
  });

  it('sinal 2: com rede no aparelho, a fila já falhou um envio (Wi-Fi sem internet, servidor fora)', () => {
    expect(failedOnce[0]).toMatchObject({ status: 'queued', attempts: 1 });
    expect(looksOffline(true, failedOnce)).toBe(true);
  });

  it('a nova tentativa em andamento não apaga a faixa', () => {
    expect(looksOffline(true, markSending(failedOnce, 'c1', 7_000))).toBe(true);
  });

  it('com rede e sem falha de envio, não liga: toque no prazo, primeira tentativa, recusa do servidor', () => {
    const fresh = addTap([], tap('agua'), 0, 'c2');
    expect(looksOffline(true, fresh)).toBe(false);
    expect(looksOffline(true, markSending(fresh, 'c2', 6_000))).toBe(false);
    const refused = applyOutcome(failedOnce, 'c1', { kind: 'rejected', reason: 'x' }, 8_000);
    expect(looksOffline(true, refused)).toBe(false);
  });

  it('o envio gravou: a entrada sai da fila e a faixa apaga', () => {
    expect(looksOffline(true, applyOutcome(failedOnce, 'c1', { kind: 'saved' }, 8_000))).toBe(false);
  });
});

describe('OfflineBanner — renderização', () => {
  it('com rede, a região viva existe mas fica vazia (para anunciar a queda quando vier)', () => {
    const html = renderToString(<OfflineBanner offline={false} waiting={3} />);
    expect(html).toBe('<div role="status" aria-live="polite"></div>');
  });

  it('abrindo a conta já sem rede, a região nasce vazia e o texto só entra depois (🟡-2 do red team)', () => {
    // renderToString é o primeiro render, antes de qualquer efeito: é o que o leitor de tela
    // registra primeiro. Se o texto viesse junto com a região, não seria anunciado.
    const html = renderToString(<OfflineBanner offline waiting={2} />);
    expect(html).toBe('<div role="status" aria-live="polite"></div>');
  });

  // A skill de design do projeto (Impeccable, reference/craft-floor.md) recusa borda lateral
  // colorida em aviso (repasse de 17/11, PR #184). O sinal passa a ser um ícone antes do texto.
  // Nenhuma classe de borda: pega também border-s-4, border-l-[3px] e border-x-4 (🟢-1 do red team).
  it('o aviso não usa faixa lateral: o sinal é o ícone, decorativo, antes do texto', () => {
    const html = renderToString(<OfflineNotice waiting={2} />);
    expect(html).not.toMatch(/class="[^"]*\bborder/);
    expect(html).toMatch(/^<p[^>]*><svg[^>]*aria-hidden="true"/);
  });

  it('o aviso diz "Sem conexão" e quantos lançamentos aguardam', () => {
    const html = renderToString(<OfflineNotice waiting={2} />);
    expect(html).toContain('Sem conexão:');
    expect(html).toContain('os lançamentos serão enviados quando a rede voltar.');
    expect(html).toContain('2 lançamentos aguardando a rede.');
  });

  it('sem fila, não inventa contagem', () => {
    const html = renderToString(<OfflineNotice waiting={0} />);
    expect(html).toContain('Sem conexão:');
    expect(html).not.toContain('aguardando');
  });
});

describe('useOnline — ligado ao onlineManager do TanStack Query', () => {
  afterEach(() => onlineManager.setOnline(true));

  function Probe() {
    return <p>{useOnline() ? 'com rede' : 'sem rede'}</p>;
  }

  it('segue o onlineManager: offline e de volta', () => {
    onlineManager.setOnline(false);
    expect(renderToString(<Probe />)).toContain('sem rede');
    onlineManager.setOnline(true);
    expect(renderToString(<Probe />)).toContain('com rede');
  });
});
