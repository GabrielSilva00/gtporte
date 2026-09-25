// As cores do app saem de variaveis CSS (src/index.css) para o tema claro
// trocar tudo de uma vez. "white" e a cor do texto: branca no escuro e
// quase preta no claro, entao text-white/50, bg-white/5 etc. se ajustam
// sozinhos. gold.ink e o texto sobre o dourado, igual nos dois temas.
const v = (nome) => `rgb(var(--${nome}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        white: v('ink'),
        navy: { 900: v('navy-900'), 800: v('navy-800'), 700: v('navy-700') },
        gold: { 400: v('gold-400'), 500: v('gold-500'), ink: '#0F172A' },
        emerald: { 400: v('emerald-400'), 500: v('emerald-500') },
        blue: { 400: v('blue-400'), 500: v('blue-500') },
        rose: { 400: v('rose-400'), 500: v('rose-500') },
        amber: { 400: v('amber-400'), 500: v('amber-500') },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
