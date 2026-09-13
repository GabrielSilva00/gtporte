/**
 * Tema claro/escuro do app do estudante.
 * As cores saem de variaveis CSS definidas em src/index.css, uma vez para
 * cada tema. O formato "rgb(var(--x) / <alpha-value>)" e o que permite
 * continuar usando opacidade do Tailwind (text-muted/60, bg-brand-500/10).
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        base: 'rgb(var(--c-base) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',
        brand: {
          500: 'rgb(var(--c-brand) / <alpha-value>)',
          600: 'rgb(var(--c-brand-strong) / <alpha-value>)',
        },
        ok: 'rgb(var(--c-ok) / <alpha-value>)',
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
        err: 'rgb(var(--c-err) / <alpha-value>)',
        info: 'rgb(var(--c-info) / <alpha-value>)',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 2px rgb(var(--c-shadow) / 0.06), 0 4px 16px rgb(var(--c-shadow) / 0.04)',
        lift: '0 4px 12px rgb(var(--c-shadow) / 0.10), 0 12px 32px rgb(var(--c-shadow) / 0.08)',
      },
    },
  },
  plugins: [],
}
