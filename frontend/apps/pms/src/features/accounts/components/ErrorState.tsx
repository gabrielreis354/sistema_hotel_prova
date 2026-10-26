import { Button, Card } from '@hotel/ui';

/**
 * Erro com o caminho de volta. Local por enquanto: o CATALOGO.md registra o ErrorState como
 * candidato a promoção, e a comanda é o primeiro módulo a criá-lo — o segundo promove.
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
