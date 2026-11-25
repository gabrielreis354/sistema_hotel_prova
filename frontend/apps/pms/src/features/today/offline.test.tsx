import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient } from '@tanstack/react-query';
import { ANALYTICS_REFETCH_DELAY, invalidateAnalyticsSoon, isStale, loadState } from './todayLogic.js';
import { TodayBlock } from './components/TodayBlock.js';

// Painel Hoje sem rede (SPEC-11, CA-11.h): a consulta sem dado fica pausada (isPending para
// sempre), e a tela mostrava "Carregando…" sem fim. Esconder o spinner também não serve: o bloco
// cairia no vazio ("Nenhuma chegada para hoje"), que é mentira sem rede.
describe('loadState — carregando, sem conexão ou com dado', () => {
  it('sem dado e pausada: sem conexão, não carregando', () => {
    expect(loadState({ isPending: true, isPaused: true })).toEqual({ isLoading: false, isOffline: true });
  });
  it('sem dado e buscando: carregando', () => {
    expect(loadState({ isPending: true, isPaused: false })).toEqual({ isLoading: true, isOffline: false });
  });
  it('com dado, mesmo pausada: mostra o dado (nem carregando, nem sem conexão)', () => {
    expect(loadState({ isPending: false, isPaused: true, data: { ok: 1 } })).toEqual({ isLoading: false, isOffline: false });
  });
  it('erro e depois pausada, sem dado: sem conexão, não o erro com um "Tentar de novo" que pausa (🟢-1)', () => {
    expect(loadState({ isPending: false, isPaused: true })).toEqual({ isLoading: false, isOffline: true });
  });
});

const block = (over: Partial<Parameters<typeof TodayBlock>[0]>) =>
  renderToString(
    <TodayBlock
      id="chegadas"
      title="Chegadas"
      caption="Entrada hoje"
      isLoading={false}
      isOffline={false}
      error={null}
      onRetry={() => {}}
      isEmpty
      empty={{ title: 'Nenhuma chegada para hoje.' }}
      {...over}
    >
      <p>linha</p>
    </TodayBlock>,
  );

describe('TodayBlock sem conexão', () => {
  it('diz que está sem conexão, sem spinner e sem o vazio falso', () => {
    const html = block({ isOffline: true });
    expect(html).toContain('Sem conexão');
    expect(html).not.toContain('Carregando');
    expect(html).not.toContain('Nenhuma chegada para hoje.');
  });
});

// Cartões uma ação atrás (CA-11.g): o analytics projeta o evento alguns instantes depois da
// resposta do core. O refetch imediato traz o número velho; o segundo, depois, traz o novo.
describe('invalidateAnalyticsSoon', () => {
  afterEach(() => vi.useRealTimers());
  it('recarrega os indicadores agora e de novo depois do atraso da projeção', () => {
    vi.useFakeTimers();
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    invalidateAnalyticsSoon(qc);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith({ queryKey: ['analytics'] });
    vi.advanceTimersByTime(ANALYTICS_REFETCH_DELAY);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith({ queryKey: ['analytics'] });
  });
  it('o segundo refetch cabe nos 10 s do critério', () => {
    expect(ANALYTICS_REFETCH_DELAY).toBeGreaterThan(0);
    expect(ANALYTICS_REFETCH_DELAY).toBeLessThanOrEqual(5000);
  });
});

// Wi-Fi sem internet: o onlineManager diz online, o refetch falha e o dado fica (revisão de 22/11).
describe('isStale — dado que pode estar velho', () => {
  it('online, com dado e com erro: avisa', () => {
    expect(isStale({ data: { ok: 1 }, isError: true }, true)).toBe(true);
  });
  it('sem rede: não avisa, a faixa do topo já explica', () => {
    expect(isStale({ data: { ok: 1 }, isError: true }, false)).toBe(false);
  });
  it('sem dado: não avisa, o bloco mostra o erro', () => {
    expect(isStale({ data: undefined, isError: true }, true)).toBe(false);
  });
  it('com dado em dia: não avisa', () => {
    expect(isStale({ data: { ok: 1 }, isError: false }, true)).toBe(false);
  });
});
