import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Button } from '@hotel/ui';
import { useAuthStore } from '../../stores/auth.js';
import { login, LoginError } from './loginApi.js';
import { homeForRole } from '../../routes/roleHome.js';

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
  subdomain: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);
  const [needsSubdomain, setNeedsSubdomain] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const { token, user } = await login({
        email: values.email,
        password: values.password,
        subdomain: values.subdomain || undefined,
      });
      setSession(token, user);
      navigate(homeForRole(user.role), { replace: true });
    } catch (err) {
      if (err instanceof LoginError) {
        setServerError(err.message);
        if (err.requiresSubdomain) setNeedsSubdomain(true);
      } else {
        setServerError('Não foi possível entrar. Tente novamente.');
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        noValidate
      >
        <div>
          <h1 className="text-xl font-semibold">Entrar</h1>
          <p className="text-sm text-gray-500">PMS — Gestão de Hotel</p>
        </div>

        <Field label="E-mail" error={errors.email?.message}>
          <input
            type="email"
            autoComplete="username"
            aria-invalid={!!errors.email}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            {...register('email')}
          />
        </Field>

        <Field label="Senha" error={errors.password?.message}>
          <input
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            {...register('password')}
          />
        </Field>

        {needsSubdomain && (
          <Field label="Subdomínio do hotel" error={errors.subdomain?.message}>
            <input
              type="text"
              placeholder="ex.: paraiso"
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              {...register('subdomain')}
            />
          </Field>
        )}

        {serverError && (
          <p role="alert" className="text-sm text-status-maintenance">
            {serverError}
          </p>
        )}

        <Button type="submit" block disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
      {error && <span className="block text-sm text-status-maintenance">{error}</span>}
    </label>
  );
}
