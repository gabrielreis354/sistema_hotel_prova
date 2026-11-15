import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input } from '@hotel/ui';
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
          <p className="text-lg font-semibold tracking-tight text-gray-900">Gesway</p>
          <h1 className="text-title">Entrar</h1>
          <p className="text-sm text-gray-500">Gestão hoteleira</p>
        </div>

        {/* Campos de @hotel/ui (T-08.2): alvo de toque, foco visível e erro por aria-invalid já vêm prontos. */}
        <Field label="E-mail" htmlFor="login-email" error={errors.email?.message}>
          <Input
            id="login-email"
            type="email"
            autoComplete="username"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
        </Field>

        <Field label="Senha" htmlFor="login-senha" error={errors.password?.message}>
          <Input
            id="login-senha"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </Field>

        {needsSubdomain && (
          <Field label="Subdomínio do hotel" htmlFor="login-subdominio" error={errors.subdomain?.message}>
            <Input id="login-subdominio" type="text" placeholder="ex.: paraiso" {...register('subdomain')} />
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

