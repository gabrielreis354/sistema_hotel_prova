import type { ReactNode } from 'react';

export interface FieldProps {
  label: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}

/** Rótulo + controle + mensagem de erro. Todo erro diz o que fazer, não só que falhou (§10). */
export function Field({ label, error, htmlFor, children }: FieldProps) {
  return (
    <label htmlFor={htmlFor} className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
      {error && (
        <span role="alert" className="block text-sm text-status-maintenance">
          {error}
        </span>
      )}
    </label>
  );
}
