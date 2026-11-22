/**
 * Data no formato das colunas DATEONLY: string 'YYYY-MM-DD' que existe no calendário.
 *
 * As regras de data comparam texto ('2026-11-21' < '2026-11-22'), e isso só vale nesse formato:
 * '2026-11-3' é MAIOR que '2026-11-22' como texto, passava pela regra da entrada no passado, e o
 * Sequelize gravava 03/11 (🔴-1 do qa-redteam de 22/11). '2026-02-30' é recusada aqui; o banco
 * a rejeitaria com 500.
 */
export function isIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
