import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

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
