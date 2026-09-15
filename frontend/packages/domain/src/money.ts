/**
 * Dinheiro em CENTAVOS (inteiro). A verdade de valor no frontend nunca é um float.
 *
 * Motivo: o driver `pg` devolve `DECIMAL` como STRING ("600.00"). Fazer `Number("600.00")`
 * e depois somar reintroduz o erro de ponto flutuante clássico (0.1 + 0.2 !== 0.3) — em conta
 * de hotel isso vira centavo errado no fechamento. Então parseamos a string para inteiro de
 * centavos SEM passar por float, fazemos aritmética em inteiro, e só formatamos na borda da UI.
 */

export type Cents = number;

/** Erro de parsing de valor monetário — distinto de erro genérico para a UI tratar. */
export class MoneyParseError extends Error {
  constructor(value: unknown) {
    super(`Valor monetário inválido: ${JSON.stringify(value)}`);
    this.name = 'MoneyParseError';
  }
}

/**
 * Converte um DECIMAL do backend para centavos inteiros.
 *
 * - string ("600.00", "600", "600.5", "-12.34"): parse exato, sem float.
 * - number (alguns endpoints de analytics agregam no SQL e retornam número): arredonda.
 */
export function decimalToCents(value: string | number): Cents {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new MoneyParseError(value);
    return Math.round(value * 100);
  }

  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;

  if (!/^\d+(\.\d+)?$/.test(unsigned)) throw new MoneyParseError(value);

  const [intPart, fracRaw = ''] = unsigned.split('.');
  // Normaliza a fração para exatamente 2 casas (trunca além disso; centavo é a menor unidade).
  const frac = (fracRaw + '00').slice(0, 2);
  const cents = Number(intPart) * 100 + Number(frac);

  return negative ? -cents : cents;
}

/** Multiplica um valor unitário (centavos) por uma quantidade que pode ser fracionária (2,5 kg). */
export function multiplyCents(unit: Cents, quantity: string | number): Cents {
  const q = typeof quantity === 'string' ? Number(quantity) : quantity;
  if (!Number.isFinite(q)) throw new MoneyParseError(quantity);
  return Math.round(unit * q);
}

/** Soma uma lista de valores em centavos (inteiro — associativo e exato). */
export function sumCents(values: Cents[]): Cents {
  return values.reduce((acc, c) => acc + c, 0);
}

/** Formata centavos como moeda brasileira: 60000 -> "R$ 600,00". Só na borda de exibição. */
export function formatBRL(cents: Cents): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

/** Converte centavos de volta para a string DECIMAL que o backend espera ("600.00"). */
export function centsToDecimalString(cents: Cents): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${reais}.${rem}`;
}
