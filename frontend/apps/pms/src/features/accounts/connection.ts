import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { awaitsServer, type QueueEntry } from './queueCore.js';

/**
 * Conexão do aparelho, pelo mesmo detector que pausa as consultas do TanStack Query
 * (`onlineManager`). Antes a comanda só dizia "sem conexão" depois que uma consulta refeita
 * falhava (achado 7 da revisão de 26/10): o garçom lançava sem saber que estava sem rede.
 *
 * O snapshot do servidor também lê o `onlineManager`, para o teste com `renderToString` poder
 * simular a queda com `onlineManager.setOnline(false)`.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => onlineManager.isOnline(),
  );
}

/**
 * A comanda está sem conexão? Dois sinais:
 * - o `onlineManager` diz offline (interface de rede caiu: modo avião, Wi-Fi desligado);
 * - a própria fila já falhou um envio por rede (`attempts > 0`, só o `retry` do `classifySend`
 *   aumenta). É o caso mais comum no salão, que o navegador não detecta: Wi-Fi conectado sem
 *   saída para a internet, ou o servidor fora do ar (🟡-3 do red team de 15/11).
 *
 * Conta também o lançamento `sending` que já tinha falhado antes, para a faixa não piscar a cada
 * nova tentativa. Recusado e excluído não contam: o servidor respondeu. A faixa some quando o
 * envio grava, porque a entrada sai da fila.
 */
export function looksOffline(online: boolean, mine: QueueEntry[]): boolean {
  return !online || mine.some((e) => awaitsServer(e) && e.attempts > 0);
}

/**
 * Texto da faixa de "sem conexão". `waiting` é quantos lançamentos deste usuário ainda não
 * chegaram ao servidor; com zero, a faixa só diz o que acontece com o próximo toque.
 */
export function offlineBannerText(waiting: number): { lead: string; message: string; waiting: string | null } {
  return {
    lead: 'Sem conexão:',
    message: 'os lançamentos serão enviados quando a rede voltar.',
    waiting:
      waiting <= 0 ? null : waiting === 1 ? '1 lançamento aguardando a rede.' : `${waiting} lançamentos aguardando a rede.`,
  };
}
