import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Field, Input } from '@hotel/ui';
import { centsToDecimalString, parseBRLInput } from '@hotel/domain';
import type { CategoryInput } from './roomsApi.js';

const schema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da categoria').max(60, 'Até 60 caracteres'),
  capacity: z
    .string()
    .trim()
    .refine((v) => /^\d{1,2}$/.test(v) && Number.parseInt(v, 10) >= 1, 'Capacidade é um número de 1 a 99 pessoas'),
  // A diária é digitada como texto ("150,00") e convertida por @hotel/domain — nunca Number().
  price: z.string().refine((v) => {
    const cents = parseBRLInput(v);
    return cents !== null && cents > 0;
  }, 'Informe a diária em reais, por exemplo 150,00'),
});

type Values = z.infer<typeof schema>;

function toInput(v: Values): CategoryInput {
  // O refine acima garante que o parse não é null aqui.
  const cents = parseBRLInput(v.price) ?? 0;
  return {
    name: v.name,
    capacity: Number.parseInt(v.capacity, 10),
    price_per_night: centsToDecimalString(cents),
  };
}

export interface CategoryFormProps {
  defaultValues?: Partial<Values>;
  submitLabel: string;
  submitting: boolean;
  serverError?: string | null;
  onSubmit: (input: CategoryInput) => void;
  onCancel: () => void;
}

export function CategoryForm({
  defaultValues,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
  onCancel,
}: CategoryFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', capacity: '2', price: '', ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(toInput(v)))} className="space-y-4" noValidate>
      <Field label="Nome" error={errors.name?.message}>
        <Input aria-invalid={!!errors.name} autoComplete="off" autoFocus placeholder="Standard, Luxo, Suíte…" {...register('name')} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Capacidade (pessoas)" error={errors.capacity?.message}>
          <Input aria-invalid={!!errors.capacity} inputMode="numeric" {...register('capacity')} />
        </Field>
        <Field label="Diária (R$)" error={errors.price?.message}>
          <Input
            aria-invalid={!!errors.price}
            inputMode="decimal"
            placeholder="150,00"
            className="text-right tabular-nums"
            {...register('price')}
          />
        </Field>
      </div>

      {serverError && (
        <p role="alert" className="text-sm text-status-maintenance">
          {serverError}
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Salvando…' : submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
