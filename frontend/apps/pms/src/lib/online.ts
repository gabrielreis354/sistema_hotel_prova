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
