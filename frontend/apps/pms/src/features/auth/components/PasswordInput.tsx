import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button, Input, cn, type InputProps } from '@hotel/ui';
import { passwordToggle } from '../passwordToggle.js';

/**
 * Senha com o olho de mostrar/ocultar (T-10.1, SPEC-10 §3): reduz erro de digitação no balcão.
 * Nasce local, no login; sobe para o @hotel/ui no segundo uso (packages/ui/CATALOGO.md).
 *
 * O ref vai para o <input>, para o `register` do react-hook-form continuar funcionando.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'> & { id: string }>(
  ({ className, id, ...props }, ref) => {
    const [shown, setShown] = useState(false);
    const toggle = passwordToggle(shown);
    const Icon = shown ? EyeOff : Eye;
    return (
      <div className="relative">
        <Input ref={ref} id={id} type={toggle.type} className={cn('login-input--with-toggle', className)} {...props} />
        <Button
          type="button"
          variant="ghost"
          className="login-toggle"
          aria-label={toggle.label}
          aria-pressed={toggle.pressed}
          aria-controls={id}
          onClick={() => setShown((v) => !v)}
        >
          <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </Button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';
