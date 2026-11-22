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

/** As opções de `mutate` do TanStack Query que a trava repassa. O `onSettled` é dela. */
export type MutateOnceOptions<TData, TError> = {
  onSuccess?: (data: TData) => void;
  onError?: (error: TError) => void;
};

/**
 * `mutate` atrás da trava (SPEC-11, CA-11.a): o segundo clique antes da resposta não envia, e a
 * trava solta no `onSettled`, sucesso ou erro — sem isso, depois de um 500 o botão ficava
 * habilitado e morto. Recebe só o `mutate`, para o teste ligar uma mutação real sem React.
 */
export function mutateOnce<TData, TError, TVariables>(
  lock: { current: boolean },
  mutate: (variables: TVariables, options: MutateOnceOptions<TData, TError> & { onSettled: () => void }) => void,
  variables: TVariables,
  options: MutateOnceOptions<TData, TError> = {},
): boolean {
  return submitOnce(lock, (release) => mutate(variables, { ...options, onSettled: release }));
}
