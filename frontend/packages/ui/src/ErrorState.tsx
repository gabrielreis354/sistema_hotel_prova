import { Button } from './Button.js';
import { Card } from './feedback.js';

/**
 * Erro com o caminho de volta. Nasceu na comanda (T-05.5) e subiu para cá com os indicadores
 * (T-05.6), o segundo módulo a precisar dele.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="flex flex-col items-start gap-3 p-4">
      <p role="alert" className="text-sm text-status-maintenance">
        {message}
      </p>
      <Button variant="secondary" onClick={onRetry}>
        Tentar de novo
      </Button>
    </Card>
  );
}
