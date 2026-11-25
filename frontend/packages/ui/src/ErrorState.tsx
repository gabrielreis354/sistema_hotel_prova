import { Button } from './Button.js';
import { noticeFrame } from './Notice.js';
import { cn } from './cn.js';

/**
 * Erro com o caminho de volta. Nasceu na comanda (T-05.5) e subiu para cá com os indicadores
 * (T-05.6), o segundo módulo a precisar dele.
 *
 * Na F2 da SPEC-10 (25/11) virou a faixa do `Notice` de erro, com o "Tentar de novo" dentro: era um
 * cartão branco com texto vermelho e botão cinza grande, repetido até 6 vezes nos Indicadores, e o 404
 * (Notice) tinha outro visual. O texto é gray-900 pelo mesmo motivo do Notice: o vermelho do preset não
 * passa de 4,5:1 sobre o fundo tingido.
 */
export function ErrorState({ message, onRetry, className }: { message: string; onRetry: () => void; className?: string }) {
  return (
    <div
      className={cn(
        noticeFrame('error'),
        'flex flex-col items-start gap-2 p-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <p role="alert" className="text-sm text-gray-900">
        {message}
      </p>
      <Button variant="secondary" size="compact" className="shrink-0" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}
