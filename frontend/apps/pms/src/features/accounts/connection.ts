import { awaitsServer, type QueueEntry } from './queueCore.js';

// O hook saiu para src/lib (SPEC-11, T-11.4): o painel Hoje também avisa quando está sem rede.
export { useOnline } from '../../lib/online.js';

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
 * Por que a faixa aparece: o aparelho está sem rede (`network`) ou a rede está de pé e o servidor
 * não respondeu (`server`: 502, Wi-Fi sem saída). Com 502 a faixa dizia "Sem conexão", e o garçom
 * ia conferir o Wi-Fi, que estava bom (QA de 24/11, 🟢-7).
 */
export type OfflineReason = 'network' | 'server';

export function offlineReason(online: boolean): OfflineReason {
  return online ? 'server' : 'network';
}

const LEAD: Record<OfflineReason, { lead: string; message: string }> = {
  network: { lead: 'Sem conexão:', message: 'os lançamentos serão enviados quando a rede voltar.' },
  server: { lead: 'O sistema não respondeu:', message: 'os lançamentos ficam na fila e são enviados sozinhos.' },
};

/**
 * Texto da faixa de "sem conexão". `waiting` é quantos lançamentos deste usuário ainda não
 * chegaram ao servidor, em qualquer conta; com zero, a faixa só diz o que acontece com o próximo
 * toque. `elsewhere` é quantos deles são de outras contas: sem dizer isso, a faixa dizia "3" e a
 * lista da conta aberta mostrava 1 na fila (🟢 do red team de 15/11).
 */
export function offlineBannerText(
  waiting: number,
  elsewhere = 0,
  reason: OfflineReason = 'network',
): { lead: string; message: string; waiting: string | null } {
  const { lead, message } = LEAD[reason];
  if (waiting <= 0) return { lead, message, waiting: null };
  const awaiting = reason === 'server' ? 'aguardando o envio' : 'aguardando a rede';
  const count = waiting === 1 ? `1 lançamento ${awaiting}` : `${waiting} lançamentos ${awaiting}`;
  const where =
    elsewhere <= 0
      ? ''
      : elsewhere >= waiting
        ? waiting === 1 ? ' (em outra conta)' : ' (em outras contas)'
        : elsewhere === 1 ? ' (1 em outra conta)' : ` (${elsewhere} em outras contas)`;
  return { lead, message, waiting: `${count}${where}.` };
}
