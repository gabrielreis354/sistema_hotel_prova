import { READ_ONLY_REASON } from '../roomRules.js';

/** id que os botões desabilitados apontam em aria-describedby — o motivo fica legível e anunciado. */
export const READ_ONLY_NOTICE_ID = 'rooms-read-only-reason';

/** Faixa do modo consulta: a recepção vê tudo, e sabe por que não altera. */
export function ReadOnlyNotice() {
  return (
    <p id={READ_ONLY_NOTICE_ID} className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700">
      Modo consulta. {READ_ONLY_REASON}
    </p>
  );
}
