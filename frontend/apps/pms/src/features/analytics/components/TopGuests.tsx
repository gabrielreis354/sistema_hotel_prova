import { Link } from 'react-router-dom';
import { decimalToCents, formatBRL, formatDateBR } from '@hotel/domain';
import type { TopGuestRow } from '../analyticsApi.js';
import { TABLE, TD, TD_NUM, TH, TH_NUM } from './tableClasses.js';

/** `last_stay` é a data de check-out (DATEONLY). Data fora do formato não derruba a tabela. */
function lastStay(value: string | undefined): string {
  if (!value) return '—';
  try {
    return formatDateBR(value.slice(0, 10));
  } catch {
    return '—';
  }
}

/**
 * Ranking de hóspedes (RT-51). É dado pessoal: a tela diz para que serve, mostra só o nome —
 * o e-mail que o endpoint devolve não aparece (minimização, LGPD) — e o nome leva ao cadastro,
 * onde o contato já tem o controle de acesso dele.
 */
export function TopGuests({ rows }: { rows: TopGuestRow[] }) {
  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        Uso: reconhecer hóspedes frequentes no atendimento e em ações de fidelização. É dado
        pessoal — não exporte nem compartilhe esta lista fora do hotel.
      </p>
      <table className={TABLE}>
        <caption className="sr-only">Hóspedes com maior valor em reservas</caption>
        <thead>
          <tr>
            <th scope="col" className={TH_NUM}>#</th>
            <th scope="col" className={TH}>Hóspede</th>
            <th scope="col" className={TH_NUM}>Reservas</th>
            <th scope="col" className={TH_NUM}>Valor em reservas</th>
            <th scope="col" className={TH_NUM}>Última saída</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g, i) => (
            <tr key={g.guest_id ?? i}>
              <td className={TD_NUM}>{i + 1}</td>
              <td className={TD}>
                {g.guest_id ? (
                  <Link to={`/hospedes/${g.guest_id}`} className="text-brand underline-offset-2 hover:underline">
                    {g.full_name ?? 'Hóspede'}
                  </Link>
                ) : (
                  (g.full_name ?? 'Hóspede')
                )}
              </td>
              <td className={TD_NUM}>{g.total_reservations ?? 0}</td>
              <td className={TD_NUM}>{formatBRL(decimalToCents(g.lifetime_value ?? 0))}</td>
              <td className={TD_NUM}>{lastStay(g.last_stay)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
