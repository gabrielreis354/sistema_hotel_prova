import { useState, type FormEvent } from 'react';
import { centsToBRLInput, formatBRL, type Cents } from '@hotel/domain';
import { Button, Field, Input, cn } from '@hotel/ui';
import { ApiError } from '../../../lib/http.js';
import { useCreatePayment } from '../queries.js';
import {
  PAYMENT_METHOD_OPTIONS,
  paymentBody,
  readPaymentAmount,
  type PaymentMethod,
} from '../paymentLogic.js';
import { Money } from './primitives.js';

// Alvo de 48px no celular, altura natural no desktop — o mesmo ajuste local de rooms/components/touch.ts.
const TOUCH = 'min-h-touch md:min-h-0';

export type PaymentResult = { kind: 'ok' | 'error'; text: string };

/**
 * Registrar o pagamento na conta da estadia (M5-b, CA-05.6.a). Valor já preenchido com o saldo:
 * no check-out o comum é quitar tudo. Parcial é livre; a maior pede confirmação (D3).
 *
 * O resultado sobe para a página: quando o saldo zera, este formulário some, e o aviso de
 * "registrado" precisa continuar na tela.
 */
export function PaymentForm({
  reservationId,
  balanceCents,
  onResult,
}: {
  reservationId: string;
  balanceCents: Cents;
  onResult: (result: PaymentResult) => void;
}) {
  const create = useCreatePayment();
  const [amountText, setAmountText] = useState(() => centsToBRLInput(balanceCents));
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overpaid, setOverpaid] = useState<Cents | null>(null);
  const busy = create.isPending;

  function submit(event: FormEvent) {
    event.preventDefault();
    const reading = readPaymentAmount(amountText, balanceCents);
    if (!reading.ok) return setError(reading.error);
    if (!method) return setError('Escolha como o hóspede pagou.');
    // A maior: um passo a mais, com o quanto sobra, antes de gravar (D3).
    if (reading.overpaidCents > 0 && overpaid === null) {
      setError(null);
      return setOverpaid(reading.overpaidCents);
    }
    send(reading.cents, method);
  }

  function send(cents: Cents, chosen: PaymentMethod) {
    setError(null);
    const label = PAYMENT_METHOD_OPTIONS.find((m) => m.id === chosen)?.label ?? chosen;
    create.mutate(paymentBody(reservationId, cents, chosen), {
      onSuccess: () => {
        onResult({ kind: 'ok', text: `Pagamento de ${formatBRL(cents)} em ${label} registrado.` });
        setOverpaid(null);
        setMethod(null);
      },
      onError: (err) => {
        setOverpaid(null);
        onResult({
          kind: 'error',
          text: err instanceof ApiError ? err.message : 'Erro inesperado. Confira a conta antes de tentar de novo.',
        });
      },
    });
  }

  function confirmOverpaid() {
    const reading = readPaymentAmount(amountText, balanceCents);
    if (reading.ok && method) send(reading.cents, method);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-busy={busy}>
      <Field label="Valor recebido (R$)" error={error ?? undefined}>
        <Input
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={!!error}
          className={cn(TOUCH, 'block text-right text-lg tabular-nums sm:max-w-[12rem]')}
          value={amountText}
          disabled={busy}
          onChange={(e) => {
            setAmountText(e.target.value);
            setOverpaid(null);
            setError(null);
          }}
        />
      </Field>

      {/* Método como radio de verdade: teclado, leitor de tela e um só escolhido. */}
      <fieldset className="space-y-2" disabled={busy}>
        <legend className="text-sm font-medium text-gray-700">Como o hóspede pagou</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PAYMENT_METHOD_OPTIONS.map((m) => (
            <label
              key={m.id}
              className={cn(
                'flex min-h-touch cursor-pointer items-center justify-center rounded-md border px-3 text-center text-sm font-medium',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-offset-2',
                method === m.id ? 'border-brand bg-brand/10 text-brand' : 'border-gray-300 text-gray-800 hover:bg-gray-50',
              )}
            >
              <input
                type="radio"
                name="payment-method"
                value={m.id}
                className="sr-only"
                checked={method === m.id}
                onChange={() => {
                  setMethod(m.id);
                  setError(null);
                }}
              />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>

      {overpaid !== null ? (
        <div className="space-y-3 rounded-md border border-status-cleaning/60 bg-status-cleaning/10 p-3">
          <p className="text-sm text-gray-900">
            O valor passa do saldo em <Money cents={overpaid} className="font-semibold" />. Esse valor fica como{' '}
            <strong>a devolver</strong> ao hóspede. Registrar assim mesmo?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={confirmOverpaid}>
              {busy ? 'Registrando…' : 'Sim, registrar'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setOverpaid(null)}>
              Corrigir o valor
            </Button>
          </div>
        </div>
      ) : (
        // Desabilitado enquanto envia: um segundo toque não grava um segundo pagamento (D7).
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy ? 'Registrando…' : 'Registrar pagamento'}
        </Button>
      )}
    </form>
  );
}
