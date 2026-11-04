import { useState } from 'react';
import { Button } from '@hotel/ui';
import { scaleToMax } from '../shares.js';
import { TABLE, TD, TD_NUM, TH, TH_NUM } from './tableClasses.js';

export interface Bar {
  key: string;
  /** Rótulo curto do eixo (ex.: "out/26"). */
  label: string;
  value: number;
  /** Valor já formatado para o tooltip e a tabela (ex.: "R$ 1.250,00"). */
  display: string;
  /** Linha extra do tooltip e coluna extra da tabela (ex.: "3,2 noites em média"). */
  detail?: string;
}

interface BarChartProps {
  /** Nome da série, para leitor de tela e cabeçalho da tabela. Série única: sem legenda (dataviz). */
  title: string;
  valueHeader: string;
  detailHeader?: string;
  bars: Bar[];
}

/** Acima disso o rótulo do eixo aparece em um mês sim, outro não — 24 rótulos não cabem lado a lado. */
const DENSE = 12;

/**
 * Colunas em HTML, não SVG: o texto não distorce com a largura e o Tailwind cuida do tema.
 * Marcas da skill dataviz: barra ≤ 24px com ponta arredondada e base reta, 4px de ar entre
 * barras, uma cor só (série única), tooltip no hover e no foco de teclado, e a tabela como
 * alternativa — o valor nunca depende só da altura da barra.
 */
export function BarChart({ title, valueHeader, detailHeader, bars }: BarChartProps) {
  const [asTable, setAsTable] = useState(false);
  const heights = scaleToMax(bars.map((b) => b.value));
  const dense = bars.length > DENSE;

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="ghost" size="compact" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Ver gráfico' : 'Ver tabela'}
        </Button>
      </div>

      {asTable ? (
        <table className={TABLE}>
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className={TH}>Mês</th>
              <th scope="col" className={TH_NUM}>{valueHeader}</th>
              {detailHeader && <th scope="col" className={TH_NUM}>{detailHeader}</th>}
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.key}>
                <td className={TD}>{b.label}</td>
                <td className={TD_NUM}>{b.display}</td>
                {detailHeader && <td className={TD_NUM}>{b.detail ?? '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div>
          <ul aria-label={title} className="flex h-48 items-end gap-1 border-b border-gray-300 pt-10">
            {bars.map((b, i) => (
              <li
                key={b.key}
                tabIndex={0}
                aria-label={`${b.label}: ${b.display}${b.detail ? `, ${b.detail}` : ''}`}
                className="group relative flex h-full flex-1 flex-col items-center justify-end rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white shadow group-hover:block group-focus-visible:block"
                >
                  <span className="block font-medium">{b.label}</span>
                  <span className="block tabular-nums">{b.display}</span>
                  {b.detail && <span className="block text-gray-300">{b.detail}</span>}
                </span>
                {/* Zero não desenha barra (dataviz): a tabela e o tooltip ainda dizem "0". */}
                {heights[i]! > 0 && (
                  <div className="w-full max-w-[24px] rounded-t bg-brand group-hover:opacity-80" style={{ height: `${heights[i]}%` }} />
                )}
              </li>
            ))}
          </ul>
          <div aria-hidden className="flex gap-1 pt-1">
            {bars.map((b, i) => (
              <span key={b.key} className="flex-1 truncate text-center text-xs text-gray-500">
                {dense && i % 2 === 1 ? '' : b.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
