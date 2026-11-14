import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { centsToBRLInput, formatBRL, type Cents } from '@hotel/domain';
import { Button, Field, Input, cn } from '@hotel/ui';
import { ApiError } from '../../../lib/http.js';
import { reservationKeys, useCreatePayment } from '../queries.js';
import { getBill } from '../reservationsApi.js';
import {
  PAYMENT_METHOD_OPTIONS,
  confirmBalanceThenSend,
  paymentBody,
  readPaymentAmount,
  submitStep,
  type PaymentMethod,
} from '../paymentLogic.js';
import { officialBalanceCents } from '../reservationLogic.js';
import { Money } from './primitives.js';

// Alvo de 48px no celular, altura natural no desktop — o mesmo ajuste local de rooms/components/touch.ts.
const TOUCH = 'min-h-touch md:min-h-0';

export type PaymentResult = { kind: 'ok' | 'error'; text: string };

/**
 * Registrar o pagamento na conta da estadia (M5-b, CA-05.6.a). Valor já preenchido com o saldo:
 * no check-out o comum é quitar tudo. Parcial é livre; a maior pede confirmação (D3). Antes de
 * gravar, o saldo é conferido no servidor (P-8): outro balcão pode ter registrado no meio.
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
  const qc = useQueryClient();
  const [amountText, setAmountText] = useState(() => centsToBRLInput(balanceCents));
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overpaid, setOverpaid] = useState<Cents | null>(null);
  const [checking, setChecking] = useState(false);
  const busy = create.isPending || checking;
  // Trava síncrona: o isPending só chega à tela no próximo ciclo, e um segundo toque nesse
  // intervalo chamaria mutate de novo (🟢-4 do qa-redteam). O disabled continua para o visual.
  const sending = useRef(false);
  const fixButton = useRef<HTMLButtonElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  // O formulário remonta quando o saldo muda (key={balance}) e sai quando a conta falha. A
  // conferência de uma instância que já saiu não pode gravar (🟡-1 do qa-redteam de 11/11).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Ao abrir a confirmação do "a maior", o foco vai para "Corrigir o valor": um Enter a mais
  // corrige em vez de gravar (🟡-1 do qa-redteam).
  useEffect(() => {
    if (overpaid !== null) fixButton.current?.focus();
  }, [overpaid]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const step = submitStep({
      reading: readPaymentAmount(amountText, balanceCents),
      method,
      confirming: overpaid !== null,
    });
    if (step.kind === 'wait') return;
    if (step.kind === 'error') return setError(step.error);
    setError(null);
    // A maior: um passo a mais, com o quanto sobra, antes de gravar (D3).
    if (step.kind === 'confirm') return setOverpaid(step.overpaidCents);
    if (method) void send(step.cents, method);
  }

  /**
   * A conta de agora, direto do servidor (P-8). Chamada direta, não `fetchQuery`: uma busca da
   * conta já pausada sem rede seria aproveitada, e a conferência esperaria a rede voltar sem
   * limite (🟡-1 do qa-redteam de 11/11). Sem rede, o fetch falha na hora. O cache recebe a conta
   * nova: se o saldo mudou, a página refaz este formulário com ele.
   */
  async function readFreshBalance(): Promise<Cents> {
    const bill = await getBill(reservationId);
    qc.setQueryData(reservationKeys.bill(reservationId), bill);
    return officialBalanceCents(bill);
  }

  function stop(text: string) {
    sending.current = false;
    setChecking(false);
    setOverpaid(null);
    onResult({ kind: 'error', text });
  }

  async function send(cents: Cents, chosen: PaymentMethod) {
    // A trava vale desde a conferência: um segundo toque enquanto ela corre não grava duas vezes.
    if (sending.current) return;
    sending.current = true;
    setError(null);
    setChecking(true);
    try {
      await confirmBalanceThenSend({
        shownCents: balanceCents,
        readFresh: readFreshBalance,
        isMounted: () => mounted.current,
        stop,
        send: () => {
          setChecking(false);
          mutatePayment(cents, chosen);
        },
      });
    } catch {
      // Nada pode deixar a trava ligada com o botão parecendo ativo (🟢-2 do qa-redteam de 11/11).
      stop('Erro inesperado. Confira a conta antes de tentar de novo.');
    }
  }

  function mutatePayment(cents: Cents, chosen: PaymentMethod) {
    const label = PAYMENT_METHOD_OPTIONS.find((m) => m.id === chosen)?.label ?? chosen;
    create.mutate(paymentBody(reservationId, cents, chosen), {
      onSettled: () => {
        sending.current = false;
      },
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
    if (reading.ok && method) void send(reading.cents, method);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-busy={busy}>
      <Field label="Valor recebido (R$)" error={error ?? undefined}>
        <Input
          ref={amountInput}
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
        // role="alert": o leitor de tela avisa que o registro parou à espera da confirmação (🟢-4).
        <div role="alert" className="space-y-3 rounded-md border border-status-cleaning/60 bg-status-cleaning/10 p-3">
          <p className="text-sm text-gray-900">
            O valor passa do saldo em <Money cents={overpaid} className="font-semibold" />. Esse valor fica como{' '}
            <strong>a devolver</strong> ao hóspede. Registrar assim mesmo?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={confirmOverpaid}>
              {checking ? 'Conferindo saldo…' : busy ? 'Registrando…' : 'Sim, registrar'}
            </Button>
            {/* O foco volta ao valor: quem usa o teclado corrige sem recomeçar do topo (🟡 do qa-explorador). */}
            <Button
              ref={fixButton}
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setOverpaid(null);
                amountInput.current?.focus();
              }}
            >
              Corrigir o valor
            </Button>
          </div>
        </div>
      ) : (
        // Desabilitado enquanto envia: um segundo toque não grava um segundo pagamento (D7).
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {checking ? 'Conferindo saldo…' : busy ? 'Registrando…' : 'Registrar pagamento'}
        </Button>
      )}
    </form>
  );
}
