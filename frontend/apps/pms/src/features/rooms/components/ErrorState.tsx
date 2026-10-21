import { Button, Card } from '@hotel/ui';

/**
 * Erro de carregamento com o caminho de volta. Vazio ensina o próximo passo; erro diz como
 * se recuperar (CATALOGO.md). Nasce local — `ErrorState` é candidato a promoção.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p role="alert" className="text-sm text-status-maintenance">
        {message} Verifique a conexão e tente de novo.
      </p>
      <Button variant="secondary" onClick={onRetry}>
        Tentar de novo
      </Button>
    </Card>
  );
}
