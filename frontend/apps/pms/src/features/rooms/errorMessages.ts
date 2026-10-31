/**
 * Mensagem de balcão para falha de escrita em quarto ou categoria.
 *
 * A regra é: o MOTIVO vem do `code` que o backend devolve no corpo do erro (contrato com
 * fix/tenant-fk-validation), nunca de um palpite pelo status. Um 409 pode ser número
 * repetido, transição de status proibida ou registro em uso — adivinhar pelo status fez a
 * tela dizer "use outro número" para quem nem mexeu no número (🟡-2 da reauditoria).
 * Sem `code` conhecido, a mensagem é genérica e honesta, com o texto do servidor quando há.
 *
 * Lógica pura — testada em errorMessages.test.ts.
 */
import type { components } from '@hotel/api-client';
import { ApiError } from '../../lib/http.js';

/** Os codes do contrato, como o api-client gera de `RoomError` (swagger.js). */
export type RoomErrorCode = components['schemas']['RoomError']['code'];

/**
 * Os mesmos codes em runtime, para validar o que chega no corpo. `satisfies` barra code que
 * o backend não tem; `MissingCode` barra code do backend que ficou de fora daqui — se o
 * swagger ganhar ou renomear um code, o typecheck quebra em vez de a tela cair calada na
 * mensagem genérica.
 */
export const ROOM_ERROR_CODES = [
  'INVALID_INPUT',
  'CATEGORY_NOT_FOUND',
  'CATEGORY_IN_USE',
  'CATEGORY_NAME_TAKEN',
  'ROOM_NUMBER_TAKEN',
  'ROOM_IN_USE',
  'ROOM_STATUS_TRANSITION_NOT_ALLOWED',
] as const satisfies readonly RoomErrorCode[];
type MissingCode = Exclude<RoomErrorCode, (typeof ROOM_ERROR_CODES)[number]>;
const allCodesListed: [MissingCode] extends [never] ? true : MissingCode = true;
void allCodesListed;

function isRoomErrorCode(v: string | undefined): v is RoomErrorCode {
  return ROOM_ERROR_CODES.some((c) => c === v);
}

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
  /** Número do quarto digitado — entra na mensagem de número repetido. */
  number?: string;
}

/** O que interessa do corpo de erro do backend: `{ error?, code?, field? }`. */
export interface ErrorBody {
  /** Só code do contrato; code desconhecido vira undefined (cai na mensagem genérica). */
  code?: RoomErrorCode;
  field?: string;
  detail?: string;
}

function stringProp(body: object, key: string): string | undefined {
  if (!(key in body)) return undefined;
  const v: unknown = Reflect.get(body, key);
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/**
 * Lê `code`, `field` e `error` do corpo sem cast. O api-client tipa o erro como a união das
 * respostas da rota (`RoomError` | `Error`), mas o corpo é o que o servidor mandou de fato
 * (proxy, versão antiga): entra como `unknown` e só sai o que for string — e code do contrato.
 */
export function readErrorBody(body: unknown): ErrorBody {
  if (typeof body !== 'object' || body === null) return {};
  const code = stringProp(body, 'code');
  return {
    code: isRoomErrorCode(code) ? code : undefined,
    field: stringProp(body, 'field'),
    detail: stringProp(body, 'error'),
  };
}

const NOUN = { room: 'o quarto', category: 'a categoria' } as const;

/** Nome do campo como o operador vê na tela. */
const FIELD_LABEL: Record<string, string> = {
  number: 'Número',
  floor: 'Andar',
  category_id: 'Categoria',
  status: 'Status',
  name: 'Nome',
  capacity: 'Capacidade',
  price_per_night: 'Diária',
};

export function writeErrorMessage(ctx: WriteContext, status: number, body?: unknown): string {
  const { entity, action, number } = ctx;
  const { code, field, detail } = readErrorBody(body);

  switch (code) {
    case 'ROOM_NUMBER_TAKEN':
      return number
        ? `Já existe um quarto ${number} neste hotel. Use outro número.`
        : 'Já existe um quarto com esse número neste hotel. Use outro número.';
    case 'CATEGORY_NAME_TAKEN':
      return 'Já existe uma categoria com esse nome neste hotel. Use outro nome.';
    case 'ROOM_STATUS_TRANSITION_NOT_ALLOWED':
      return 'O status do quarto mudou enquanto você editava (check-in ou check-out na recepção). Recarregue a página para ver o status atual antes de alterar.';
    case 'ROOM_IN_USE':
      return 'Este quarto está em uso (hóspede ou reserva) e não pode ser excluído agora.';
    case 'CATEGORY_IN_USE':
      return 'Esta categoria ainda tem quartos. Mude a categoria desses quartos e tente excluir de novo.';
    case 'CATEGORY_NOT_FOUND':
      return entity === 'room'
        ? 'A categoria escolhida não existe mais. Recarregue a página e escolha outra.'
        : 'Esta categoria não existe mais — pode ter sido excluída por outra pessoa.';
    case 'INVALID_INPUT': {
      const label = field ? FIELD_LABEL[field] : undefined;
      return label
        ? `Confira o campo ${label}: valor faltando ou fora do formato.`
        : 'Confira os campos: há informação faltando ou fora do formato.';
    }
    case undefined:
      break;
    default: {
      // Code novo no contrato sem mensagem aqui: erro de compilação, não tela genérica.
      const unhandled: never = code;
      void unhandled;
    }
  }

  // Sem code conhecido: só o que o status diz SEM ambiguidade.
  if (status === 403) return 'Só o administrador altera quartos e categorias.';

  const verb = action === 'delete' ? 'excluir' : 'salvar';
  if (status >= 500) {
    // O servidor respondeu: a conexão está boa, "verifique a conexão" faria insistir à toa.
    return `O sistema não conseguiu ${verb} ${NOUN[entity]}. Tente de novo; se continuar, avise o suporte.`;
  }
  // 4xx sem motivo identificado: diz que foi recusado e repassa o texto do servidor, sem
  // inventar a causa.
  return detail
    ? `O sistema recusou ${verb} ${NOUN[entity]}: ${detail.replace(/[.!\s]+$/, '')}.`
    : `O sistema recusou ${verb} ${NOUN[entity]}. Recarregue a página e confira os dados.`;
}
