/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}',
    './preview/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07090e',
          900: '#0b0f16',
          850: '#10151e',
          800: '#151b26',
          700: '#1f2735',
          600: '#2c3647',
          500: '#465267',
          400: '#6b7890',
          300: '#98a3b8',
          200: '#c6cedc',
          100: '#e8ecf3',
        },
        gold: '#e8b94a',
        neon: {
          cyan: '#2ee6d6',
          pink: '#ff4fa3',
          violet: '#9d7bff',
          amber: '#ffc15e',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Unbounded', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'Figtree', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(46,230,214,.35), 0 8px 30px -8px rgba(46,230,214,.45)',
        pinkglow: '0 8px 30px -10px rgba(255,79,163,.6)',
      },
      keyframes: {
        pulsebar: {
          '0%,100%': { transform: 'scaleY(.35)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        pulsebar: 'pulsebar 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
