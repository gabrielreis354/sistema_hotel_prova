/**
 * Preset compartilhado do Tailwind — a fonte única dos tokens do design system (§10 do plano).
 *
 * Cada app importa este preset em vez de redefinir cores/breakpoints. Assim a cor de "Ocupado"
 * é a mesma no rack (desktop) e na comanda (mobile), e mudar um token propaga para tudo.
 *
 * @type {import('tailwindcss').Config}
 */
const preset = {
  theme: {
    // Breakpoints do plano §10 — sm 640, md 768, lg 1024, xl 1280.
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        // Estados de quarto/reserva. Cor NUNCA é o único sinal — sempre acompanha
        // ícone/label na UI (acessibilidade). Aqui ficam só os valores.
        status: {
          free: '#6b7280', // Livre        — cinza
          booked: '#2563eb', // Reservado   — azul
          occupied: '#16a34a', // Ocupado   — verde
          cleaning: '#d97706', // Limpeza   — âmbar
          maintenance: '#dc2626', // Manutenção — vermelho
        },
        brand: {
          DEFAULT: '#0f766e', // teal — identidade do produto
          fg: '#ffffff',
        },
      },
      fontFamily: {
        // Uma família (Inter) para todo o produto.
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontVariantNumeric: {
        // Números tabulares em valores monetários e no rack (alinhamento de colunas).
        tabular: 'tabular-nums',
      },
      spacing: {
        // Alvo de toque mínimo no mobile (§10): 48×48px.
        touch: '48px',
      },
      minHeight: {
        touch: '48px',
      },
      minWidth: {
        touch: '48px',
      },
    },
  },
};

export default preset;
