import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Field, Input } from '@hotel/ui';
import { TOUCH } from './components/touch.js';
import { decimalToCents, formatBRL, ROOM_STATUSES, type RoomStatus } from '@hotel/domain';
import { roomStatusOptions } from './roomRules.js';
import { StatusPicker } from './components/StatusPicker.js';
import { Select } from './components/Select.js';
import type { RoomCategory, RoomInput } from './roomsApi.js';

const schema = z.object({
  number: z.string().trim().min(1, 'Informe o número do quarto').max(10, 'Até 10 caracteres'),
  floor: z
    .string()
    .trim()
    .refine((v) => v === '' || /^-?\d{1,3}$/.test(v), 'Andar é um número inteiro (0 = térreo)'),
  category_id: z.string().min(1, 'Escolha a categoria'),
  status: z.enum(ROOM_STATUSES),
});

type Values = z.infer<typeof schema>;

function toInput(v: Values): RoomInput {
  return {
    number: v.number,
    floor: v.floor === '' ? null : Number.parseInt(v.floor, 10),
    category_id: v.category_id,
    status: v.status,
  };
}

/** Rótulo da opção: nome, capacidade e diária — o admin escolhe sabendo o preço. */
function categoryLabel(c: RoomCategory): string {
  const price = c.price_per_night ? ` · ${formatBRL(decimalToCents(c.price_per_night))}` : '';
  const cap = c.capacity ? ` · ${c.capacity} ${c.capacity === 1 ? 'pessoa' : 'pessoas'}` : '';
  return `${c.name ?? 'Sem nome'}${cap}${price}`;
}

export interface RoomFormProps {
  categories: RoomCategory[];
  defaultValues?: Partial<Values>;
  /** Status gravado hoje. Ausente = quarto novo. Define o que o StatusPicker libera. */
  currentStatus?: RoomStatus;
  submitLabel: string;
  submitting: boolean;
  serverError?: string | null;
  onSubmit: (input: RoomInput) => void;
  onCancel: () => void;
}

export function RoomForm({
  categories,
  defaultValues,
  currentStatus,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
  onCancel,
}: RoomFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { number: '', floor: '', category_id: '', status: 'AVAILABLE', ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(toInput(v)))} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Número" error={errors.number?.message}>
          <Input className={TOUCH} aria-invalid={!!errors.number} autoComplete="off" autoFocus {...register('number')} />
        </Field>
        <Field label="Andar (opcional)" error={errors.floor?.message}>
          <Input className={TOUCH} aria-invalid={!!errors.floor} inputMode="numeric" placeholder="0 = térreo" {...register('floor')} />
        </Field>
      </div>

      <Field label="Categoria" error={errors.category_id?.message}>
        <Select aria-invalid={!!errors.category_id} {...register('category_id')}>
          <option value="" disabled>
            Escolha a categoria…
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryLabel(c)}
            </option>
          ))}
        </Select>
      </Field>

      <Controller
        control={control}
        name="status"
        render={({ field }) => (
          <StatusPicker options={roomStatusOptions(currentStatus)} value={field.value} onChange={field.onChange} />
        )}
      />

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
