/** Erro de chamada à API com o status HTTP, para a UI decidir a mensagem. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** O registro sumiu (404): a tela mostra "não encontrado", não "erro de conexão". Subiu de rooms na T-08.6. */
export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}
