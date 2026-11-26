import { useMemo, useState } from 'react';
import { Button, ErrorState, SegmentedControl, Spinner } from '@hotel/ui';
import { decimalToCents, formatBRL } from '@hotel/domain';
import type { Product } from '../accountsApi.js';
import { CATEGORY_LABEL, menuCategories } from '../accountFilter.js';
import { useMenu } from '../queries.js';

/**
 * Cardápio em grade, categorias num controle segmentado (filtro, não ação: F6 da SPEC-10), preço
 * visível (CA-05.5.b). Um toque lança
 * quantidade 1 (CA-05.5.c) — sem diálogo, sem tela de quantidade.
 *
 * Toque no produto: só o "afundar" de 150 ms no :active, que confirma o toque (feedback).
 * Nada de animação de entrada nos itens — o garçom lança dezenas de vezes por turno, e
 * movimento repetido assim só atrasa. Com movimento reduzido, nem o afundar.
 *
 * `disabledReason` desabilita a grade inteira e diz por quê (conta fechada): ação
 * indisponível fica visível com o motivo, não some (RNF-026).
 */
export function MenuGrid({
  onTap,
  disabledReason,
}: {
  onTap: (product: Product) => void;
  disabledReason?: string;
}) {
  const { data, isLoading, isError, refetch } = useMenu();
  const [category, setCategory] = useState<NonNullable<Product['category']> | 'ALL'>('ALL');
  const categories = useMemo(() => menuCategories(data ?? []), [data]);
  const categoryOptions = useMemo(
    () => [{ value: 'ALL' as const, label: 'Tudo' }, ...categories.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))],
    [categories],
  );
  const shown = useMemo(
    () => (data ?? []).filter((p) => category === 'ALL' || p.category === category),
    [data, category],
  );

  // Com o cardápio já carregado, uma atualização que falha não o tira da tela (🟡-3).
  if (!data) {
    if (isLoading) return <Spinner label="Carregando cardápio…" />;
    if (isError) return <ErrorState message="Não foi possível carregar o cardápio." onRetry={() => refetch()} />;
    return <p className="text-sm text-gray-600">Sem conexão: o cardápio aparece quando a rede voltar.</p>;
  }
  if (data.length === 0) {
    return <p className="text-sm text-gray-500">O cardápio está vazio. A gerência cadastra os produtos.</p>;
  }

  return (
    <section aria-label="Cardápio" className="space-y-2">
      {categories.length > 1 && (
        // No máximo cinco opções (Tudo e as quatro categorias): no celular elas dividem a largura,
        // sem a rolagem lateral dos antigos chips, que escondia "Serviços" na borda (390 px).
        <SegmentedControl label="Categorias" value={category} options={categoryOptions} onChange={setCategory} />
      )}

      {disabledReason && <p id="menu-disabled-reason" className="text-sm text-gray-600">{disabledReason}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {shown.map((product) => (
          <Button
            key={product.id}
            variant="secondary"
            disabled={!!disabledReason}
            aria-describedby={disabledReason ? 'menu-disabled-reason' : undefined}
            onClick={() => onTap(product)}
            className="h-auto min-h-[64px] flex-col items-start justify-between gap-1 py-2 text-left transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100"
          >
            <span className="line-clamp-2 text-sm font-medium leading-tight">{product.name}</span>
            <span className="tabular-nums text-sm text-gray-600">{formatBRL(decimalToCents(product.price ?? '0'))}</span>
          </Button>
        ))}
      </div>
    </section>
  );
}
