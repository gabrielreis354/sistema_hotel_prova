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

// pt-BR: vírgula decimal, ponto opcional de milhar ("1.234,56", "150,5", "150,").
const BR_COMMA = /^(\d{1,3}(\.\d{3})+|\d+),\d{0,2}$/;
// Só ponto de milhar, sem decimal ("1.234", "12.500").
const BR_THOUSANDS = /^\d{1,3}(\.\d{3})+$/;
// Inteiro ou ponto decimal com até duas casas ("150", "150.5", "150.00").
const PLAIN = /^\d+(\.\d{1,2})?$/;

/**
 * Lê o valor que o operador digita no balcão e devolve centavos — sem passar por float.
 *
 * Aceita o jeito brasileiro ("1.234,56", "150,5", "R$ 150,00") e o formato do backend
 * ("150.00"). Ponto seguido de exatamente três dígitos é milhar ("1.500" = mil e quinhentos),
 * porque é assim que se escreve preço no Brasil. Negativo e lixo devolvem `null`: o
 * formulário mostra o erro, em vez de gravar um valor que ninguém digitou.
 */
export function parseBRLInput(text: string): Cents | null {
  const t = text.replace(/^\s*R\$/, '').replace(/\s/g, '');
  if (!t) return null;

  let decimal: string;
  if (BR_COMMA.test(t)) decimal = t.replace(/\./g, '').replace(',', '.');
  else if (BR_THOUSANDS.test(t)) decimal = t.replace(/\./g, '');
  else if (PLAIN.test(t)) decimal = t;
  else return null;

  return decimalToCents(decimal.endsWith('.') ? decimal.slice(0, -1) : decimal);
}

/** Centavos no formato que o operador edita: 15000 -> "150,00" (sem símbolo, sem milhar). */
export function centsToBRLInput(cents: Cents): string {
  return centsToDecimalString(cents).replace('.', ',');
}
