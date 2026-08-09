/** @type {import('tailwindcss').Config} */
// Tokens extraidos literalmente do :root do prototipo (_prototipo/GTPORTE.dc.html)
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F5F3EE',
        surface: '#FFFFFF',
        ink: '#1B1D1E',
        muted: '#6B7570',
        soft: '#8B948E',
        line: '#EEEAE0',
        edge: '#E5E1D6',
        primary: { DEFAULT: '#1F3A2E', hover: '#152820', fg: '#F5F3EE' },
        accent: '#C4633A',
        success: '#2E7D5A',
        warn: '#B8862B',
        danger: '#9E3E3E',
        tint: '#EEF1EF',
        // fundos de badge usados no prototipo
        'bg-success': '#EAF3EC',
        'bg-warn': '#FBEEDA',
        'bg-danger': '#FBECEC',
        'bg-accent': '#F4EAE1',
        'fg-warn': '#8A5A15',
        panel: '#FBF9F3',
      },
      fontFamily: {
        sans: ['Sohne', '"Helvetica Neue"', 'Helvetica', 'Arial', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': '10px',
        '3xs': '9.5px',
      },
      borderRadius: {
        card: '11px',
        field: '7px',
        btn: '8px',
      },
    },
  },
  plugins: [],
}
