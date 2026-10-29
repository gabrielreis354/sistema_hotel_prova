import { formatDateTimeBR } from '@hotel/domain';
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

/**
 * Grupo de cada tipo na lista, na ordem do salão: mesa e balcão (o turno) → day-use → suítes
 * (abertas no check-in, ficam dias) → internas (perdas da equipe, ficam o mês). P1 do critique de
 * 27/10 e 🟡-5 do qa-redteam: as contas antigas enterravam as mesas.
 */
const SALON_GROUP: Record<AccountType, number> = { TABLE: 0, DIRECT: 0, DAY_USE: 1, ROOM: 2, INTERNAL: 3 };

/**
 * Ordem da lista de contas: por grupo (`SALON_GROUP`) e, dentro dele, a mais antiga primeiro,
 * desempate pelo id: a conta que outro garçom abre entra no fim do grupo e não empurra as outras
 * para baixo do dedo de quem está tocando (P1 da revisão Impeccable). O backend devolve a mais
 * nova primeiro, que mexe a lista a cada abertura.
 */
export function sortAccounts(accounts: Account[]): Account[] {
  const group = (a: Account) => (a.type ? (SALON_GROUP[a.type] ?? 3) : 0);
  return [...accounts].sort(
    (a, b) =>
      group(a) - group(b) ||
      (a.opened_at ?? '').localeCompare(b.opened_at ?? '') ||
      (a.id ?? '').localeCompare(b.id ?? ''),
  );
}

/**
 * Conta aberta com o mesmo nome. Duas "Mesa 3" abertas ficam iguais na lista e o garçom lança na
 * errada; o formulário avisa antes (não bloqueia: pode ser outra mesa 3 de fato, num salão novo).
 */
export function openWithSameLabel(accounts: Account[], label: string): Account | undefined {
  const wanted = normalize(label).replace(/\s+/g, ' ');
  if (!wanted) return undefined;
  return accounts.find((a) => normalize(a.label ?? '').replace(/\s+/g, ' ') === wanted);
}

/** "aberta às 14:05" (hoje) ou "aberta em 25/10 às 20:30", no fuso do hotel. */
export function openedAtLabel(openedAt: string | undefined, now: Date = new Date()): string {
  if (!openedAt) return '';
  const [day, time] = formatDateTimeBR(openedAt).split(' ');
  if (day === formatDateTimeBR(now).split(' ')[0]) return `aberta às ${time}`;
  return `aberta em ${day!.slice(0, 5)} às ${time}`;
}
