import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * O tailwind-merge precisa conhecer a escala de tipografia do preset (T-08.1). Sem isto, ele
 * toma `text-support` por cor e o `text-gray-600` seguinte apaga o tamanho.
 * A lista é a mesma de `fontSize` em packages/config/tailwind-preset.js.
 */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['title', 'section', 'body', 'support', 'figure', 'wordmark', 'wordmark-tag', 'overline'] }] } },
});

/** Junta classes condicionais e resolve conflitos do Tailwind (a última vence). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
