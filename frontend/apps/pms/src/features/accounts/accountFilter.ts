import type { Account, Product } from './accountsApi.js';

type AccountType = NonNullable<Account['type']>;
type Category = NonNullable<Product['category']>;

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  ROOM: 'Suíte',
  TABLE: 'Mesa',
  DIRECT: 'Balcão',
  DAY_USE: 'Day-use',
  INTERNAL: 'Interna',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  DRINK: 'Bebidas',
  FOOD: 'Comidas',
  SERVICE: 'Serviços',
  OTHER: 'Outros',
};

const normalize = (text: string) =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/**
 * Busca da lista de contas por rótulo ("Mesa 5", "Suíte 201") e pelo tipo. O número do quarto
 * está no rótulo da conta da suíte, que o sistema monta no check-in (D-58). Sem acento e sem
 * caixa: o garçom digita "suite 2" com uma mão.
 */
export function filterAccounts(accounts: Account[], term: string): Account[] {
  const words = normalize(term).split(/\s+/).filter(Boolean);
  if (words.length === 0) return accounts;
  return accounts.filter((account) => {
    const haystack = normalize(`${account.label ?? ''} ${account.type ? ACCOUNT_TYPE_LABEL[account.type] : ''}`);
    return words.every((word) => haystack.includes(word));
  });
}

/** Categorias que existem no cardápio, na ordem em que aparecem (o backend ordena). */
export function menuCategories(products: Product[]): Category[] {
  const seen: Category[] = [];
  for (const product of products) {
    if (product.category && !seen.includes(product.category)) seen.push(product.category);
  }
  return seen;
}
