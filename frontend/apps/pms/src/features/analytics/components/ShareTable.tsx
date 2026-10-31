import { formatBRL, decimalToCents, sumCents } from '@hotel/domain';
import type { ShareRow } from '../shares.js';
import { TABLE, TD, TD_NUM, TF_NUM, TH, TH_NUM } from './tableClasses.js';

interface ShareTableProps {
  caption: string;
  nameHeader: string;
  countHeader: string;
  rows: ShareRow[];
  /** Valores em reais das linhas, para o total do rodapé (somado em centavos). */
  values: number[];
}

/**
 * Participação em tabela com barra fina (8px, ponta arredondada, uma cor): o número exato fica
 * na coluna, a barra só ajuda a comparar de relance (RT-50).
 */
export function ShareTable({ caption, nameHeader, countHeader, rows, values }: ShareTableProps) {
  const total = formatBRL(sumCents(values.map((v) => decimalToCents(v))));
  const count = rows.reduce((acc, r) => acc + r.count, 0);

  return (
    <table className={TABLE}>
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className={TH}>{nameHeader}</th>
          <th scope="col" className={TH_NUM}>{countHeader}</th>
          <th scope="col" className={TH_NUM}>Valor</th>
          <th scope="col" className={TH}>Participação</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className={TD}>{r.label}</td>
            <td className={TD_NUM}>{r.count}</td>
            <td className={TD_NUM}>{r.amount}</td>
            <td className={TD}>
              <div className="flex items-center gap-2">
                <div aria-hidden className="h-2 w-24 rounded-full bg-gray-100">
                  <div className="h-2 rounded-full bg-brand" style={{ width: `${r.share * 100}%` }} />
                </div>
                <span className="w-12 text-right tabular-nums">{r.percent}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" className="px-2 py-2 text-left font-medium">Total</th>
          <td className={TF_NUM}>{count}</td>
          <td className={TF_NUM}>{total}</td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}
