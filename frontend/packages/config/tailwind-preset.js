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
      // Compacto só com mouse (estudo de responsividade da SPEC-10, R-3): a partir do xl E com
      // ponteiro fino. Um tablet de 1280 px deitado é usado com o dedo e fica com os 48 px.
      desk: { raw: '(min-width: 1280px) and (pointer: fine)' },
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
        // Marca por variável CSS (T-08.1): o valor mora em @hotel/ui/tokens.css, para cada hotel
        // poder ter a sua. `brand` significa "faça isto" (GUIA_UI_CORPORATIVA, regra 2).
        brand: {
          DEFAULT: 'rgb(var(--color-brand) / <alpha-value>)',
          fg: 'rgb(var(--color-brand-fg) / <alpha-value>)',
        },
        // Barra lateral e fundo (SPEC-10, T-10.4): também por token, para cada hotel poder trocar.
        nav: {
          DEFAULT: 'rgb(var(--color-nav) / <alpha-value>)',
          fg: 'rgb(var(--color-nav-fg) / <alpha-value>)',
          muted: 'rgb(var(--color-nav-muted) / <alpha-value>)',
          active: 'rgb(var(--color-nav-active) / <alpha-value>)',
          accent: 'rgb(var(--color-nav-accent) / <alpha-value>)',
          strong: 'rgb(var(--color-nav-strong) / <alpha-value>)',
        },
        ground: 'rgb(var(--color-ground) / <alpha-value>)',
        strip: {
          from: 'rgb(var(--color-strip-from) / <alpha-value>)',
          to: 'rgb(var(--color-strip-to) / <alpha-value>)',
        },
      },
      fontFamily: {
        // Uma família (Inter) para todo o produto. "Inter Variable" é o nome que o
        // @fontsource-variable/inter registra: a fonte vai no bundle do app, sem Google Fonts,
        // e funciona com a rede bloqueada (CA-08.b). As outras ficam só de reserva.
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Escala do GUIA_UI_CORPORATIVA §4 (T-08.1). Apoio nunca abaixo de 12 px.
        title: ['20px', { lineHeight: '28px', fontWeight: '600' }], // título da página
        section: ['14px', { lineHeight: '20px', fontWeight: '600' }], // título de seção
        body: ['14px', { lineHeight: '20px' }], // corpo (formulário no celular usa text-base, 16 px)
        support: ['12px', { lineHeight: '16px' }], // apoio
        figure: ['24px', { lineHeight: '32px', fontWeight: '600' }], // valor de destaque, com tabular-nums
        // Marca na barra lateral e rótulo de grupo (SPEC-10, T-10.4; audit do Impeccable de 22/11).
        // Fora da escala de leitura de propósito: são elementos de identidade, não texto corrido.
        wordmark: ['23px', { lineHeight: '28px', fontWeight: '800', letterSpacing: '0.03em' }], // GESWAY
        'wordmark-tag': ['10.5px', { lineHeight: '15px', letterSpacing: '0.08em' }], // GESTÃO HOTELEIRA
        overline: ['11px', { lineHeight: '16px', fontWeight: '600', letterSpacing: '0.12em' }], // OPERAÇÃO, GESTÃO
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
