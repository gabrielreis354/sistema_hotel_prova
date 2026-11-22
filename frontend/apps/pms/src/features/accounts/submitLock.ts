/**
 * Trava síncrona de um envio por vez. O `disabled={isPending}` sozinho não segura dois toques no
 * mesmo quadro: o TanStack Query entrega o isPending à tela depois de um setTimeout(0), e o
 * segundo toque chega com o botão ainda habilitado. A trava é um ref, que muda na hora.
 *
 * `send` recebe `release` e o chama quando a resposta chegar (sucesso ou erro). Se `send` lança,
 * a trava solta antes de repassar o erro. Devolve se enviou.
 */
export function submitOnce(lock: { current: boolean }, send: (release: () => void) => void): boolean {
  if (lock.current) return false;
  lock.current = true;
  const release = () => {
    lock.current = false;
  };
  try {
    send(release);
  } catch (error) {
    release();
    throw error;
  }
  return true;
}
