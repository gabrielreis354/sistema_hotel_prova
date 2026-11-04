/**
 * Deadlock (PostgreSQL 40P01) é erro TRANSITÓRIO: o banco derruba uma das transações do ciclo
 * e ela volta inteira, sem nada gravado. Não é "quarto ocupado" (🟢-D2 da reauditoria delta de
 * 31/10): responder "Quarto indisponível" com os quartos livres mandava a recepção procurar
 * outro quarto à toa.
 *
 * A resposta coerente com o resto do código (RemoveRoomFromReservationController) é repetir a
 * operação uma vez. Se o ciclo era com outra reserva pelos mesmos quartos, a repetição já vê a
 * vencedora na checagem de disponibilidade e responde o 409 verdadeiro. Se o deadlock se
 * repetir, 409 pedindo para tentar de novo — nunca 500 por uma corrida esperada.
 */
export const DEADLOCK_ATTEMPTS = 2;
export const DEADLOCK_RETRY_MESSAGE = 'Outra operação está usando estes quartos agora — tente de novo';

export function isDeadlockError(error) {
    return (error?.parent ?? error?.original)?.code === '40P01';
}

/**
 * Envolve um controller que, no deadlock, desfaz a própria transação e RELANÇA o erro (sem ter
 * respondido). Só serve para controllers sem efeito externo antes da transação — a reserva
 * pública, que já criou a cobrança no PSP, não pode ser repetida e fica de fora.
 */
export function withDeadlockRetry(name, controller) {
    return async function deadlockRetryingController(request, response) {
        for (let attempt = 1; ; attempt += 1) {
            try {
                return await controller(request, response);
            } catch (error) {
                if (!isDeadlockError(error) || response.headersSent) {
                    console.error(`${name}:`, error);
                    if (!response.headersSent) response.status(500).json({ error: 'Erro interno do servidor' });
                    return undefined;
                }
                console.warn(`${name}: deadlock (40P01) na tentativa ${attempt} de ${DEADLOCK_ATTEMPTS}`);
                if (attempt >= DEADLOCK_ATTEMPTS) return response.status(409).json({ error: DEADLOCK_RETRY_MESSAGE });
            }
        }
    };
}
