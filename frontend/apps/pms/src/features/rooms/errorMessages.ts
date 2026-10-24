/**
 * Mensagem de balcão para falha de escrita em quarto ou categoria.
 *
 * O texto do backend é técnico ("category_id obrigatório") e às vezes ausente; o operador
 * precisa saber o que fazer agora. Cada status vira uma instrução: o que aconteceu e qual o
 * próximo passo. Lógica pura — testada em errorMessages.test.ts.
 */
import { ApiError } from '../../lib/http.js';

/** Texto para qualquer erro de mutação: o da API, ou o de rede (fetch rejeitado). */
export function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Sem resposta do servidor. Verifique a conexão e tente de novo.';
}

/** O registro sumiu (404) — a tela mostra "não encontrado", não "erro de conexão". */
export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

export interface WriteContext {
  entity: 'room' | 'category';
  action: 'create' | 'update' | 'delete';
  /** Número do quarto digitado — entra na mensagem de duplicidade. */
  number?: string;
}

const NOUN = { room: 'o quarto', category: 'a categoria' } as const;
const GONE = {
  room: 'Este quarto não existe mais — pode ter sido excluído por outra pessoa.',
  category: 'Esta categoria não existe mais — pode ter sido excluída por outra pessoa.',
} as const;

export function writeErrorMessage(ctx: WriteContext, status: number): string {
  const { entity, action, number } = ctx;

  if (status === 409) {
    // Na exclusão, 409 é "em uso", não duplicidade: o backend recusa apagar categoria com
    // quartos (e quarto em uso) — é ele quem enxerga o quarto que outra pessoa acabou de criar.
    if (action === 'delete') {
      return entity === 'category'
        ? 'Esta categoria ainda tem quartos. Mude a categoria desses quartos e tente excluir de novo.'
        : 'Este quarto está em uso e não pode ser excluído agora. Faça o check-out antes.';
    }
    if (entity === 'room') {
      return number
        ? `Já existe um quarto ${number} neste hotel. Use outro número.`
        : 'Já existe um quarto com esse número neste hotel. Use outro número.';
    }
    return 'Já existe uma categoria com esse nome neste hotel. Use outro nome.';
  }

  if (status === 400 || status === 422) {
    return 'Confira os campos: há informação faltando ou fora do formato.';
  }

  if (status === 403) return 'Só o administrador altera quartos e categorias.';

  if (status === 404) {
    // No cadastro de quarto, o único 404 possível é a categoria escolhida ter sumido.
    if (entity === 'room' && action === 'create') {
      return 'A categoria escolhida não existe mais. Recarregue a página e escolha outra.';
    }
    return GONE[entity];
  }

  // Aqui o servidor RESPONDEU (5xx ou status inesperado): a conexão está boa, então mandar
  // "verificar a conexão" faria o operador insistir à toa. Falha de rede é o messageOf.
  const verb = action === 'delete' ? 'excluir' : 'salvar';
  return `O sistema não conseguiu ${verb} ${NOUN[entity]}. Tente de novo; se continuar, avise o suporte.`;
}
