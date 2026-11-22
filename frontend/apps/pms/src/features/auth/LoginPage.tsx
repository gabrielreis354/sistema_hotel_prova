import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Lock, LogIn, Mail } from 'lucide-react';
import { Button, Field, Input, Notice } from '@hotel/ui';
import { useAuthStore } from '../../stores/auth.js';
import { login } from './loginApi.js';
import { loginFailure } from './loginFailure.js';
import { homeForRole } from '../../routes/roleHome.js';
import { GeswayLogo } from '../../components/GeswayLogo.js';
import { PasswordInput } from './components/PasswordInput.js';
import './login.css';

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
  subdomain: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

/** Ícone do rótulo: traço fino e decorativo, o texto ao lado é o rótulo (GUIA, regra 5). */
const LABEL_ICON = 'size-[18px] shrink-0';

/**
 * Login (T-10.1, SPEC-10 §3): identidade nova com vidro claro e a luz que percorre a borda. A
 * lógica é a de antes: validação do zod, erro do servidor, subdomínio quando o mesmo e-mail existe
 * em dois hotéis e o destino por papel. O visual mora em login.css, só com tokens.
 */
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
      const failure = loginFailure(err);
      setServerError(failure.message);
      if (failure.requiresSubdomain) setNeedsSubdomain(true);
    }
  }

  return (
    <main className="login-page">
      <div className="login-backdrop" aria-hidden="true" />
      <Swoosh position="top" />
      <Swoosh position="bottom" />

      <div className="login-card-wrap">
        <div className="login-halo" aria-hidden="true" />
        <div className="login-ring" aria-hidden="true">
          <div className="login-ring-rotor" />
        </div>

        <div className="login-card">
          <div className="mb-7 flex flex-col items-center gap-1.5 text-center">
            <GeswayLogo className="login-logo" />
            <p className="login-wordmark">
              GES<span className="login-wordmark-accent">WAY</span>
            </p>
            <p className="login-tagline">GESTÃO HOTELEIRA INTELIGENTE</p>
          </div>

          <h1 className="login-title">Entrar</h1>
          <p className="login-subtitle mb-6 mt-1">Use o e-mail e a senha que o hotel cadastrou para você.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-[18px]" noValidate>
            {serverError && (
              <Notice tone="error" className="rounded-lg">
                {serverError}
              </Notice>
            )}

            {/* Campos de @hotel/ui (T-08.2): alvo de toque, foco visível e erro por aria-invalid já vêm prontos. */}
            <Field
              label={
                <span className="login-label">
                  <Mail aria-hidden="true" className={LABEL_ICON} strokeWidth={1.8} />
                  E-mail
                </span>
              }
              htmlFor="login-email"
              error={errors.email?.message}
            >
              <Input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="username"
                placeholder="Digite seu e-mail"
                className="login-input"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
            </Field>

            {/*
              Senha sem o Field: ele envolve o controle num <label>, e o olho da senha dentro do
              label faria o campo ser anunciado "Senha Mostrar senha" (🟡1 do red team). Mesma
              estrutura do Field, com o label só no texto.
            */}
            <div className="space-y-1">
              <label htmlFor="login-senha" className="block text-sm font-medium">
                <span className="login-label">
                  <Lock aria-hidden="true" className={LABEL_ICON} strokeWidth={1.8} />
                  Senha
                </span>
              </label>
              <PasswordInput
                id="login-senha"
                autoComplete="current-password"
                placeholder="Digite sua senha"
                className="login-input"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'login-senha-erro' : undefined}
                {...register('password')}
              />
              {errors.password && (
                <span id="login-senha-erro" role="alert" className="login-field-error block text-sm">
                  {errors.password.message}
                </span>
              )}
            </div>

            {needsSubdomain && (
              <Field label={<span className="login-label">Subdomínio do hotel</span>} htmlFor="login-subdominio" error={errors.subdomain?.message}>
                <Input id="login-subdominio" type="text" placeholder="ex.: paraiso" className="login-input" {...register('subdomain')} />
              </Field>
            )}

            <Button type="submit" block disabled={isSubmitting} className="login-submit mt-1.5">
              <LogIn aria-hidden="true" className="size-5" strokeWidth={2} />
              {isSubmitting ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}

/** Faixa verde de canto (decorativa). As cores dos stops vêm do login.css, por token. */
function Swoosh({ position }: { position: 'top' | 'bottom' }) {
  const top = position === 'top';
  // useId: o id do gradiente é global no documento; dois logins montados não podem dividir o mesmo.
  const id = `login-swoosh-${position}-${useId().replace(/:/g, '')}`;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 600 400"
      preserveAspectRatio={top ? 'xMinYMin meet' : 'xMaxYMax meet'}
      className={`login-swoosh login-swoosh--${position}`}
    >
      <defs>
        <linearGradient id={id} x1={top ? 0 : 1} y1={top ? 1 : 0} x2={top ? 1 : 0} y2={top ? 0 : 1}>
          <stop offset="0" className="login-swoosh-stop-deep" />
          <stop offset="0.6" className="login-swoosh-stop-mid" />
          <stop offset="1" className="login-swoosh-stop-tip" />
        </linearGradient>
      </defs>
      <path
        d={top ? 'M -40 330 C 60 150, 230 40, 560 -30' : 'M 640 70 C 540 250, 370 360, 40 430'}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="26"
        strokeLinecap="round"
      />
      <path
        d={top ? 'M -40 380 C 90 200, 260 80, 600 10' : 'M 640 20 C 510 210, 340 330, 0 390'}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}
