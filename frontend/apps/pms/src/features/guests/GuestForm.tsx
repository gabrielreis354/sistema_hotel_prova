import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Field, Input } from '@hotel/ui';
import type { GuestInput } from './guestsApi.js';

const schema = z.object({
  full_name: z.string().trim().min(1, 'Informe o nome do hóspede'),
  cpf: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.union([z.literal(''), z.string().email('E-mail inválido')]).optional(),
});

type Values = z.infer<typeof schema>;

/** Converte strings vazias em undefined — o backend guarda null, não string vazia. */
function toInput(values: Values): GuestInput {
  return {
    full_name: values.full_name,
    cpf: values.cpf || undefined,
    phone: values.phone || undefined,
    email: values.email || undefined,
  };
}

export interface GuestFormProps {
  defaultValues?: Partial<Values>;
  submitLabel: string;
  submitting: boolean;
  serverError?: string | null;
  onSubmit: (input: GuestInput) => void;
  onCancel?: () => void;
}

export function GuestForm({
  defaultValues,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
  onCancel,
}: GuestFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues });

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(toInput(v)))} className="space-y-4" noValidate>
      <Field label="Nome completo" error={errors.full_name?.message}>
        <Input aria-invalid={!!errors.full_name} autoComplete="name" {...register('full_name')} />
      </Field>

      <Field label="CPF" error={errors.cpf?.message}>
        <Input aria-invalid={!!errors.cpf} inputMode="numeric" placeholder="000.000.000-00" {...register('cpf')} />
      </Field>

      <Field label="Telefone" error={errors.phone?.message}>
        <Input aria-invalid={!!errors.phone} inputMode="tel" placeholder="(11) 90000-0000" {...register('phone')} />
      </Field>

      <Field label="E-mail" error={errors.email?.message}>
        <Input aria-invalid={!!errors.email} type="email" autoComplete="email" {...register('email')} />
      </Field>

      {serverError && (
        <p role="alert" className="text-sm text-status-maintenance">
          {serverError}
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Salvando…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
