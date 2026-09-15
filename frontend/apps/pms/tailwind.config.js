import preset from '@hotel/config/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  // Escaneia o app E o design system compartilhado — senão as classes usadas nos
  // componentes de @hotel/ui somem no purge do build.
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};
